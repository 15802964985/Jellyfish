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


from app.core.contracts.video_edit import VideoEditOptions, VideoEditCatalogRead, VideoEditPreviewRead


class VideoEditPreflightRequest(BaseModel):
    """Free local validation with editing-specific options and immutable model identity."""
    model_config = ConfigDict(extra='forbid')
    model_id: str
    media: VideoEditMediaInput
    reference_positions: list[float] = Field(default_factory=list, max_length=5)
    options: VideoEditOptions = Field(default_factory=VideoEditOptions)
    keep_audio: bool = True
    expected_revision_id: str | None = None


@router.get('/video-edit-models', response_model=ApiResponse[VideoEditCatalogRead])
async def list_video_edit_models(db: AsyncSession = Depends(get_db)):
    """Return the backend-owned capability catalogue and precise configured exclusions."""
    from app.services.generation.video_edit_controls import model_catalog
    return created_response(await model_catalog(db))


@router.post('/shots/{shot_id}/video-edit-preflight', response_model=ApiResponse[VideoEditPreviewRead])
async def preflight_video_edit(shot_id: str, body: VideoEditPreflightRequest,
                               db: AsyncSession = Depends(get_db)):
    """Only inspect local files/configuration; no external request or generation task."""
    from app.services.generation.video_edit_controls import preflight_edit
    if await db.get(Shot, shot_id) is None:
        raise HTTPException(status_code=404, detail='镜头不存在')
    return created_response(await preflight_edit(db, model_id=body.model_id, media=body.media,
        options=body.options, positions=body.reference_positions, keep_audio=body.keep_audio,
        expected_revision=body.expected_revision_id))


from app.core.contracts.quality_review import QualityReviewRequest, QualityReviewHistory, ReviewHistoryScope, QualityReviewRecord, ApplyReviewRevisionRequest
from fastapi import Query


@router.get('/shots/{shot_id}/quality-reviews', response_model=ApiResponse[QualityReviewHistory])
async def get_quality_review_history(shot_id: str, scope: ReviewHistoryScope = 'video',
        stage: Literal['before', 'after'] | None = None, output_file_id: str | None = None,
        page: int = Query(default=1, ge=1), page_size: int = Query(default=10, ge=1, le=50),
        db: AsyncSession = Depends(get_db)):
    """免费读取镜头预检/修改历史；读取不会重新提交或调用模型。"""
    from app.services.generation.quality_review_workflow import list_review_history
    return created_response(await list_review_history(db, shot_id=shot_id, scope=scope, page=page, page_size=page_size, stage=stage, output_file_id=output_file_id))


@router.post('/shots/{shot_id}/quality-reviews/{task_id}/apply', response_model=ApiResponse[QualityReviewRecord])
async def apply_quality_revision(shot_id: str, task_id: str, body: ApplyReviewRevisionRequest,
                                 db: AsyncSession = Depends(get_db)):
    """显式应用优化方案；只保存草稿/标记，不调用模型。"""
    from app.services.generation.quality_review_workflow import apply_review_revision
    return created_response(await apply_review_revision(db, shot_id=shot_id, task_id=task_id, body=body))


@router.post('/shots/{shot_id}/quality-review', response_model=ApiResponse[TaskCreated], status_code=201)
async def submit_quality_review(shot_id: str, body: QualityReviewRequest,
                                db: AsyncSession = Depends(get_db)) -> ApiResponse[TaskCreated]:
    """显式提交预检或调整，服务层负责校验历史来源与冻结证据。"""
    from app.services.generation.quality_review_workflow import build_review_request
    request = await build_review_request(db, shot_id=shot_id, body=body)
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


@router.post('/shots/{shot_id}/quality-reviews/{task_id}/restore', response_model=ApiResponse[QualityReviewRecord])
async def restore_quality_revision(shot_id: str, task_id: str, db: AsyncSession = Depends(get_db)):
    """免费恢复应用前状态，原预检和优化方案仍保留。"""
    from app.services.generation.quality_review_workflow import restore_review_revision
    return created_response(await restore_review_revision(db, shot_id=shot_id, task_id=task_id))


from app.core.contracts.quality_review import FrameReviewCheckRequest


@router.post('/shots/{shot_id}/frame-review-check', response_model=ApiResponse[dict])
async def check_frame_review(shot_id: str, body: FrameReviewCheckRequest, db: AsyncSession = Depends(get_db)):
    """免费校验帧图输入，不创建任何模型任务。"""
    from app.services.generation.quality_review_workflow import check_frame_review_inputs
    return created_response(await check_frame_review_inputs(db, shot_id=shot_id, body=body))


@router.get('/quality-review-models', response_model=ApiResponse[list[dict]])
async def quality_review_models(db: AsyncSession = Depends(get_db)):
    """返回当前预检模型和已接入的看图能力，不调用模型。"""
    from app.services.generation.quality_review_workflow import review_model_choices
    return created_response(await review_model_choices(db))
