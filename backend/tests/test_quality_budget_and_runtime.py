"""No-network quality budget and editing worker tests."""
from types import SimpleNamespace
from unittest.mock import AsyncMock
import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from app.core.db import Base
from app.core.contracts.generation import ResolvedGenerationSnapshot, VideoEditOperationInput
from app.core.contracts.media import VideoEditMediaInput, MediaReference
from app.models.task import GenerationTask
from app.models.task_links import GenerationTaskLink
from app.models.studio import FileItem
from app.services.generation.prompt_budget import require_prompt_budget, inspect_prompt_budget


def test_budget_preserves_text_and_blocks_known_truncation():
    """An unknown model is not silently assigned a popular model's limit."""
    assert inspect_prompt_budget(provider='aliyun_bailian', model='wan2.7-t2v', prompt='字' * 5000, modality='video')['status'] == 'within_limit'
    with pytest.raises(HTTPException) as error:
        require_prompt_budget(provider='aliyun_bailian', model='wan2.7-t2v', prompt='字' * 5001, modality='video')
    assert error.value.status_code == 422
    assert inspect_prompt_budget(provider='aliyun_bailian', model='unknown-new', prompt='字' * 6000, modality='video')['status'] == 'unknown'
    assert inspect_prompt_budget(provider='aliyun_bailian', model='happyhorse-1.1-i2v', prompt='中文' + 'a'*2500, modality='video')['status'] == 'exceeded'


@pytest.mark.asyncio
@pytest.mark.parametrize('cancel', [False, True])
async def test_edit_worker_archives_once_or_cancels_before_billable_call(monkeypatch, cancel):
    """Real task/link SQL, fake media/provider/store: source is not published over the shot."""
    import app.services.generation.video_edit_runtime as runtime
    import app.services.generation.video_edit_preflight as preflight
    import app.services.film.generated_video as generated
    engine = create_async_engine('sqlite+aiosqlite:///:memory:')
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    monkeypatch.setattr(runtime, 'async_session_maker', sessions)
    monkeypatch.setattr(runtime, 'edit_cancel_requested', AsyncMock(return_value=cancel))
    monkeypatch.setattr(generated, '_resolve_snapshot_provider_config', AsyncMock(return_value=SimpleNamespace(provider='fal', api_key='secret', base_url=None)))
    monkeypatch.setattr(preflight, 'validate_edit_inputs', AsyncMock(return_value={'seconds': 5, 'has_audio': False}))
    monkeypatch.setattr(runtime.FileResolver, 'resolve_task_reference', AsyncMock(return_value=SimpleNamespace(content_type='video/mp4', content=b'video')))
    adapter = SimpleNamespace(submit=AsyncMock(return_value={'request_id': 'external-1'}),
        status=AsyncMock(return_value={'status': 'COMPLETED'}), result=AsyncMock(return_value='https://media.example/out.mp4'), cancel=AsyncMock())
    monkeypatch.setitem(runtime.VIDEO_EDIT_ADAPTERS, 'fal', lambda *_: adapter)
    async def archive(db, **kwargs):
        """Archive a new file without network or any Shot mutation."""
        db.add(FileItem(id='result', type='video', name='result', storage_key='result.mp4'))
        await db.flush()
        return SimpleNamespace(file_id='result')
    monkeypatch.setattr(runtime.ArtifactStore, 'store_video', AsyncMock(side_effect=archive))
    snapshot = ResolvedGenerationSnapshot(model_id='m', model_revision_id='r',
        canonical_target={'kind': 'shot_video_edit', 'entity_id': 's'}, execution_prompt='修改道具',
        media=VideoEditMediaInput(source=MediaReference(file_id='original', media_kind='video')),
        operation_input=VideoEditOperationInput(client_request_id='request-1234567890', external_transfer_confirmed=True, billing_confirmed=True))
    from app.models.llm import ModelConfigRevision
    try:
        async with sessions() as db:
            db.add(ModelConfigRevision(id='r', model_id='m', version_id=1, model_name='fal-ai/kling-video/o3/pro/video-to-video/edit', category='video', provider_key='fal', credential_ref='provider:p'))
            db.add(GenerationTask(id='task', task_kind='video_edit', mode='async_polling', status='pending', payload={'snapshot': snapshot.model_dump(mode='json')}))
            await db.flush()
            db.add(GenerationTaskLink(task_id='task', resource_type='video', relation_type='shot_video_edit', relation_entity_id='s'))
            await db.commit()
        await runtime.run_video_edit_task('task', {})
        await runtime.run_video_edit_task('task', {})
        async with sessions() as db:
            task = await db.get(GenerationTask, 'task')
            assert task.status == ('cancelled' if cancel else 'succeeded'), task.error
            if not cancel:
                assert task.result['source_file_id'] == 'original'
                assert task.result['file_id'] == 'result' and task.result['adopted'] is False
                assert (await db.get(GenerationTaskLink, 1)).file_id == 'result'
        assert adapter.submit.await_count == (0 if cancel else 1)
    finally:
        await engine.dispose()
