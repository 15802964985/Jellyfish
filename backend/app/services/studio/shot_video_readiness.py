"""镜头视频生成准备度聚合服务。"""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.llm import Model, ModelCategoryKey, ModelConfigRevision, ModelSettings, Provider
from app.core.integrations.video_capabilities import resolve_video_capability
from app.models.studio import (
    Shot,
    ShotCandidateStatus,
    ShotDialogueCandidateStatus,
    ShotDetail,
    ShotExtractedCandidate,
    ShotExtractedDialogueCandidate,
    ShotFrameType,
    ShotFrameImage,
)
from app.models.task import GenerationTask, GenerationTaskStatus
from app.models.task_links import GenerationTaskLink
from app.schemas.studio.shots import ShotVideoReadinessCheck, ShotVideoReadinessRead
from app.services.common import entity_not_found
from app.services.studio.generation.video import (
    build_video_base_draft,
    build_video_context,
    derive_video_preview,
)


from app.services.studio.generation.video.build_context import REQUIRED_FRAMES_BY_MODE

_ACTIVE_TASK_STATUSES = (
    GenerationTaskStatus.pending,
    GenerationTaskStatus.running,
    GenerationTaskStatus.streaming,
)


def _check(key: str, ok: bool, message: str) -> ShotVideoReadinessCheck:
    return ShotVideoReadinessCheck(key=key, ok=ok, message=message)


async def _count_pending_candidates(db: AsyncSession, *, shot_id: str) -> tuple[int, int]:
    asset_stmt = (
        select(func.count(ShotExtractedCandidate.id))
        .where(ShotExtractedCandidate.shot_id == shot_id)
        .where(ShotExtractedCandidate.candidate_status == ShotCandidateStatus.pending)
    )
    dialogue_stmt = (
        select(func.count(ShotExtractedDialogueCandidate.id))
        .where(ShotExtractedDialogueCandidate.shot_id == shot_id)
        .where(ShotExtractedDialogueCandidate.candidate_status == ShotDialogueCandidateStatus.pending)
    )
    return int(await db.scalar(asset_stmt) or 0), int(await db.scalar(dialogue_stmt) or 0)


async def _has_active_video_task(db: AsyncSession, *, shot_id: str) -> bool:
    stmt = (
        select(func.count(GenerationTask.id))
        .select_from(GenerationTaskLink)
        .join(GenerationTask, GenerationTask.id == GenerationTaskLink.task_id)
        .where(GenerationTaskLink.resource_type == "video")
        .where(GenerationTaskLink.relation_type.in_(("video", "shot_video")))
        .where(GenerationTaskLink.relation_entity_id == shot_id)
        .where(GenerationTask.status.in_(_ACTIVE_TASK_STATUSES))
    )
    return bool(await db.scalar(stmt))


async def _reference_frames_ready(
    db: AsyncSession,
    *,
    shot_id: str,
    reference_mode: str,
) -> ShotVideoReadinessCheck:
    required_frames = REQUIRED_FRAMES_BY_MODE.get(reference_mode)
    if required_frames is None:
        return _check("reference_frames_ready", False, f"未知参考模式：{reference_mode}")
    if not required_frames:
        return _check("reference_frames_ready", True, "当前参考模式不需要参考帧")

    stmt = select(ShotFrameImage).where(
        ShotFrameImage.shot_detail_id == shot_id,
        ShotFrameImage.frame_type.in_(required_frames),
    )
    rows = (await db.execute(stmt)).scalars().all()
    frame_map = {row.frame_type: row for row in rows}
    missing = [frame.value for frame in required_frames if not frame_map.get(frame) or not frame_map[frame].file_id]
    if missing:
        return _check("reference_frames_ready", False, f"缺少参考帧：{', '.join(missing)}")
    return _check("reference_frames_ready", True, "参考帧已就绪")


async def _model_reference_mode_ready(db: AsyncSession, reference_mode: str, model_id: str | None = None, subject_image_count: int = 0) -> ShotVideoReadinessCheck:
    """Readiness must validate selected frame mode against the actual default model, not just file existence."""
    settings = await db.get(ModelSettings, 1)
    resolved_id = model_id or (settings.default_video_model_id if settings else None)
    model = await db.get(Model, resolved_id) if resolved_id else None
    revision = await db.get(ModelConfigRevision, model.current_revision_id) if model and model.current_revision_id else None
    if revision is None:
        return _check("model_reference_mode", False, "视频模型缺少可执行配置版本")
    cap = resolve_video_capability(provider=revision.provider_key, model=revision.model_name)
    frames = REQUIRED_FRAMES_BY_MODE.get(reference_mode)
    if frames is None:
        return _check("model_reference_mode", False, "未知参考模式")
    if cap.requires_first_frame and ShotFrameType.first not in frames:
        return _check("model_reference_mode", False, "该视频型号必须使用首帧，请先生成/上传镜头首帧并选择首帧模式")
    if reference_mode == 'subjects':
        from app.core.integrations.video_capabilities import supports_studio_subject_images
        verified = supports_studio_subject_images(revision.provider_key, revision.model_name)
        valid = verified and 0 < subject_image_count <= (cap.max_total_subject_images or 0)
        return _check('model_reference_mode', valid, '主体图片数量符合模型要求；提交前仍校验文件可用性' if valid else '请选择已核验的主体参考型号，并添加限额内的参考图片')
    if cap.requires_subject_reference:
        return _check("model_reference_mode", False, "该视频型号必须提供主体参考；当前镜头入口未提交主体素材，请使用支持该输入的入口")
    if not frames and not cap.supports_text_to_video:
        return _check("model_reference_mode", False, "当前型号不支持纯文本生成视频")
    if ShotFrameType.last in frames and not cap.supports_last_frame:
        return _check("model_reference_mode", False, "当前型号不支持尾帧，请改选支持的参考模式")
    if ShotFrameType.first in frames and not cap.supports_first_frame:
        return _check("model_reference_mode", False, "当前型号不支持首帧参考")
    if ShotFrameType.key in frames and cap.max_key_frames == 0:
        return _check("model_reference_mode", False, "当前型号不支持关键帧参考，请选择首帧或其他支持的模式")
    return _check("model_reference_mode", True, "参考模式符合当前视频型号要求")


async def _video_model_and_provider_ready(db: AsyncSession, model_id: str | None = None) -> tuple[ShotVideoReadinessCheck, ShotVideoReadinessCheck]:
    settings = await db.get(ModelSettings, 1)
    model_id = model_id or (settings.default_video_model_id if settings else None)
    if not model_id:
        return (
            _check("video_model_ready", False, "未配置默认视频模型"),
            _check("provider_ready", False, "未配置默认视频模型，无法检查供应商"),
        )
    model = await db.get(Model, model_id)
    if model is None:
        return (
            _check("video_model_ready", False, f"默认视频模型不存在：{model_id}"),
            _check("provider_ready", False, "默认视频模型不存在，无法检查供应商"),
        )
    if model.category != ModelCategoryKey.video:
        return (
            _check("video_model_ready", False, f"默认模型不是视频类别：{model_id}"),
            _check("provider_ready", False, "默认模型不是视频类别，无法检查供应商"),
        )
    revision = await db.get(ModelConfigRevision, model.current_revision_id) if model.current_revision_id else None
    if revision is None or revision.model_id != model.id or revision.category != ModelCategoryKey.video:
        return (
            _check("video_model_ready", False, "默认视频模型缺少可执行配置版本，请重新保存模型或执行修复迁移"),
            _check("provider_ready", False, "模型配置版本不可用，暂不提交付费任务"),
        )
    provider = await db.get(Provider, model.provider_id)
    if provider is None:
        return (
            _check("video_model_ready", True, "默认视频模型可用"),
            _check("provider_ready", False, f"视频模型供应商不存在：{model.provider_id}"),
        )
    if not (provider.api_key or "").strip():
        return (
            _check("video_model_ready", True, "默认视频模型可用"),
            _check("provider_ready", False, f"视频模型供应商缺少 api_key：{provider.id}"),
        )
    return (
        _check("video_model_ready", True, "默认视频模型可用"),
        _check("provider_ready", True, "视频模型供应商可用"),
    )


async def _duration_for_model(db: AsyncSession, duration: int, model_id: str | None) -> ShotVideoReadinessCheck:
    """A positive duration is insufficient when the selected model cannot generate that length."""
    settings = await db.get(ModelSettings, 1)
    resolved_id = model_id or (settings.default_video_model_id if settings else None)
    model = await db.get(Model, resolved_id) if resolved_id else None
    revision = await db.get(ModelConfigRevision, model.current_revision_id) if model and model.current_revision_id else None
    if not revision:
        return _check('duration_ready', duration > 0, '镜头时长已配置；需配置模型后核对上限' if duration > 0 else '请先配置镜头时长')
    cap = resolve_video_capability(provider=revision.provider_key, model=revision.model_name)
    ok = duration > 0 and (cap.min_seconds is None or duration >= cap.min_seconds) and (cap.max_seconds is None or duration <= cap.max_seconds) and (not cap.allowed_seconds or duration in cap.allowed_seconds)
    allowed = '/'.join(map(str, sorted(cap.allowed_seconds))) if cap.allowed_seconds else f'{cap.min_seconds or "?"}–{cap.max_seconds or "?"}'
    return _check('duration_ready', ok, f'本镜头 {duration} 秒，模型支持 {allowed} 秒' + ('' if ok else '；请调整时长或拆分动作，不会自动压缩剧情'))


async def get_shot_video_readiness(
    db: AsyncSession,
    *,
    shot_id: str,
    reference_mode: str,
    model_id: str | None = None,
    subject_image_count: int = 0,
) -> ShotVideoReadinessRead:
    """实时聚合镜头视频生成准备度，不写入数据库状态。"""
    shot = await db.get(Shot, shot_id)
    if shot is None:
        raise ValueError(entity_not_found("Shot"))
    detail = await db.get(ShotDetail, shot_id)

    pending_assets, pending_dialogues = await _count_pending_candidates(db, shot_id=shot_id)
    extraction_ok = bool(shot.skip_extraction) or (
        shot.last_extracted_at is not None and pending_assets == 0 and pending_dialogues == 0
    )
    if extraction_ok:
        extraction_msg = "信息提取确认已完成" if not shot.skip_extraction else "当前镜头已标记为无需提取"
    else:
        extraction_msg = f"仍有待确认项：资产 {pending_assets} 项，对白 {pending_dialogues} 项"

    if detail is None:
        duration_check = _check("duration_ready", False, "缺少镜头详情，无法读取时长")
    else:
        duration = int(detail.duration or 0)
        duration_check = _check(
            "duration_ready",
            duration > 0,
            "镜头时长已配置" if duration > 0 else "请先配置镜头时长",
        )

    try:
        preview = await derive_video_preview(
            db,
            base=build_video_base_draft(shot_id=shot_id, prompt=None),
            context=await build_video_context(
                db,
                shot_id=shot_id,
                reference_mode="text_only",
                images=[],
            ),
        )
        prompt_ok = bool(preview.rendered_prompt.strip())
        prompt_message = "视频提示词可用" if prompt_ok else "视频提示词为空"
    except Exception as exc:  # noqa: BLE001
        prompt_ok = False
        prompt_message = f"视频提示词渲染失败：{exc}"

    active_video_task = await _has_active_video_task(db, shot_id=shot_id)
    model_check, provider_check = await _video_model_and_provider_ready(db, model_id)
    if detail is not None:
        duration_check = await _duration_for_model(db, int(detail.duration or 0), model_id)
    checks = [
        _check("extraction_ready", extraction_ok, extraction_msg),
        duration_check,
        _check("prompt_ready", prompt_ok, prompt_message),
        await _reference_frames_ready(db, shot_id=shot_id, reference_mode=reference_mode),
        await _model_reference_mode_ready(db, reference_mode, model_id, subject_image_count),
        model_check,
        provider_check,
        _check(
            "no_active_video_task",
            not active_video_task,
            "当前没有进行中的视频任务" if not active_video_task else "当前已有视频生成任务进行中",
        ),
    ]
    return ShotVideoReadinessRead(
        shot_id=shot_id,
        reference_mode=reference_mode,
        ready=all(item.ok for item in checks),
        checks=checks,
    )
