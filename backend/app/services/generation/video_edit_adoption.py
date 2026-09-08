"""Explicit editing result adoption with shot ownership and optimistic conflict protection."""
from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.studio import Shot, FileItem
from app.models.task import GenerationTask
from app.models.task_links import GenerationTaskLink
from app.models.types import FileType, FileUsageKind
from app.services.studio.file_usages import sync_usage_from_shot_context


async def adopt_video_edit(db: AsyncSession, *, shot_id: str, task_id: str,
                           expected_current_file_id: str | None) -> str:
    """Never replace a different shot or a video changed since the user's comparison."""
    shot = (await db.execute(select(Shot).where(Shot.id == shot_id).with_for_update())).scalar_one_or_none()
    task = await db.get(GenerationTask, task_id)
    target = ((task.payload or {}).get('snapshot') or {}).get('canonical_target') if task else None
    if not shot or not task or task.task_kind != 'video_edit' or not target or target.get('entity_id') != shot_id or target.get('kind') != 'shot_video_edit':
        raise HTTPException(status_code=404, detail='编辑结果不属于当前镜头')
    if task.status != 'succeeded':
        raise HTTPException(status_code=409, detail='仅成功的编辑结果可以采用')
    file_id = (task.result or {}).get('file_id')
    file = await db.get(FileItem, file_id) if file_id else None
    if not file or file.type != FileType.video:
        raise HTTPException(status_code=404, detail='编辑结果文件不可用')
    if shot.generated_video_file_id == file_id:
        return file_id
    if shot.generated_video_file_id != expected_current_file_id:
        raise HTTPException(status_code=409, detail='当前视频已改变，请重新比较后采用')
    old_file_id = shot.generated_video_file_id
    shot.generated_video_file_id = file_id
    shot.generated_video_version_id = (shot.generated_video_version_id or 1) + 1
    task.result = {**(task.result or {}), 'adopted': True, 'replaced_file_id': old_file_id}
    await db.execute(update(GenerationTaskLink).where(GenerationTaskLink.task_id == task_id,
        GenerationTaskLink.relation_type == 'shot_video_edit').values(status='accepted'))
    await sync_usage_from_shot_context(db, file_id=file_id, shot_id=shot_id,
        usage_kind=FileUsageKind.generated_video, source_ref=f'shot:{shot_id}:generated_video')
    await db.flush()
    return file_id
