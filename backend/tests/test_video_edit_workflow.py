"""Editing regression tests use local SQL and mocked HTTP only; no billable calls."""
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock
import httpx
import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from app.core.db import Base
from app.core.integrations.runway_video_edit import RunwayVideoEditAdapter
from app.core.contracts.generation_quality import QualitySourceBundle
from app.services.generation.quality_sources import source_snapshot, quality_source_fingerprint
from app.services.generation.video_edit_preflight import validate_edit_inputs
from app.services.generation.video_edit_adoption import adopt_video_edit
from app.models.studio import Project, Chapter, Shot, FileItem
from app.models.task import GenerationTask
from app.models.task_links import GenerationTaskLink


@pytest.mark.asyncio
async def test_runway_protocol_and_completed_cancel_does_not_delete():
    """Real adapter emits timed keyframes, version header and no undocumented keep_audio."""
    requests = []
    def handle(request):
        """Exercise official request/response shapes through a local transport."""
        requests.append(request)
        assert request.headers['Authorization'] == 'Bearer private-key'
        assert request.headers['X-Runway-Version'] == '2024-11-06'
        assert request.url.host == 'api.dev.runwayml.com'
        if request.method == 'POST':
            assert json.loads(request.content) == {'model': 'aleph2', 'videoUri': 'data:video/mp4;base64,AA==',
                'promptText': '修改道具', 'outputFormat': 'mp4',
                'keyframes': [{'uri': 'data:image/png;base64,AA==', 'seconds': 1.5}]}
            return httpx.Response(200, json={'id': 'job-123'})
        return httpx.Response(200, json={'status': 'SUCCEEDED', 'output': ['https://cdn.example/video.mp4']})
    async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as client:
        adapter = RunwayVideoEditAdapter(client, 'private-key')
        receipt = await adapter.submit(model='aleph2', prompt='修改道具', video_url='data:video/mp4;base64,AA==',
            image_urls=['data:image/png;base64,AA=='], reference_positions=[1.5], keep_audio=True)
        assert (await adapter.status(receipt))['status'] == 'COMPLETED'
        assert await adapter.result(receipt) == 'https://cdn.example/video.mp4'
        assert (await adapter.cancel(receipt))['status'] == 'ALREADY_TERMINAL'
    assert not any(r.method == 'DELETE' for r in requests)
    assert sum(r.method == 'POST' for r in requests) == 1


@pytest.mark.asyncio
@pytest.mark.parametrize('state', ['PENDING', 'RUNNING', 'THROTTLED'])
async def test_runway_cancel_pending(state):
    """Cancellation addresses only the exact task and uses documented DELETE."""
    methods = []
    def handle(request):
        """Return a cancellable status then an empty success."""
        methods.append(request.method)
        return httpx.Response(200, json={'status': state}) if request.method == 'GET' else httpx.Response(204)
    async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as client:
        await RunwayVideoEditAdapter(client, 'key').cancel({'request_id': 'job'})
    assert methods == ['GET', 'DELETE']


@pytest.mark.asyncio
async def test_runway_rejects_missing_times_oversized_data_and_path_injection():
    """Invalid input must fail before sending any HTTP request."""
    async with httpx.AsyncClient(transport=httpx.MockTransport(lambda _: pytest.fail('must not send'))) as client:
        adapter = RunwayVideoEditAdapter(client, 'key')
        with pytest.raises(ValueError):
            await adapter.submit(model='aleph2', prompt='edit', video_url='small', image_urls=['image'], keep_audio=False)
        with pytest.raises(ValueError, match='5MB'):
            await adapter.submit(model='aleph2', prompt='edit', video_url='x' * (5 * 1024 * 1024 + 1), image_urls=[], keep_audio=False)
        with pytest.raises(ValueError):
            await adapter.status({'request_id': '../uploads?key=secret'})


@pytest.mark.asyncio
async def test_local_preflight_validates_encoded_size_and_guidance_time(monkeypatch):
    """Probe result does not bypass actual transfer byte budget or reference semantics."""
    import app.services.generation.video_edit_runtime as runtime
    monkeypatch.setattr(runtime, 'probe_edit_video', AsyncMock(return_value={'seconds': 5, 'width': 1280, 'height': 720, 'has_audio': True}))
    source = SimpleNamespace(content_type='video/mp4', content=b'video')
    image = SimpleNamespace(content_type='image/png', content=b'image')
    assert (await validate_edit_inputs('runway', source, [image], [0]))['seconds'] == 5
    with pytest.raises(ValueError, match='秒数'):
        await validate_edit_inputs('runway', source, [image], [5])
    with pytest.raises(ValueError, match='5MB'):
        await validate_edit_inputs('runway', SimpleNamespace(content_type='video/mp4', content=b'x' * 4 * 1024 * 1024), [], [])
    with pytest.raises(ValueError, match='最多'):
        await validate_edit_inputs('fal', source, [image] * 5, [])
    with pytest.raises(ValueError, match='参考图'):
        await validate_edit_inputs('fal', source, [SimpleNamespace(content_type='image/svg+xml', content=b'<svg/>')], [])


def test_source_fingerprint_ignores_order_but_detects_edits():
    """Prompt formatting is not source drift, but changed source content is."""
    a = source_snapshot('shot', 's', 'script_excerpt', '开门', '开门')
    b = source_snapshot('prop', 'p', 'description', '红门', '')
    first = quality_source_fingerprint(QualitySourceBundle(sources=[a, b]))
    a.literal_in_prompt = False
    assert first == quality_source_fingerprint(QualitySourceBundle(sources=[b, a]))
    changed = source_snapshot('prop', 'p', 'description', '蓝门', '')
    assert first != quality_source_fingerprint(QualitySourceBundle(sources=[a, changed]))


@pytest.mark.asyncio
async def test_adoption_preserves_original_and_rejects_other_shot_and_stale_video(monkeypatch):
    """Use real SQLite rows to verify CAS, ownership and separate manual adoption."""
    import app.services.generation.video_edit_adoption as service
    monkeypatch.setattr(service, 'sync_usage_from_shot_context', AsyncMock())
    engine = create_async_engine('sqlite+aiosqlite:///:memory:')
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as db:
            db.add(Project(id='p', name='test', description='', style='real_people_city', visual_style='live_action'))
            db.add(Chapter(id='c', project_id='p', index=1, title='chapter'))
            db.add_all([FileItem(id=i, type='video', name=i, storage_key=i+'.mp4') for i in ['original', 'edited']])
            shot = Shot(id='s', chapter_id='c', index=1, title='shot', generated_video_file_id='original')
            other = Shot(id='other', chapter_id='c', index=2, title='other')
            task = GenerationTask(id='edit', mode='async_polling', task_kind='video_edit', status='succeeded',
                payload={'snapshot': {'canonical_target': {'kind': 'shot_video_edit', 'entity_id': 's'}}}, result={'file_id': 'edited'})
            db.add_all([shot, other, task]); await db.flush()
            db.add(GenerationTaskLink(task_id='edit', relation_type='shot_video_edit', relation_entity_id='s', resource_type='video', file_id='edited'))
            await db.flush()
            with pytest.raises(HTTPException) as cross:
                await adopt_video_edit(db, shot_id='other', task_id='edit', expected_current_file_id=None)
            assert cross.value.status_code == 404
            with pytest.raises(HTTPException) as stale:
                await adopt_video_edit(db, shot_id='s', task_id='edit', expected_current_file_id=None)
            assert stale.value.status_code == 409 and shot.generated_video_file_id == 'original'
            assert await adopt_video_edit(db, shot_id='s', task_id='edit', expected_current_file_id='original') == 'edited'
            assert await adopt_video_edit(db, shot_id='s', task_id='edit', expected_current_file_id='original') == 'edited'
            assert await db.get(FileItem, 'original') is not None
            assert task.result['replaced_file_id'] == 'original'
            assert other.generated_video_file_id is None
    finally:
        await engine.dispose()
