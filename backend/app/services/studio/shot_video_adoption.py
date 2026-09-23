"""Select a successful video from this shot for downstream assembly without deleting candidates."""
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.studio import Shot, FileItem
from app.models.task import GenerationTask
from app.models.task_links import GenerationTaskLink
from app.models.generation_artifacts import GenerationArtifact
from app.models.types import FileType, FileUsageKind
from app.services.studio.file_usages import sync_usage_from_shot_context


async def adopt_shot_video(db: AsyncSession, *, shot_id: str, file_id: str, expected_current_file_id: str | None) -> str:
    """Lock the shot and verify ownership plus successful generation before changing the assembly source."""
    shot = (await db.execute(select(Shot).where(Shot.id == shot_id).with_for_update())).scalar_one_or_none()
    file = await db.get(FileItem, file_id)
    if not shot or not file or file.type != FileType.video:
        raise HTTPException(404, '镜头或视频文件不可用')
    # Task links cover archived legacy generations; artifacts cover additional successful candidates.
    tasks = (await db.execute(select(GenerationTask).join(GenerationTaskLink,
        GenerationTaskLink.task_id == GenerationTask.id).where(
        GenerationTaskLink.relation_entity_id == shot_id, GenerationTaskLink.resource_type == 'video',
        GenerationTaskLink.relation_type.in_(['shot_video', 'video', 'shot_video_edit']),
        GenerationTask.status == 'succeeded', GenerationTaskLink.file_id == file_id))).scalars().all()
    artifacts = (await db.execute(select(GenerationTask).join(GenerationArtifact,
        GenerationArtifact.task_id == GenerationTask.id).where(
        GenerationArtifact.file_id == file_id, GenerationTask.status == 'succeeded'))).scalars().all()
    valid = bool(tasks)
    for task in artifacts:
        target = ((task.payload or {}).get('snapshot') or {}).get('canonical_target') or {}
        valid = valid or (target.get('entity_id') == shot_id and target.get('kind') in ('shot_video', 'shot_video_edit'))
    if not valid:
        raise HTTPException(404, '只能采用当前镜头成功生成的视频候选')
    if shot.generated_video_file_id == file_id:
        return file_id
    if shot.generated_video_file_id != expected_current_file_id:
        raise HTTPException(409, '当前采用视频已变化，请刷新比较后重试')
    shot.generated_video_file_id = file_id
    shot.generated_video_version_id = (shot.generated_video_version_id or 1) + 1
    await sync_usage_from_shot_context(db, file_id=file_id, shot_id=shot_id,
        usage_kind=FileUsageKind.generated_video, source_ref=f'shot:{shot_id}:generated_video')
    await db.flush()
    return file_id
