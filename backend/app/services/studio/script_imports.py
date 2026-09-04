"""Persistence service for reviewable script imports."""

from __future__ import annotations

import hashlib
import uuid

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import storage
from app.models.studio import Chapter, FileItem, FileType, Project, ScriptImport
from app.schemas.studio.script_imports import ScriptImportCommitResult, ScriptImportReviewUpdate
from app.services.common import entity_not_found, get_or_404
from app.services.studio.script_import_parser import parse_script_document


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


async def get_script_import(db: AsyncSession, import_id: str) -> ScriptImport:
    return await get_or_404(db, ScriptImport, import_id, detail=entity_not_found("ScriptImport"))


async def list_script_imports(db: AsyncSession, *, project_id: str) -> list[ScriptImport]:
    result = await db.execute(
        select(ScriptImport)
        .where(ScriptImport.project_id == project_id)
        .order_by(ScriptImport.created_at.desc())
    )
    return list(result.scalars().all())


async def update_script_import_review(
    db: AsyncSession, *, import_id: str, body: ScriptImportReviewUpdate
) -> ScriptImport:
    obj = await get_script_import(db, import_id)
    if obj.status == "committed":
        raise HTTPException(status_code=409, detail="已提交的导入批次不可修改预览选择")
    obj.review_state = body.review_state
    await db.flush()
    await db.refresh(obj)
    return obj


async def commit_script_import(
    db: AsyncSession,
    *,
    import_id: str,
    selected_chapter_indexes: list[int],
    chapter_overrides: dict[str, object] | None = None,
) -> ScriptImportCommitResult:
    """Atomically materialize reviewed chapters; repeated submission is harmless."""

    obj = await get_script_import(db, import_id)
    if obj.status == "committed":
        previous = dict(obj.commit_result or {})
        return ScriptImportCommitResult(import_id=obj.id, reused=True, **{
            key: value for key, value in previous.items() if key in {"chapter_ids", "created_count"}
        })

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

    result = ScriptImportCommitResult(
        import_id=obj.id, chapter_ids=chapter_ids, created_count=len(chapter_ids), reused=False
    )
    obj.review_state = {
        **dict(obj.review_state or {}),
        "selected_chapter_indexes": selected,
        "chapter_overrides": {
            str(key): value.model_dump(mode="json", exclude_none=True)
            if hasattr(value, "model_dump") else dict(value or {})
            for key, value in overrides.items()
        },
    }
    obj.commit_result = result.model_dump(mode="json", exclude={"reused"})
    obj.status = "committed"
    await db.flush()
    return result
