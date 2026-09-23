"""资产附件、配音音效和镜头音轨 API。"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db
from app.schemas.common import ApiResponse, PaginatedData, created_response, empty_response, paginated_response, success_response
from app.schemas.studio import (
    AssetFileLinkCreate,
    AssetFileLinkRead,
    AssetFileLinkUpdate,
    AudioAssetCreate,
    AudioAssetRead,
    AudioAssetUpdate,
    ShotAudioTrackCreate,
    ShotAudioTrackRead,
    ShotAudioTrackUpdate,
    ShotTtsTaskCreate,
    ShotTtsTaskRead,
)
from app.services.studio.media_assets import (
    create_asset_file_link,
    create_audio_asset,
    create_shot_audio_track,
    delete_asset_file_link,
    delete_audio_asset,
    delete_shot_audio_track,
    list_asset_file_links,
    list_audio_assets,
    list_shot_audio_tracks,
    update_asset_file_link,
    update_audio_asset,
    update_shot_audio_track,
)
from app.services.studio.shot_tts import create_shot_tts_task

from app.schemas.manual_media import ManualMediaTarget, ManualMediaSelection, ManualMediaState
from app.services.studio.manual_media import read_media_target, adopt_media

router = APIRouter()


@router.post(
    "/shots/{shot_id}/tts-tasks",
    response_model=ApiResponse[ShotTtsTaskRead],
    status_code=status.HTTP_202_ACCEPTED,
    summary="使用默认或指定语音模型生成镜头配音",
)
async def create_shot_tts_task_api(
    shot_id: str,
    body: ShotTtsTaskCreate,
    db: AsyncSession = Depends(get_db, scope="function"),
) -> ApiResponse[ShotTtsTaskRead]:
    """校验请求并创建进入任务中心的异步配音任务。"""
    try:
        task_id, task_status, reused = await create_shot_tts_task(db, shot_id=shot_id, body=body)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return success_response(ShotTtsTaskRead(task_id=task_id, status=task_status, reused=reused))


@router.get(
    "/asset-files/{entity_type}/{entity_id}",
    response_model=ApiResponse[list[AssetFileLinkRead]],
    summary="列出资产的可选参考素材",
)
async def list_asset_files_api(
    entity_type: str,
    entity_id: str,
    enabled_only: bool = Query(False),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> ApiResponse[list[AssetFileLinkRead]]:
    rows = await list_asset_file_links(
        db, entity_type=entity_type, entity_id=entity_id, enabled_only=enabled_only
    )
    return success_response([AssetFileLinkRead.model_validate(row) for row in rows])


@router.post(
    "/asset-files/{entity_type}/{entity_id}",
    response_model=ApiResponse[AssetFileLinkRead],
    status_code=status.HTTP_201_CREATED,
    summary="把文件关联为资产参考素材",
)
async def create_asset_file_api(
    entity_type: str,
    entity_id: str,
    body: AssetFileLinkCreate,
    db: AsyncSession = Depends(get_db, scope="function"),
) -> ApiResponse[AssetFileLinkRead]:
    row = await create_asset_file_link(db, entity_type=entity_type, entity_id=entity_id, body=body)
    return created_response(AssetFileLinkRead.model_validate(row))


@router.patch(
    "/asset-files/{link_id}",
    response_model=ApiResponse[AssetFileLinkRead],
    summary="更新资产参考素材关系",
)
async def update_asset_file_api(
    link_id: int,
    body: AssetFileLinkUpdate,
    db: AsyncSession = Depends(get_db, scope="function"),
) -> ApiResponse[AssetFileLinkRead]:
    return success_response(AssetFileLinkRead.model_validate(await update_asset_file_link(db, link_id=link_id, body=body)))


@router.delete(
    "/asset-files/{link_id}",
    response_model=ApiResponse[None],
    summary="解除资产参考素材关系",
)
async def delete_asset_file_api(
    link_id: int,
    db: AsyncSession = Depends(get_db, scope="function"),
) -> ApiResponse[None]:
    await delete_asset_file_link(db, link_id=link_id)
    return empty_response()


@router.get(
    "/audio-assets",
    response_model=ApiResponse[PaginatedData[AudioAssetRead]],
    summary="配音音效资产列表（分页）",
)
async def list_audio_assets_api(
    q: str | None = Query(None),
    category: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(12, ge=1, le=100),
    db: AsyncSession = Depends(get_db, scope="function"),
) -> ApiResponse[PaginatedData[AudioAssetRead]]:
    items, total = await list_audio_assets(db, q=q, category=category, page=page, page_size=page_size)
    return paginated_response(items, page=page, page_size=page_size, total=total)


@router.post(
    "/audio-assets",
    response_model=ApiResponse[AudioAssetRead],
    status_code=status.HTTP_201_CREATED,
    summary="创建配音音效资产",
)
async def create_audio_asset_api(
    body: AudioAssetCreate,
    db: AsyncSession = Depends(get_db, scope="function"),
) -> ApiResponse[AudioAssetRead]:
    return created_response(await create_audio_asset(db, body=body))


@router.patch(
    "/audio-assets/{audio_asset_id}",
    response_model=ApiResponse[AudioAssetRead],
    summary="更新配音音效资产",
)
async def update_audio_asset_api(
    audio_asset_id: str,
    body: AudioAssetUpdate,
    db: AsyncSession = Depends(get_db, scope="function"),
) -> ApiResponse[AudioAssetRead]:
    return success_response(await update_audio_asset(db, audio_asset_id=audio_asset_id, body=body))


@router.delete(
    "/audio-assets/{audio_asset_id}",
    response_model=ApiResponse[None],
    summary="删除未使用的配音音效资产",
)
async def delete_audio_asset_api(
    audio_asset_id: str,
    db: AsyncSession = Depends(get_db, scope="function"),
) -> ApiResponse[None]:
    await delete_audio_asset(db, audio_asset_id=audio_asset_id)
    return empty_response()


@router.get(
    "/shots/{shot_id}/audio-tracks",
    response_model=ApiResponse[list[ShotAudioTrackRead]],
    summary="列出镜头音轨",
)
async def list_shot_audio_tracks_api(
    shot_id: str,
    db: AsyncSession = Depends(get_db, scope="function"),
) -> ApiResponse[list[ShotAudioTrackRead]]:
    rows = await list_shot_audio_tracks(db, shot_id=shot_id)
    return success_response([ShotAudioTrackRead.model_validate(row) for row in rows])


@router.post(
    "/shots/{shot_id}/audio-tracks",
    response_model=ApiResponse[ShotAudioTrackRead],
    status_code=status.HTTP_201_CREATED,
    summary="向镜头添加可选音轨",
)
async def create_shot_audio_track_api(
    shot_id: str,
    body: ShotAudioTrackCreate,
    db: AsyncSession = Depends(get_db, scope="function"),
) -> ApiResponse[ShotAudioTrackRead]:
    row = await create_shot_audio_track(db, shot_id=shot_id, body=body)
    return created_response(ShotAudioTrackRead.model_validate(row))


@router.patch(
    "/shot-audio-tracks/{track_id}",
    response_model=ApiResponse[ShotAudioTrackRead],
    summary="调整镜头音轨",
)
async def update_shot_audio_track_api(
    track_id: int,
    body: ShotAudioTrackUpdate,
    db: AsyncSession = Depends(get_db, scope="function"),
) -> ApiResponse[ShotAudioTrackRead]:
    row = await update_shot_audio_track(db, track_id=track_id, body=body)
    return success_response(ShotAudioTrackRead.model_validate(row))


@router.delete(
    "/shot-audio-tracks/{track_id}",
    response_model=ApiResponse[None],
    summary="移除镜头音轨",
)
async def delete_shot_audio_track_api(
    track_id: int,
    db: AsyncSession = Depends(get_db, scope="function"),
) -> ApiResponse[None]:
    await delete_shot_audio_track(db, track_id=track_id)
    return empty_response()




@router.get('/manual-selection', response_model=ApiResponse[ManualMediaState])
async def manual_media_target_api(target: ManualMediaTarget = Depends(), db: AsyncSession = Depends(get_db, scope='function')):
    """Read the business slot for an explicit local media confirmation."""
    return success_response(await read_media_target(db, target))


@router.post('/manual-selection', response_model=ApiResponse[ManualMediaState])
async def adopt_manual_media_api(body: ManualMediaSelection, db: AsyncSession = Depends(get_db, scope='function')):
    """Adopt a user-selected file; no model invocation or fake generation task is created."""
    return success_response(await adopt_media(db, body))
