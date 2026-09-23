"""Video editing: preserve source, persist provider receipt, download a new unadopted artifact."""
import asyncio
import base64
import json
import tempfile
from pathlib import Path
from time import monotonic
from fractions import Fraction

import httpx
from app.core.integrations.traced_http import create_http_client
from sqlalchemy import select, update

from app.core.db import async_session_maker
from app.core.task_manager import SqlAlchemyTaskStore
from app.core.task_manager.types import TaskStatus
from app.core.contracts.generation import ResolvedGenerationSnapshot, VideoEditOperationInput
from app.core.contracts.media import VideoEditMediaInput
from app.core.contracts.video_generation import VideoGenerationResult
from app.core.integrations.video_edit_registry import VIDEO_EDIT_ADAPTERS, VIDEO_EDIT_ORIGINS
from app.models.task import GenerationTask
from app.models.task_links import GenerationTaskLink
from app.models.llm import ModelConfigRevision
from app.services.generation.files import FileResolver
from app.services.generation.runtime import ArtifactStore


async def edit_cancel_requested(task_id: str) -> bool:
    """Fresh short transaction avoids identity-map and MySQL repeatable-read stale cancel flags."""
    async with async_session_maker() as check_db:
        return bool(await check_db.scalar(select(GenerationTask.cancel_requested).where(GenerationTask.id == task_id)))


async def probe_edit_video(content: bytes, provider: str = 'fal') -> dict:
    """Probe actual media locally; fail closed without cropping or guessing metadata."""
    if len(content) > 200 * 1024 * 1024:
        raise ValueError('源视频超过 200MB，请先准备符合模型限制的片段')
    with tempfile.TemporaryDirectory(prefix='jellyfish-edit-') as directory:
        path = Path(directory) / 'source.mp4'
        await asyncio.to_thread(path.write_bytes, content)
        process = await asyncio.create_subprocess_exec('ffprobe', '-v', 'error', '-show_streams',
            '-show_format', '-of', 'json', str(path), stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE)
        try:
            stdout, _ = await asyncio.wait_for(process.communicate(), timeout=30)
        except BaseException:
            if process.returncode is None:
                process.kill()
                await process.wait()
            raise
        if process.returncode:
            raise ValueError('源视频无法读取，请检查文件是否损坏')
        data = json.loads(stdout)
    streams = [s for s in data.get('streams', []) if s.get('codec_type') == 'video']
    if not streams:
        raise ValueError('源文件没有视频轨道')
    stream = streams[0]
    seconds = float(data.get('format', {}).get('duration') or stream.get('duration') or 0)
    width, height = int(stream.get('width') or 0), int(stream.get('height') or 0)
    if provider == 'fal' and (not 3 <= seconds <= 15 or not all(720 <= x <= 3840 for x in (width, height))):
        raise ValueError('fal Kling O3 编辑要求视频 3–15 秒、分辨率 720–3840px；不会自动截断')
    if not {'mp4', 'mov'} & set(data.get('format', {}).get('format_name', '').split(',')):
        raise ValueError('fal Kling O3 编辑要求 MP4/MOV 文件')
    try:
        fps = float(Fraction(stream.get('avg_frame_rate') or '0'))
    except (ValueError, ZeroDivisionError):
        fps = 0
    if provider == 'runway' and (not 2 <= seconds <= 30 or not 0 < fps <= 30 or min(width, height) > 1080 or max(width, height) > 1920):
        raise ValueError('Runway Aleph 2 要求 2–30 秒、30FPS 以下、最高 1080p；不会自动裁剪或缩放')
    return {'seconds': seconds, 'width': width, 'height': height,
        'fps': fps, 'codec': stream.get('codec_name'),
        'has_audio': any(s.get('codec_type') == 'audio' for s in data.get('streams', []))}


async def run_video_edit_task(task_id: str, run_args: dict) -> None:
    """Persist submit intent before billing; unknown outcome never triggers another submission."""
    from app.services.film.generated_video import _resolve_snapshot_provider_config
    async with async_session_maker() as db:
        store = SqlAlchemyTaskStore(db)
        secret = ''
        try:
            row = (await db.execute(select(GenerationTask).where(GenerationTask.id == task_id).with_for_update())).scalar_one_or_none()
            if row is None:
                return
            if row.status in ('succeeded', 'cancelled', 'failed'):
                return
            if (row.result or {}).get('submission_started'):
                return  # Only the original invocation may submit/poll; no automatic paid recovery.
            snapshot = ResolvedGenerationSnapshot.model_validate(row.payload['snapshot'])
            media, operation = snapshot.media, snapshot.operation_input
            if not isinstance(media, VideoEditMediaInput) or not isinstance(operation, VideoEditOperationInput):
                raise ValueError('invalid video edit snapshot')
            if row.cancel_requested:
                await store.mark_cancelled(task_id)
                await db.commit()
                return
            cfg = await _resolve_snapshot_provider_config(db, snapshot=snapshot)
            secret = cfg.api_key or ''
            revision = await db.get(ModelConfigRevision, snapshot.model_revision_id)
            from app.core.integrations.video_edit_registry import edit_capability, editing_base_url
            cap = edit_capability(cfg.provider, revision.model_name)
            if not cap:
                raise ValueError('该型号未接通编辑')
            editing_base_url(cfg.provider, cfg.base_url)
            resolver = FileResolver(db)
            source = await resolver.resolve_task_reference(task_id=task_id, reference=media.source)
            if source.content_type not in ('video/mp4', 'video/quicktime'):
                raise ValueError('源视频必须为 MP4/MOV，且文件 MIME 类型有效')
            images = []
            resolved_images = []
            for reference in sorted(media.references, key=lambda r: r.ordinal):
                item = await resolver.resolve_task_reference(task_id=task_id, reference=reference)
                if item.content_type not in ('image/jpeg', 'image/png', 'image/webp'):
                    raise ValueError('参考文件必须为 JPG、PNG 或 WebP 图片')
                images.append(f'data:{item.content_type};base64,' + base64.b64encode(item.content).decode('ascii'))
                resolved_images.append(item)
            from app.services.generation.video_edit_preflight import validate_edit_inputs
            metadata = await validate_edit_inputs(cfg.provider, source, resolved_images, operation.reference_positions, model=revision.model_name)
            video_url = f'data:{source.content_type};base64,' + base64.b64encode(source.content).decode('ascii')
            if cap.transport == 'url':
                from app.services.generation.video_edit_media import signed_edit_url
                video_url = await signed_edit_url(db, media.source.file_id)
                images = [await signed_edit_url(db, r.file_id) for r in sorted(media.references,key=lambda r:r.ordinal)]
            receipt = (row.result or {}).get('provider_receipt')
            if not receipt:
                if (row.result or {}).get('submission_started'):
                    return  # An in-flight/unknown submit must never be duplicated by redelivery.
                row.result = {'submission_started': True, 'source_file_id': media.source.file_id, 'metadata': metadata}
                await store.set_status(task_id, TaskStatus.running)
                await db.commit()
            async with create_http_client(timeout=90) as client:
                if cfg.provider in VIDEO_EDIT_ADAPTERS:
                    adapter = VIDEO_EDIT_ADAPTERS[cfg.provider](client, cfg.api_key)
                else:
                    from app.core.integrations.native_video_edit import NativeVideoEditAdapter
                    adapter = NativeVideoEditAdapter(client, cfg)
                if not receipt:
                    if await edit_cancel_requested(task_id):
                        await store.mark_cancelled(task_id)
                        await db.commit()
                        return
                    prompt = snapshot.execution_prompt or ''
                    if operation.preserve_instructions.strip():
                        prompt += '\n保持不变：' + operation.preserve_instructions.strip()
                    extra = {'reference_positions': operation.reference_positions} if cfg.provider == 'runway' else {}
                    if cfg.provider not in VIDEO_EDIT_ADAPTERS:
                        extra = {'resolution': operation.resolution, 'seconds': operation.seconds}
                    if len(prompt) > cap.prompt_limit:
                        raise ValueError('最终编辑提示词超过当前模型上限，请精简后重试')
                    receipt = await adapter.submit(model=revision.model_name, prompt=prompt,
                        video_url=video_url,
                        image_urls=images, keep_audio=operation.keep_audio, **extra)
                    row.result = {**(row.result or {}), 'provider_receipt': receipt}
                    await db.commit()
                started = monotonic()
                while monotonic() - started < 3300:
                    if await edit_cancel_requested(task_id):
                        try:
                            await adapter.cancel(receipt)
                        except Exception:
                            pass  # Local cancellation cannot promise remote cancellation/refund.
                        await store.mark_cancelled(task_id)
                        await db.commit()
                        return
                    state = await adapter.status(receipt)
                    if state.get('status') == 'COMPLETED':
                        if state.get('error'):
                            raise ValueError(f"{cfg.provider} 编辑失败：{state['error']}")
                        break
                    if state.get('status') not in ('IN_QUEUE', 'IN_PROGRESS'):
                        raise ValueError(f"{cfg.provider} 未知任务状态：{state.get('status')}")
                    await asyncio.sleep(10)
                else:
                    raise TimeoutError('视频编辑查询超时；保留外部任务凭证，请勿重复提交')
                url = await adapter.result(receipt)
            artifact = await ArtifactStore().store_video(db, task_id=task_id,
                result=VideoGenerationResult(url=url, provider_task_id=receipt['request_id']),
                name=f'edited-{snapshot.canonical_target.entity_id}', storage_prefix='edited-videos',
                httpx_timeout=600.0)
            if cap.local_audio and operation.keep_audio and metadata['has_audio']:
                # Preserve the paid raw result even if local audio remux fails later.
                row.result = {**(row.result or {}), 'raw_edit_file_id': artifact.file_id,
                    'audio_retention_pending': True}
                await db.commit()
                from app.services.generation.video_edit_audio import retain_original_audio
                await retain_original_audio(db, artifact=artifact, source_content=source.content)
            if await edit_cancel_requested(task_id):
                await store.mark_cancelled(task_id)
                await db.commit()
                return
            # Deliberately no ShotVideoPublisher: successful editing does not adopt or overwrite.
            row.result = {**(row.result or {}), 'file_id': artifact.file_id, 'adopted': False,
                'audio_retention_pending': False}
            await db.execute(update(GenerationTaskLink).where(GenerationTaskLink.task_id == task_id,
                GenerationTaskLink.relation_type == 'shot_video_edit').values(file_id=artifact.file_id))
            await store.set_progress(task_id, 100)
            await store.set_status(task_id, TaskStatus.succeeded)
            await db.commit()
        except Exception as exc:
            await db.rollback()
            await store.set_error(task_id, str(exc).replace(secret, '********') if secret else str(exc))
            await store.set_status(task_id, TaskStatus.failed)
            await db.commit()
