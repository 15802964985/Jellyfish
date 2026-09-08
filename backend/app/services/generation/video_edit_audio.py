"""Restore source audio locally when the editing API has no documented keep-audio field."""
import asyncio
import hashlib
import tempfile
from pathlib import Path
from uuid import uuid4
from app.core import storage
from app.core.contracts.media import MediaReference
from app.models.studio import FileItem
from app.models.types import FileType
from app.services.generation.files import FileResolver


async def retain_original_audio(db, *, artifact, source_content: bytes) -> None:
    """Preserve original audio without -shortest truncation or any additional paid request."""
    resolved = await FileResolver(db).resolve(MediaReference(file_id=artifact.file_id, media_kind='video'))
    from app.services.generation.video_edit_runtime import probe_edit_video
    original_info = await probe_edit_video(source_content, 'runway')
    edited_info = await probe_edit_video(resolved.content, 'runway')
    if abs(original_info['seconds'] - edited_info['seconds']) > 0.2:
        raise ValueError('编辑结果时长与原片不同，不能无损对齐原音轨；结果未采用')
    with tempfile.TemporaryDirectory(prefix='jellyfish-edit-audio-') as directory:
        root = Path(directory)
        source, edited, output = root / 'source.mp4', root / 'edited.mp4', root / 'output.mp4'
        await asyncio.to_thread(source.write_bytes, source_content)
        await asyncio.to_thread(edited.write_bytes, resolved.content)
        process = await asyncio.create_subprocess_exec('ffmpeg', '-nostdin', '-v', 'error',
            '-i', str(edited), '-i', str(source), '-map', '0:v:0', '-map', '1:a',
            '-c:v', 'copy', '-c:a', 'aac', '-movflags', '+faststart', str(output),
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
        try:
            _, stderr = await asyncio.wait_for(process.communicate(), 120)
        except BaseException:
            if process.returncode is None:
                process.kill()
                await process.wait()
            raise
        if process.returncode:
            raise ValueError('保留原音轨失败，未采用编辑结果：' + stderr.decode(errors='replace')[-400:])
        content = await asyncio.to_thread(output.read_bytes)
    file_id = uuid4().hex
    key = f'edited-videos/{file_id}.mp4'
    stored = await storage.upload_file(key=key, data=content, content_type='video/mp4')
    db.add(FileItem(id=file_id, type=FileType.video, name='编辑视频（原音轨）', thumbnail=stored.url,
        tags=['编辑视频', '保留原音轨'], storage_key=key, original_name=f'{file_id}.mp4',
        mime_type='video/mp4', size_bytes=len(content), checksum=hashlib.sha256(content).hexdigest()))
    await db.flush()
    artifact.provider_result = {**artifact.provider_result, 'raw_edit_file_id': artifact.file_id,
        'audio_retention': 'local_source_audio'}
    artifact.file_id = file_id
    await db.flush()
