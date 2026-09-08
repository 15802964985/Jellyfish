"""固定媒体资源的统一生成任务入口。

路由是业务 Binder：仅由路径派生目标、模态、operation 与交付方式，避免
客户端同时维护请求体目标和 URL 目标两份事实来源。
"""

from __future__ import annotations

from typing import Literal
from pydantic import BaseModel, ConfigDict, Field

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.routes.film.common import TaskCreated
from app.core.contracts.generation import (
    GenerationCommand,
    GenerationDelivery,
    GenerationModality,
    GenerationOperation,
    GenerationSubmitRequest,
    GenerationTarget,
    GenerationTargetKind,
    ImageGenerationOperationInput,
    VideoGenerationOperationInput,
    VideoEditOperationInput,
)
from app.core.contracts.media import ImageMediaInput, VideoMediaInput, VideoEditMediaInput
from app.dependencies import get_db
from app.models.studio import Shot, ShotDetail, ShotFrameImage, ShotFrameType
from app.schemas.common import ApiResponse, created_response
from app.services.generation.gate import GenerationEntityGate
from app.services.generation.submission import GenerationSubmitter

router = APIRouter()


class VideoEditPreflightRequest(BaseModel):
    """Local-only metadata check; consent to external transfer is not requested here."""
    model_config = ConfigDict(extra='forbid')
    model_id: str
    media: VideoEditMediaInput
    reference_positions: list[float] = Field(default_factory=list, max_length=5)


@router.post('/shots/{shot_id}/video-edit-preflight', response_model=ApiResponse[dict[str, float | bool]])
async def preflight_video_edit(shot_id: str, body: VideoEditPreflightRequest,
                               db: AsyncSession = Depends(get_db)) -> ApiResponse[dict[str, float | bool]]:
    """Only inspect local files and configuration; no provider HTTP request or task is created."""
    from app.models.llm import Model, Provider
    from app.services.llm.provider_registry import resolve_provider_key
    from app.core.integrations.video_edit_registry import VIDEO_EDIT_MODELS
    from app.services.generation.files import FileResolver
    from app.services.generation.video_edit_preflight import validate_edit_inputs
    if await db.get(Shot, shot_id) is None:
        raise HTTPException(status_code=404, detail='镜头不存在')
    model = await db.get(Model, body.model_id)
    provider = await db.get(Provider, model.provider_id) if model else None
    if model is None or provider is None or provider.status == 'disabled' or model.category != 'video':
        raise HTTPException(status_code=400, detail='编辑模型配置不可用')
    key = resolve_provider_key(provider)
    if VIDEO_EDIT_MODELS.get(key) != model.name:
        raise HTTPException(status_code=400, detail='该型号尚未接入视频编辑')
    try:
        resolver = FileResolver(db)
        source = await resolver.resolve(body.media.source)
        images = await resolver.resolve_many(body.media.references)
        metadata = await validate_edit_inputs(key, source, images, body.reference_positions)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return created_response(metadata)


class QualityReviewRequest(BaseModel):
    """Opt-in review with separately selected images, never a guarantee of visual correctness."""
    model_config = ConfigDict(extra='forbid')
    model_id: str
    prompt: str = Field(min_length=1, max_length=100000)
    external_and_billing_confirmed: Literal[True]
    retry_request_id: str | None = Field(default=None, min_length=16, max_length=64, pattern=r'^[a-zA-Z0-9_-]+$')
    image_file_ids: list[str] = Field(default_factory=list, max_length=4)


@router.post('/shots/{shot_id}/quality-review', response_model=ApiResponse[TaskCreated], status_code=201)
async def submit_quality_review(shot_id: str, body: QualityReviewRequest,
                                db: AsyncSession = Depends(get_db)) -> ApiResponse[TaskCreated]:
    """Freeze local evidence with the exact prompt; identical source/model inputs reuse a task."""
    from app.services.generation.quality_sources import collect_quality_sources
    from app.services.generation.quality_review import QUALITY_REVIEW_INSTRUCTION
    from app.core.contracts.text_generation import TextChatInput, TextChatMessage
    await db.execute(select(Shot).where(Shot.id == shot_id).with_for_update())
    evidence = await collect_quality_sources(db, shot_id=shot_id, prompt=body.prompt)
    from app.core.contracts.media import MediaReference
    review_media = ImageMediaInput(references=[MediaReference(file_id=file_id, media_kind='image', ordinal=i)
        for i, file_id in enumerate(dict.fromkeys(body.image_file_ids))]) if body.image_file_ids else None
    request = GenerationSubmitRequest(model_id=body.model_id, quality_review_retry_id=body.retry_request_id,
        media=review_media, operation_input=TextChatInput(messages=[
        TextChatMessage(role='system', sequence=1, content=QUALITY_REVIEW_INSTRUCTION),
        TextChatMessage(role='user', sequence=2, content='待审镜头提示词：\n' + body.prompt + '\n本地来源快照：\n' + evidence.model_dump_json()),
    ]))
    return await _submit_async_task(db, modality=GenerationModality.text,
        operation=GenerationOperation.quality_preflight,
        target=GenerationTarget(kind=GenerationTargetKind.shot_detail, entity_id=shot_id), body=request)


class AdoptVideoEditRequest(BaseModel):
    """Require the video the user compared, to detect concurrent replacement."""
    model_config = ConfigDict(extra='forbid')
    expected_current_file_id: str | None


@router.post('/shots/{shot_id}/video-edits/{task_id}/adopt', response_model=ApiResponse[dict[str, str]])
async def adopt_shot_video_edit(shot_id: str, task_id: str, body: AdoptVideoEditRequest,
                                db: AsyncSession = Depends(get_db)) -> ApiResponse[dict[str, str]]:
    """Adopt only after explicit comparison; preserve source files and edit provenance."""
    from app.services.generation.video_edit_adoption import adopt_video_edit
    file_id = await adopt_video_edit(db, shot_id=shot_id, task_id=task_id,
        expected_current_file_id=body.expected_current_file_id)
    await db.commit()
    return created_response({'file_id': file_id})


@router.post('/shots/{shot_id}/video-edits', response_model=ApiResponse[TaskCreated],
    status_code=status.HTTP_201_CREATED, summary='提交已有视频文字编辑任务')
async def submit_shot_video_edit_task(shot_id: str, body: GenerationSubmitRequest,
                                     db: AsyncSession = Depends(get_db)) -> ApiResponse[TaskCreated]:
    """Bind edit to the shot, require separate consent, preserve source and await manual adoption."""
    if not isinstance(body.operation_input, VideoEditOperationInput) or not isinstance(body.media, VideoEditMediaInput):
        raise HTTPException(status_code=422, detail='编辑需要源视频、修改说明及外发和费用确认')
    # Serialize submissions for this shot so a repeated request ID cannot race into two tasks.
    await db.execute(select(Shot).where(Shot.id == shot_id).with_for_update())
    return await _submit_async_task(db, modality=GenerationModality.video,
        operation=GenerationOperation.video_edit,
        target=GenerationTarget(kind=GenerationTargetKind.shot_video_edit, entity_id=shot_id), body=body)


def _require_image_request(body: GenerationSubmitRequest) -> None:
    """确保图片固定路由只接收图片 operation 与图片参考媒体。"""
    if not isinstance(body.operation_input, ImageGenerationOperationInput):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="operation_input_invalid")
    if body.media is not None and not isinstance(body.media, ImageMediaInput):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="media_role_invalid")


def _require_video_request(body: GenerationSubmitRequest) -> None:
    """确保视频固定路由只接收视频 operation 与保持分组语义的视频媒体。"""
    if not isinstance(body.operation_input, VideoGenerationOperationInput):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="operation_input_invalid")
    if body.media is not None and not isinstance(body.media, VideoMediaInput):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="media_role_invalid")


async def _submit_async_task(
    db: AsyncSession,
    *,
    modality: GenerationModality,
    operation: GenerationOperation,
    target: GenerationTarget,
    body: GenerationSubmitRequest,
) -> ApiResponse[TaskCreated]:
    """提交已由资源路径绑定的命令，由 Outbox dispatcher 可靠投递 Worker。"""
    accepted = await GenerationSubmitter(entity_gate=GenerationEntityGate()).submit_async(
        db,
        GenerationCommand(
            modality=modality,
            operation=operation,
            delivery=GenerationDelivery.async_polling,
            target=target,
            request=body,
        ),
    )
    await db.commit()
    return created_response(TaskCreated(task_id=accepted.task_id))


async def _get_or_create_frame_slot(
    db: AsyncSession,
    *,
    shot_id: str,
    frame_type: ShotFrameType,
) -> ShotFrameImage:
    """为已存在镜头获取帧槽位，缺失时在提交事务内创建可 CAS 发布的占位槽位。"""
    if await db.get(ShotDetail, shot_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="target_not_found")
    statement = (
        select(ShotFrameImage)
        .where(ShotFrameImage.shot_detail_id == shot_id, ShotFrameImage.frame_type == frame_type)
        .limit(1)
    )
    slot = (await db.execute(statement)).scalars().first()
    if slot is not None:
        return slot
    slot = ShotFrameImage(
        shot_detail_id=shot_id,
        frame_type=frame_type,
        file_id=None,
        width=None,
        height=None,
        format="png",
    )
    db.add(slot)
    await db.flush()
    return slot


@router.post(
    "/shots/{shot_id}/frames/{frame_type}",
    response_model=ApiResponse[TaskCreated],
    status_code=status.HTTP_201_CREATED,
    summary="提交镜头分镜帧图片任务",
)
async def submit_shot_frame_generation_task(
    shot_id: str,
    frame_type: ShotFrameType,
    body: GenerationSubmitRequest,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[TaskCreated]:
    """绑定镜头帧槽位后提交图片任务；最终提示词由客户端先经 render API 确认。"""
    _require_image_request(body)
    slot = await _get_or_create_frame_slot(db, shot_id=shot_id, frame_type=frame_type)
    return await _submit_async_task(
        db,
        modality=GenerationModality.image,
        operation=GenerationOperation.image_generation,
        target=GenerationTarget(
            kind=GenerationTargetKind.shot_frame_slot,
            entity_id=shot_id,
            slot_id=str(slot.id),
        ),
        body=body,
    )


@router.post(
    "/shots/{shot_id}/video",
    response_model=ApiResponse[TaskCreated],
    status_code=status.HTTP_201_CREATED,
    summary="提交镜头视频任务",
)
async def submit_shot_video_generation_task(
    shot_id: str,
    body: GenerationSubmitRequest,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[TaskCreated]:
    """绑定镜头后提交视频任务；视频帧与具名主体媒体的分组直接冻结到快照。"""
    _require_video_request(body)
    return await _submit_async_task(
        db,
        modality=GenerationModality.video,
        operation=GenerationOperation.video_generation,
        target=GenerationTarget(kind=GenerationTargetKind.shot_video, entity_id=shot_id),
        body=body,
    )


@router.post(
    "/actors/{actor_id}/slots/{slot_id}/tasks",
    response_model=ApiResponse[TaskCreated],
    status_code=status.HTTP_201_CREATED,
    summary="提交演员图片任务",
)
async def submit_actor_image_generation_task(
    actor_id: str,
    slot_id: int,
    body: GenerationSubmitRequest,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[TaskCreated]:
    """绑定演员图片槽位，防止请求体伪造目标或改变图片执行语义。"""
    _require_image_request(body)
    return await _submit_async_task(
        db,
        modality=GenerationModality.image,
        operation=GenerationOperation.image_generation,
        target=GenerationTarget(kind=GenerationTargetKind.asset_image_slot, entity_id=actor_id, slot_id=str(slot_id)),
        body=body,
    )


@router.post(
    "/characters/{character_id}/slots/{slot_id}/tasks",
    response_model=ApiResponse[TaskCreated],
    status_code=status.HTTP_201_CREATED,
    summary="提交角色图片任务",
)
async def submit_character_image_generation_task(
    character_id: str,
    slot_id: int,
    body: GenerationSubmitRequest,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[TaskCreated]:
    """绑定角色图片槽位，统一交由提交器冻结模型与媒体快照。"""
    _require_image_request(body)
    return await _submit_async_task(
        db,
        modality=GenerationModality.image,
        operation=GenerationOperation.image_generation,
        target=GenerationTarget(kind=GenerationTargetKind.asset_image_slot, entity_id=character_id, slot_id=str(slot_id)),
        body=body,
    )


@router.post(
    "/assets/{asset_type}/{asset_id}/slots/{slot_id}/tasks",
    response_model=ApiResponse[TaskCreated],
    status_code=status.HTTP_201_CREATED,
    summary="提交资产图片任务",
)
async def submit_asset_image_generation_task(
    asset_type: Literal["prop", "scene", "costume"],
    asset_id: str,
    slot_id: int,
    body: GenerationSubmitRequest,
    db: AsyncSession = Depends(get_db),
) -> ApiResponse[TaskCreated]:
    """绑定道具、场景或服装图片槽位；资产类型仅用于受限路径匹配。"""
    _require_image_request(body)
    return await _submit_async_task(
        db,
        modality=GenerationModality.image,
        operation=GenerationOperation.image_generation,
        target=GenerationTarget(kind=GenerationTargetKind.asset_image_slot, entity_id=asset_id, slot_id=str(slot_id)),
        body=body,
    )
