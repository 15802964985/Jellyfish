"""Adopt uploaded/library files into business slots without invoking a model."""
from pathlib import PurePosixPath
from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.studio import FileItem, Shot, ShotDetail, ShotFrameImage
from app.models.types import FileType, FileUsageKind
from app.schemas.manual_media import ManualMediaTarget, ManualMediaSelection, ManualMediaState
from app.services.studio.entity_specs import entity_spec, LINK_MODEL_BY_ENTITY
from app.services.studio.file_usages import sync_usage_from_shot_context, sync_usage_from_character, upsert_file_usage

async def _resolve(db: AsyncSession, target: ManualMediaTarget, *, lock: bool = False):
    """Check the owner before resolving slots; serialize missing-slot creation on that owner."""
    is_video = target.target_type == 'shot'
    spec = None if target.target_type in ('shot', 'frame') else entity_spec(target.target_type)
    owner_model = Shot if is_video else ShotDetail if target.target_type == 'frame' else spec.model
    query = select(owner_model).where(owner_model.id == target.entity_id)
    owner = await db.scalar(query.with_for_update() if lock else query)
    if owner is None:
        raise HTTPException(404, '素材目标不存在，请刷新后重试')
    if is_video:
        if target.slot_id is not None:
            raise HTTPException(422, '视频采用不接受图片槽位')
        return owner, Shot, None
    model, parent = (ShotFrameImage, 'shot_detail_id') if spec is None else (spec.image_model, spec.id_field)
    query = select(model).where(getattr(model, parent) == target.entity_id)
    if target.slot_id is not None:
        query = query.where(model.id == target.slot_id)
    elif spec is None:
        query = query.where(model.frame_type == target.frame_type)
    else:
        query = query.where(model.view_angle == 'FRONT').order_by(model.file_id.is_not(None).desc(), model.created_at.desc(), model.id.desc())
    row = await db.scalar(query.with_for_update() if lock else query)
    if target.slot_id is not None and row is None:
        raise HTTPException(404, '图片槽位不存在或不属于当前对象')
    return row, model, parent

async def read_media_target(db: AsyncSession, target: ManualMediaTarget) -> ManualMediaState:
    """Read a confirmation snapshot without creating slots or changing business data."""
    row, _, _ = await _resolve(db, target)
    video = target.target_type == 'shot'
    return ManualMediaState(file_id=(row.generated_video_file_id if video else row.file_id) if row else None,
        version=(row.generated_video_version_id if video else row.version_id) if row else 0,
        slot_id=None if video or row is None else row.id)

async def adopt_media(db: AsyncSession, body: ManualMediaSelection) -> ManualMediaState:
    """Validate media, CAS the exact target, and register usage; retain original files and tasks."""
    row, model, parent = await _resolve(db, body, lock=True)
    video = body.target_type == 'shot'
    file = await db.scalar(select(FileItem).where(FileItem.id == body.file_id).with_for_update())
    if file is None:
        raise HTTPException(404, '素材文件不存在，请重新选择')
    if file.type != (FileType.video if video else FileType.image):
        raise HTTPException(422, '请选择视频文件' if video else '请选择图片文件')
    version = (row.generated_video_version_id if video else row.version_id) if row else 0
    if version != body.expected_version:
        raise HTTPException(409, '当前图片或视频已变化，请重新打开并确认后采用')
    if row is None:
        values = {parent: body.entity_id, 'version_id': 1}
        values.update({'frame_type': body.frame_type} if body.target_type == 'frame' else {'view_angle': 'FRONT'})
        row = model(**values)
        db.add(row)
        await db.flush()
        version = row.version_id
    version_column = model.generated_video_version_id if video else model.version_id
    values = {'generated_video_file_id': file.id, 'generated_video_version_id': version + 1} if video else {
        'file_id': file.id, 'version_id': version + 1, 'width': file.width, 'height': file.height,
        'format': PurePosixPath(file.original_name or file.storage_key or '').suffix.lstrip('.').lower() or 'unknown'}
    result = await db.execute(update(model).where(model.id == row.id, version_column == version).values(**values))
    if result.rowcount != 1:
        raise HTTPException(409, '当前图片或视频已变化，请重新确认')
    # The same version fields are checked by API and website publishers, isolating late results.
    if body.target_type in ('frame', 'shot'):
        await sync_usage_from_shot_context(db, file_id=file.id, shot_id=body.entity_id,
            usage_kind=FileUsageKind.generated_video if video else FileUsageKind.shot_frame,
            source_ref=f'manual:{body.target_type}:{row.id}')
    elif body.target_type == 'character':
        await sync_usage_from_character(db, file_id=file.id, character_id=body.entity_id,
            usage_kind=FileUsageKind.character_image, source_ref=f'manual:character:{row.id}')
    elif body.target_type in LINK_MODEL_BY_ENTITY:
        link_model, parent_field = LINK_MODEL_BY_ENTITY[body.target_type]
        projects = (await db.scalars(select(link_model.project_id).where(getattr(link_model, parent_field) == body.entity_id).distinct())).all()
        for project_id in projects:
            await upsert_file_usage(db, file_id=file.id, project_id=project_id, chapter_id=None, shot_id=None,
                usage_kind=FileUsageKind.asset_image, source_ref=f'manual:{body.target_type}:{row.id}:project:{project_id}')
    await db.flush()
    return ManualMediaState(file_id=file.id, version=version + 1, slot_id=None if video else row.id)
