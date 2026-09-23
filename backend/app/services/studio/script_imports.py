"""Persistence service for reviewable script imports."""

from __future__ import annotations

import hashlib
import uuid
import re
from difflib import SequenceMatcher

from fastapi import HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core import storage
from app.core.integrations.video_capabilities import resolve_video_capability
from app.models.llm import Model, ModelCategoryKey, Provider
from app.models.task import GenerationTask, GenerationTaskStatus
from app.models.task_links import GenerationTaskLink
from app.models.studio import (
    Actor,
    Chapter,
    Character,
    Costume,
    FileItem,
    FileType,
    Project,
    ProjectActorLink,
    ProjectCostumeLink,
    ProjectPropLink,
    ProjectSceneLink,
    Prop,
    Scene,
    ScriptImport,
    Shot,
    ShotCharacterLink,
    ShotDetail,
    ShotDialogLine,
    ShotExtractedCandidate,
)
from app.schemas.studio.script_imports import (
    ScriptImportCommitResult,
    ScriptImportEntityMatch,
    ScriptImportMatchesRead,
    ScriptImportMediaPlanItem,
    ScriptImportMediaPlanRead,
    ScriptImportReviewUpdate,
)
from app.schemas.skills.script_import_analysis import ScriptImportAnalysisResult, ScriptImportValidation
from app.services.common import entity_not_found, get_or_404
from app.services.llm.provider_registry import resolve_provider_key
from app.services.studio.script_import_parser import parse_script_document


SCRIPT_IMPORT_ANALYSIS_RELATION_TYPE = "script_import_analysis"


def sanitize_script_import_analysis(
    analysis: ScriptImportAnalysisResult, parsed_document: dict
) -> ScriptImportAnalysisResult:
    """Reject hallucinated evidence and add deterministic timeline diagnostics."""

    blocks = {
        str(block.get("id")): str(block.get("clean_text") or "")
        for block in parsed_document.get("blocks") or []
        if block.get("id")
    }
    chapter_indexes = {
        int(chapter.get("index"))
        for chapter in parsed_document.get("chapters") or []
        if chapter.get("index") is not None
    }
    warnings = list(analysis.warnings)

    def valid_evidence(items: list) -> list:
        valid = []
        for evidence in items:
            source = blocks.get(evidence.block_id)
            quote = evidence.quote.strip()
            if source is not None and quote and quote in source:
                valid.append(evidence)
        return valid

    brief_evidence_count = len(analysis.project_brief.evidence)
    analysis.project_brief.evidence = valid_evidence(analysis.project_brief.evidence)
    if brief_evidence_count and not analysis.project_brief.evidence:
        warnings.append("项目设定缺少有效原文证据，请仅作建议使用")

    entities = []
    for candidate in analysis.entities:
        candidate.evidence = valid_evidence(candidate.evidence)
        if candidate.evidence:
            entities.append(candidate)
        else:
            warnings.append(f"候选 {candidate.candidate_id} 缺少有效原文证据，已阻止进入审查草稿")

    shots = []
    for candidate in analysis.shots:
        candidate.evidence = valid_evidence(candidate.evidence)
        if candidate.chapter_index in chapter_indexes and candidate.evidence:
            shots.append(candidate)
        else:
            warnings.append(f"镜头 {candidate.candidate_id} 的章节或证据无效，已移除")

    audio = []
    for candidate in analysis.audio:
        candidate.evidence = valid_evidence(candidate.evidence)
        chapter_valid = candidate.chapter_index is None or candidate.chapter_index in chapter_indexes
        if chapter_valid and candidate.evidence:
            audio.append(candidate)
        else:
            warnings.append(f"音频 {candidate.candidate_id} 的章节或证据无效，已移除")

    validation = list(analysis.validation)
    parsed_by_index = {
        int(chapter["index"]): chapter for chapter in parsed_document.get("chapters") or []
    }
    for chapter_index, chapter in parsed_by_index.items():
        target = chapter.get("target_duration_seconds")
        durations = [shot.duration_seconds for shot in shots if shot.chapter_index == chapter_index]
        if target and durations and all(duration is not None for duration in durations):
            actual = sum(float(duration or 0) for duration in durations)
            if abs(actual - float(target)) > 0.5:
                validation.append(
                    ScriptImportValidation(
                        code="shot_duration_mismatch",
                        severity="warning",
                        message=f"第 {chapter_index} 章目标 {target} 秒，镜头候选合计 {actual:g} 秒",
                        candidate_ids=[shot.candidate_id for shot in shots if shot.chapter_index == chapter_index],
                    )
                )
    analysis.entities = entities
    analysis.shots = shots
    analysis.audio = audio
    analysis.validation = validation
    analysis.warnings = list(dict.fromkeys(warnings))
    return analysis


async def create_script_import(db: AsyncSession, *, project_id: str, file_id: str) -> ScriptImport:
    await get_or_404(db, Project, project_id, detail=entity_not_found("Project"))
    file_item = await get_or_404(db, FileItem, file_id, detail=entity_not_found("File"))
    if file_item.type != FileType.document:
        raise HTTPException(status_code=422, detail="剧本导入仅支持文档文件")
    if file_item.size_bytes and file_item.size_bytes > 25 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="剧本文件超过 25MB 导入限制")

    content = await storage.download_file(key=file_item.storage_key)
    content_hash = file_item.checksum or hashlib.sha256(content).hexdigest()
    parsed = parse_script_document(content, file_item.original_name or file_item.name)
    existing = (
        await db.execute(
            select(ScriptImport).where(
                ScriptImport.project_id == project_id,
                ScriptImport.content_hash == content_hash,
                ScriptImport.parser_version == parsed.parser_version,
            )
        )
    ).scalars().first()
    if existing is not None:
        return existing

    obj = ScriptImport(
        id=str(uuid.uuid4()),
        project_id=project_id,
        file_id=file_id,
        status="parsed",
        is_saved=False,
        source_format=parsed.source_format,
        content_hash=content_hash,
        parser_version=parsed.parser_version,
        document_profile=parsed.document_profile,
        parse_result=parsed.model_dump(mode="json"),
        review_state={
            "selected_chapter_indexes": [chapter.index for chapter in parsed.chapters],
            "candidate_decisions": {},
        },
    )
    db.add(obj)
    await db.flush()
    await db.refresh(obj)
    return obj


async def _latest_script_import_analysis_task(
    db: AsyncSession, *, import_id: str
) -> GenerationTask | None:
    """读取导入批次最近一次深度分析任务，供业务状态与通用任务状态对账。"""

    stmt = (
        select(GenerationTask)
        .join(GenerationTaskLink, GenerationTaskLink.task_id == GenerationTask.id)
        .where(
            GenerationTaskLink.relation_type == SCRIPT_IMPORT_ANALYSIS_RELATION_TYPE,
            GenerationTaskLink.relation_entity_id == import_id,
        )
        .order_by(GenerationTask.updated_at.desc(), GenerationTask.id.desc())
        .limit(1)
    )
    return (await db.execute(stmt)).scalars().first()


async def reconcile_script_import_analysis_state(
    db: AsyncSession, *, script_import: ScriptImport
) -> ScriptImport:
    """修复任务已结束而导入批次仍卡在 analyzing 的跨域状态不一致。"""

    if script_import.status != "analyzing":
        return script_import
    task = await _latest_script_import_analysis_task(db, import_id=script_import.id)
    if task is None:
        return script_import
    status_value = task.status.value if hasattr(task.status, "value") else str(task.status)
    if status_value == GenerationTaskStatus.cancelled.value:
        script_import.status = "parsed"
        script_import.error_message = "AI 深度分析已取消，可重新发起"
    elif status_value == GenerationTaskStatus.failed.value:
        script_import.status = "failed"
        script_import.error_message = task.error or "AI 深度分析失败，任务未记录具体原因"
    elif status_value == GenerationTaskStatus.succeeded.value:
        # 正常成功会由 Worker 同一事务写入 ready；出现此状态说明结果投影中断，
        # 明确暴露一致性问题，避免页面无限等待。
        script_import.status = "failed"
        script_import.error_message = "AI 深度分析任务已完成，但结果未写入导入草稿，请重新分析"
    else:
        return script_import
    await db.flush()
    # updated_at 由数据库 on-update 生成，flush 后属性会过期；显式刷新避免
    # Pydantic 在异步响应序列化时触发 MissingGreenlet 的隐式 IO。
    await db.refresh(script_import)
    return script_import


async def reconcile_cancelled_script_import_task(
    db: AsyncSession, *, task_id: str
) -> None:
    """任务中心即时取消成功后，同步释放对应剧本导入批次。"""

    link = (
        await db.execute(
            select(GenerationTaskLink).where(
                GenerationTaskLink.task_id == task_id,
                GenerationTaskLink.relation_type == SCRIPT_IMPORT_ANALYSIS_RELATION_TYPE,
            )
        )
    ).scalars().first()
    if link is None:
        return
    script_import = await db.get(ScriptImport, link.relation_entity_id)
    if script_import is None or script_import.status != "analyzing":
        return
    script_import.status = "parsed"
    script_import.error_message = "AI 深度分析已取消，可重新发起"
    await db.flush()
    await db.refresh(script_import)


async def get_script_import(db: AsyncSession, import_id: str) -> ScriptImport:
    """读取导入批次，并对账异步分析终态，自动恢复历史卡死记录。"""

    obj = await get_or_404(db, ScriptImport, import_id, detail=entity_not_found("ScriptImport"))
    return await reconcile_script_import_analysis_state(db, script_import=obj)


async def list_script_imports(
    db: AsyncSession,
    *,
    project_id: str,
    page: int,
    page_size: int,
) -> tuple[list[ScriptImport], int]:
    """分页读取项目导入摘要所需记录，并预加载原始文件名称。"""

    total = int(
        await db.scalar(
            select(func.count()).select_from(ScriptImport).where(
                ScriptImport.project_id == project_id,
                or_(ScriptImport.is_saved.is_(True), ScriptImport.status == "committed"),
            )
        )
        or 0
    )
    result = await db.execute(
        select(ScriptImport)
        .options(selectinload(ScriptImport.file))
        .where(
            ScriptImport.project_id == project_id,
            or_(ScriptImport.is_saved.is_(True), ScriptImport.status == "committed"),
        )
        .order_by(ScriptImport.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    return list(result.scalars().all()), total


async def delete_script_import_draft(db: AsyncSession, *, import_id: str) -> None:
    """删除未提交导入草稿；保留原始文件、任务审计和已导入业务数据。"""

    obj = await get_script_import(db, import_id)
    if obj.status == "committed":
        raise HTTPException(status_code=409, detail="已导入记录用于审计，不能作为草稿删除")
    if obj.status == "analyzing":
        raise HTTPException(status_code=409, detail="AI 深度分析正在运行，请等待结束或先取消任务")
    await db.delete(obj)
    await db.flush()


async def update_script_import_review(
    db: AsyncSession, *, import_id: str, body: ScriptImportReviewUpdate
) -> ScriptImport:
    obj = await get_script_import(db, import_id)
    if obj.status == "committed":
        raise HTTPException(status_code=409, detail="已提交的导入批次不可修改预览选择")
    obj.review_state = body.review_state
    obj.is_saved = True
    await db.flush()
    await db.refresh(obj)
    return obj


_ENTITY_MODELS = {
    "actor": Actor,
    "character": Character,
    "scene": Scene,
    "prop": Prop,
    "costume": Costume,
}


def _normalized_entity_name(value: str) -> str:
    return re.sub(r"[\s·•._—-]+", "", value).casefold()


async def find_script_import_matches(db: AsyncSession, *, import_id: str) -> ScriptImportMatchesRead:
    obj = await get_script_import(db, import_id)
    candidates = list((obj.analysis_result or {}).get("entities") or [])
    rows_by_type: dict[str, list] = {}
    for entity_type, model in _ENTITY_MODELS.items():
        stmt = select(model)
        if entity_type == "character":
            stmt = stmt.where(Character.project_id == obj.project_id)
        rows_by_type[entity_type] = list((await db.execute(stmt)).scalars().all())

    matches: dict[str, list[ScriptImportEntityMatch]] = {}
    for candidate in candidates:
        entity_type = str(candidate.get("entity_type") or "")
        candidate_id = str(candidate.get("candidate_id") or "")
        name = str(candidate.get("name") or "")
        normalized = _normalized_entity_name(name)
        scored: list[ScriptImportEntityMatch] = []
        for row in rows_by_type.get(entity_type, []):
            score = SequenceMatcher(None, normalized, _normalized_entity_name(row.name)).ratio()
            if score >= 0.55:
                scored.append(
                    ScriptImportEntityMatch(
                        entity_id=row.id,
                        entity_type=entity_type,
                        name=row.name,
                        score=round(score, 3),
                    )
                )
        matches[candidate_id] = sorted(scored, key=lambda item: item.score, reverse=True)[:5]
    return ScriptImportMatchesRead(matches=matches)


def _plan_duration_segments(requested: float | None, *, allowed: set[int] | None, minimum: int | None, maximum: int | None) -> tuple[list[int], list[str]]:
    warnings: list[str] = []
    target = int(round(requested or 0))
    if allowed:
        choices = sorted(value for value in allowed if value > 0)
        if not choices:
            return [], ["模型未声明可用片段时长"]
        if target <= 0:
            return [choices[0]], [f"镜头未提供时长，暂按模型最短 {choices[0]} 秒规划"]
        max_total = target + max(choices)
        best: list[int] | None = None
        plans: dict[int, list[int]] = {0: []}
        for total in range(1, max_total + 1):
            candidates = [plans[total - value] + [value] for value in choices if total >= value and total - value in plans]
            if candidates:
                plans[total] = min(candidates, key=len)
        if plans:
            _, best = min(
                ((abs(total - target), parts) for total, parts in plans.items() if total > 0),
                key=lambda item: (item[0], len(item[1])),
            )
        segments = best or [choices[0]]
    else:
        low = max(1, minimum or 1)
        high = max(low, maximum or max(low, target or low))
        if target <= 0:
            return [low], [f"镜头未提供时长，暂按模型最短 {low} 秒规划"]
        count = max(1, (target + high - 1) // high)
        base = max(low, int(round(target / count)))
        segments = [min(high, base)] * count
    planned_total = sum(segments)
    if planned_total != target and target > 0:
        warnings.append(f"原建议 {target} 秒，按模型能力调整为 {'+'.join(map(str, segments))}={planned_total} 秒")
    return segments, warnings


async def plan_script_import_media(
    db: AsyncSession, *, import_id: str, model_id: str
) -> ScriptImportMediaPlanRead:
    """Project semantic shot durations onto one configured video model without generating media."""

    obj = await get_script_import(db, import_id)
    model = await db.get(Model, model_id)
    if model is None or model.category != ModelCategoryKey.video:
        raise HTTPException(status_code=422, detail="请选择有效的视频模型")
    provider = await get_or_404(db, Provider, model.provider_id, detail=entity_not_found("Provider"))
    provider_key = resolve_provider_key(provider)
    capability = resolve_video_capability(provider=provider_key, model=model.name)  # type: ignore[arg-type]
    items: list[ScriptImportMediaPlanItem] = []
    for shot in (obj.analysis_result or {}).get("shots") or []:
        requested = shot.get("duration_seconds")
        segments, warnings = _plan_duration_segments(
            float(requested) if requested is not None else None,
            allowed=capability.allowed_seconds,
            minimum=capability.min_seconds,
            maximum=capability.max_seconds,
        )
        items.append(
            ScriptImportMediaPlanItem(
                candidate_id=str(shot.get("candidate_id") or ""),
                chapter_index=int(shot.get("chapter_index") or 0),
                shot_index=int(shot.get("index") or 0),
                requested_seconds=requested,
                segment_seconds=segments,
                warnings=warnings,
            )
        )
    return ScriptImportMediaPlanRead(
        model_id=model.id,
        model_name=model.name,
        provider_key=provider_key,
        allowed_ratios=sorted(capability.allowed_ratios or []),
        default_ratio=capability.default_ratio,
        supports_text_to_video=capability.supports_text_to_video,
        supports_first_frame=capability.supports_first_frame,
        supports_last_frame=capability.supports_last_frame,
        supports_subject_references=bool(
            capability.supports_subject_image_reference
            or capability.supports_subject_video_reference
            or capability.supports_subject_audio_reference
        ),
        items=items,
    )


async def _resolve_candidate_entity(
    db: AsyncSession,
    *,
    project: Project,
    import_id: str,
    candidate: dict,
    decision: object,
) -> object | None:
    entity_type = str(candidate.get("entity_type") or "")
    model = _ENTITY_MODELS.get(entity_type)
    if model is None:
        return None
    data = decision.model_dump(exclude_none=True) if hasattr(decision, "model_dump") else dict(decision or {})
    action = str(data.get("action") or "ignore")
    if action in {"ignore", "detail"}:
        return None
    if action == "link":
        entity_id = str(data.get("existing_entity_id") or "")
        row = await db.get(model, entity_id) if entity_id else None
        if row is None or (entity_type == "character" and row.project_id != project.id):
            raise HTTPException(status_code=422, detail=f"候选 {candidate.get('candidate_id')} 关联的已有资产无效")
        return row

    name = str(data.get("edited_name") or candidate.get("name") or "").strip()
    description = str(data.get("edited_description") or candidate.get("description") or "").strip()
    if not name:
        raise HTTPException(status_code=422, detail=f"候选 {candidate.get('candidate_id')} 名称不能为空")
    stmt = select(model).where(model.name == name)
    if entity_type == "character":
        stmt = stmt.where(Character.project_id == project.id)
    existing = (await db.execute(stmt)).scalars().first()
    if existing is not None:
        return existing

    entity_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"jellyfish:{import_id}:{entity_type}:{candidate.get('candidate_id')}"))
    common = {
        "id": entity_id,
        "name": name[:255],
        "description": description,
        "style": project.style,
        "visual_style": project.visual_style,
    }
    row = model(project_id=project.id, **common) if entity_type == "character" else model(
        view_count=1, tags=["剧本导入"], **common
    )
    db.add(row)
    await db.flush()
    from app.services.studio.creative_direction import read_direction, write_direction
    from app.core.contracts.creative_direction import CreativeWrite, CreativeFields
    creative = await read_direction(db,'project',project.id)
    fields = {} if entity_type == 'character' else {key:value for key,value in creative.effective.items() if key!='general_rules'}
    await write_direction(db,entity_type,row.id,CreativeWrite(expected_revision=0,overrides=CreativeFields.model_validate(fields)),
        provenance={'method':'project_copy','project_id':project.id,'fingerprint':creative.fingerprint})
    return row


async def _link_global_entity_to_project(
    db: AsyncSession, *, project_id: str, entity_type: str, entity_id: str
) -> None:
    specs = {
        "actor": (ProjectActorLink, "actor_id"),
        "scene": (ProjectSceneLink, "scene_id"),
        "prop": (ProjectPropLink, "prop_id"),
        "costume": (ProjectCostumeLink, "costume_id"),
    }
    spec = specs.get(entity_type)
    if spec is None:
        return
    model, field = spec
    exists = (
        await db.execute(
            select(model).where(
                model.project_id == project_id,
                getattr(model, field) == entity_id,
                model.chapter_id.is_(None),
                model.shot_id.is_(None),
            )
        )
    ).scalars().first()
    if exists is None:
        db.add(model(project_id=project_id, chapter_id=None, shot_id=None, **{field: entity_id}))


async def commit_script_import(
    db: AsyncSession,
    *,
    import_id: str,
    selected_chapter_indexes: list[int],
    chapter_overrides: dict[str, object] | None = None,
    candidate_decisions: dict[str, object] | None = None,
    include_shots: bool = False,
    include_audio_dialogue: bool = False,
    media_plan_model_id: str | None = None,
) -> ScriptImportCommitResult:
    """Atomically materialize reviewed chapters; repeated submission is harmless."""

    obj = await get_script_import(db, import_id)
    if obj.status == "committed":
        previous = dict(obj.commit_result or {})
        return ScriptImportCommitResult(import_id=obj.id, reused=True, **{
            key: value for key, value in previous.items()
            if key in {"chapter_ids", "created_count", "entity_ids", "shot_ids", "dialogue_line_ids"}
        })

    project = await get_or_404(db, Project, obj.project_id, detail=entity_not_found("Project"))

    parsed_chapters = list((obj.parse_result or {}).get("chapters") or [])
    available = {int(item["index"]): item for item in parsed_chapters}
    selected = list(dict.fromkeys(selected_chapter_indexes or sorted(available)))
    missing = [index for index in selected if index not in available]
    if missing:
        raise HTTPException(status_code=422, detail=f"导入批次中不存在章节序号: {missing}")
    if not selected:
        raise HTTPException(status_code=422, detail="请至少选择一个章节")

    max_index = int(
        (await db.execute(select(func.max(Chapter.index)).where(Chapter.project_id == obj.project_id))).scalar()
        or 0
    )
    chapter_ids: list[str] = []
    chapter_id_by_source: dict[int, str] = {}
    overrides = chapter_overrides or {}
    for offset, source_index in enumerate(selected, start=1):
        item = available[source_index]
        override = overrides.get(str(source_index))
        override_data = override.model_dump(exclude_none=True) if hasattr(override, "model_dump") else dict(override or {})
        title = str(override_data.get("title") or item.get("title") or f"第{max_index + offset}集").strip()
        screenplay_text = str(
            override_data.get("screenplay_text")
            if override_data.get("screenplay_text") is not None
            else item.get("screenplay_text") or ""
        ).strip()
        if not title:
            raise HTTPException(status_code=422, detail=f"第 {source_index} 个章节标题不能为空")
        if not screenplay_text:
            raise HTTPException(status_code=422, detail=f"第 {source_index} 个章节正文不能为空")
        chapter_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"jellyfish:{obj.id}:chapter:{source_index}"))
        existing = await db.get(Chapter, chapter_id)
        if existing is None:
            db.add(
                Chapter(
                    id=chapter_id,
                    project_id=obj.project_id,
                    index=max_index + offset,
                    title=title[:255],
                    summary=str(override_data.get("theme") or item.get("theme") or ""),
                    raw_text=screenplay_text,
                    condensed_text="",
                    storyboard_count=0,
                    status="draft",
                )
            )
        chapter_ids.append(chapter_id)
        chapter_id_by_source[source_index] = chapter_id

    analysis = dict(obj.analysis_result or {})
    decisions = candidate_decisions or {}
    entity_ids: dict[str, str] = {}
    entity_by_name: dict[tuple[str, str], object] = {}
    for candidate in analysis.get("entities") or []:
        candidate_id = str(candidate.get("candidate_id") or "")
        decision = decisions.get(candidate_id)
        if decision is None:
            continue
        row = await _resolve_candidate_entity(
            db,
            project=project,
            import_id=obj.id,
            candidate=candidate,
            decision=decision,
        )
        if row is None:
            continue
        entity_type = str(candidate.get("entity_type") or "")
        entity_ids[candidate_id] = row.id
        names = [str(candidate.get("name") or ""), *(candidate.get("aliases") or [])]
        for name in names:
            entity_by_name[(entity_type, _normalized_entity_name(name))] = row
        await _link_global_entity_to_project(
            db, project_id=project.id, entity_type=entity_type, entity_id=row.id
        )

    shot_ids: list[str] = []
    shot_by_source: dict[tuple[int, int], Shot] = {}
    if include_shots:
        project_brief = dict(analysis.get("project_brief") or {})
        brief_context = [
            str(project_brief.get("genre") or "").strip(),
            str(project_brief.get("visual_style") or "").strip(),
            *(str(item).strip() for item in (project_brief.get("narrative_rules") or [])[:5]),
        ]
        brief_context = [item for item in brief_context if item]
        raw_shots = list(analysis.get("shots") or [])
        media_segments: dict[str, list[int]] = {}
        if media_plan_model_id:
            plan = await plan_script_import_media(db, import_id=obj.id, model_id=media_plan_model_id)
            media_segments = {item.candidate_id: item.segment_seconds for item in plan.items}
        expanded_shots: list[dict] = []
        next_indexes: dict[int, int] = {}
        for original in sorted(
            raw_shots,
            key=lambda item: (int(item.get("chapter_index") or 0), int(item.get("index") or 0)),
        ):
            source_candidate_id = str(original.get("candidate_id") or "")
            segments = media_segments.get(source_candidate_id) or [
                max(1, int(round(float(original.get("duration_seconds") or 0))))
            ]
            chapter_index = int(original.get("chapter_index") or 0)
            for segment_number, segment_seconds in enumerate(segments, start=1):
                next_indexes[chapter_index] = next_indexes.get(chapter_index, 0) + 1
                expanded = dict(original)
                expanded["index"] = next_indexes[chapter_index]
                expanded["duration_seconds"] = segment_seconds
                expanded["source_shot_index"] = int(original.get("index") or 0)
                if len(segments) > 1:
                    expanded["candidate_id"] = f"{source_candidate_id}:segment:{segment_number}"
                    expanded["title"] = f"{original.get('title') or '镜头'}（片段 {segment_number}/{len(segments)}）"
                expanded_shots.append(expanded)

        for candidate in expanded_shots:
            source_chapter_index = int(candidate.get("chapter_index") or 0)
            chapter_id = chapter_id_by_source.get(source_chapter_index)
            if chapter_id is None:
                continue
            source_shot_index = int(candidate.get("index") or 0)
            original_shot_index = int(candidate.get("source_shot_index") or source_shot_index)
            candidate_id = str(candidate.get("candidate_id") or f"shot-{source_chapter_index}-{source_shot_index}")
            shot_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"jellyfish:{obj.id}:shot:{candidate_id}"))
            shot = await db.get(Shot, shot_id)
            scene_entity = entity_by_name.get(
                ("scene", _normalized_entity_name(str(candidate.get("scene") or "")))
            )
            shot_audio_cues = [
                item
                for item in analysis.get("audio") or []
                if int(item.get("chapter_index") or 0) == source_chapter_index
                and int(item.get("shot_index") or 1) == original_shot_index
            ]
            if shot is None:
                evidence_text = "\n".join(str(item.get("quote") or "") for item in candidate.get("evidence") or [])
                shot = Shot(
                    id=shot_id,
                    chapter_id=chapter_id,
                    index=source_shot_index,
                    title=str(candidate.get("title") or f"镜头 {source_shot_index}")[:255],
                    thumbnail="",
                    status="pending",
                    skip_extraction=False,
                    script_excerpt=evidence_text,
                )
                db.add(shot)
                duration = max(1, int(round(float(candidate.get("duration_seconds") or 0))))
                description_parts = [
                    str(candidate.get("scene") or ""),
                    str(candidate.get("action") or ""),
                    str(candidate.get("camera") or ""),
                ]
                hint = str(candidate.get("visual_prompt_hint") or "").strip()
                if hint:
                    description_parts.append(f"作者视觉提示（软参考）：{hint}")
                if brief_context:
                    description_parts.append(f"项目创作约束（软参考）：{'；'.join(brief_context)}")
                db.add(
                    ShotDetail(
                        id=shot_id,
                        camera_shot="MS",
                        angle="EYE_LEVEL",
                        movement="STATIC",
                        scene_id=scene_entity.id if scene_entity is not None else None,
                        duration=duration,
                        mood_tags=[],
                        atmosphere="",
                        follow_atmosphere=True,
                        has_bgm=any(item.get("audio_type") == "bgm" for item in analysis.get("audio") or []),
                        vfx_type="NONE",
                        vfx_note="",
                        description="\n".join(part for part in description_parts if part),
                        action_beats=[str(candidate.get("action") or "")] if candidate.get("action") else [],
                        audio_cues=shot_audio_cues,
                        first_frame_prompt="",
                        last_frame_prompt="",
                        key_frame_prompt="",
                    )
                )
            shot_ids.append(shot_id)
            shot_by_source.setdefault((source_chapter_index, original_shot_index), shot)

            candidate_names = {
                "character": list(candidate.get("character_names") or []),
                "prop": list(candidate.get("prop_names") or []),
                "costume": list(candidate.get("costume_names") or []),
                "scene": [str(candidate.get("scene") or "")],
            }
            for candidate_type, names in candidate_names.items():
                unique_names = list(dict.fromkeys(
                    str(name).strip() for name in names if str(name).strip()
                ))
                linked_character_index = 0
                for name in unique_names:
                    entity = entity_by_name.get((candidate_type, _normalized_entity_name(name)))
                    db.add(
                        ShotExtractedCandidate(
                            shot_id=shot_id,
                            candidate_type=candidate_type,
                            candidate_name=str(name)[:255],
                            candidate_status="linked" if entity is not None else "pending",
                            linked_entity_id=entity.id if entity is not None else None,
                            source="script_import",
                            payload={"import_id": obj.id, "candidate_id": candidate_id},
                        )
                    )
                    if candidate_type == "character" and entity is not None:
                        db.add(
                            ShotCharacterLink(
                                shot_id=shot_id,
                                character_id=entity.id,
                                index=linked_character_index,
                                note="剧本导入",
                            )
                        )
                        linked_character_index += 1
                    elif entity is not None and candidate_type in {"scene", "prop", "costume"}:
                        link_model, field = {
                            "scene": (ProjectSceneLink, "scene_id"),
                            "prop": (ProjectPropLink, "prop_id"),
                            "costume": (ProjectCostumeLink, "costume_id"),
                        }[candidate_type]
                        db.add(
                            link_model(
                                project_id=project.id,
                                chapter_id=chapter_id,
                                shot_id=shot_id,
                                **{field: entity.id},
                            )
                        )

    dialogue_lines: list[ShotDialogLine] = []
    if include_audio_dialogue and shot_by_source:
        for candidate in analysis.get("audio") or []:
            audio_type = str(candidate.get("audio_type") or "")
            if audio_type not in {"dialogue", "voiceover"}:
                continue
            chapter_index = int(candidate.get("chapter_index") or 0)
            shot_index = int(candidate.get("shot_index") or 1)
            shot = shot_by_source.get((chapter_index, shot_index))
            if shot is None:
                shot = next((value for (ch, _), value in shot_by_source.items() if ch == chapter_index), None)
            if shot is None:
                continue
            line = ShotDialogLine(
                shot_detail_id=shot.id,
                index=sum(1 for item in dialogue_lines if item.shot_detail_id == shot.id),
                text=str(candidate.get("text") or ""),
                line_mode="VOICE_OVER" if audio_type == "voiceover" else "DIALOGUE",
                speaker_name=candidate.get("speaker"),
                target_name=None,
            )
            db.add(line)
            dialogue_lines.append(line)

    await db.flush()

    result = ScriptImportCommitResult(
        import_id=obj.id,
        chapter_ids=chapter_ids,
        created_count=len(chapter_ids),
        entity_ids=entity_ids,
        shot_ids=shot_ids,
        dialogue_line_ids=[line.id for line in dialogue_lines],
        reused=False,
    )
    obj.review_state = {
        **dict(obj.review_state or {}),
        "selected_chapter_indexes": selected,
        "chapter_overrides": {
            str(key): value.model_dump(mode="json", exclude_none=True)
            if hasattr(value, "model_dump") else dict(value or {})
            for key, value in overrides.items()
        },
        "candidate_decisions": {
            key: value.model_dump(mode="json", exclude_none=True)
            if hasattr(value, "model_dump") else dict(value or {})
            for key, value in decisions.items()
        },
        "include_shots": include_shots,
        "include_audio_dialogue": include_audio_dialogue,
        "media_plan_model_id": media_plan_model_id,
    }
    obj.commit_result = result.model_dump(mode="json", exclude={"reused"})
    obj.status = "committed"
    await db.flush()
    return result
