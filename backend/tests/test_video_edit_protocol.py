"""Offline editing contract and HTTP protocol regressions; never contact a paid model."""
import json
import httpx
import pytest
from pydantic import ValidationError
from app.core.contracts.generation import VideoEditOperationInput
from app.core.contracts.media import VideoEditMediaInput, MediaReference
from app.core.integrations.fal_video_edit import FalVideoEditAdapter, FAL_EDIT_MODEL, validate_queue_url
from app.services.generation.submission.submitter import _iter_media_references


def test_edit_requires_explicit_consent_and_separate_media_roles():
    """Ordinary image/frame references cannot masquerade as a source video."""
    with pytest.raises(ValidationError):
        VideoEditOperationInput(client_request_id='request-123456789', external_transfer_confirmed=False, billing_confirmed=True)
    with pytest.raises(ValidationError):
        VideoEditMediaInput(source=MediaReference(file_id='i', media_kind='image'))
    media = VideoEditMediaInput(source=MediaReference(file_id='v', media_kind='video'),
        references=[MediaReference(file_id='i', media_kind='image')])
    assert [group for group, _ in _iter_media_references(media)] == ['source', 'references']


@pytest.mark.parametrize('url', ['http://queue.fal.run/fal-ai/kling-video/a',
    'https://evil.example/fal-ai/kling-video/a', 'https://queue.fal.run@evil.example/fal-ai/kling-video/a',
    'https://queue.fal.run:8443/fal-ai/kling-video/a', 'https://queue.fal.run/another-model/a'])
def test_fal_tracking_urls_never_leak_authorization(url):
    """Reject unsafe origin/path before the HTTP client receives a request."""
    with pytest.raises(ValueError):
        validate_queue_url(url)


@pytest.mark.asyncio
async def test_fal_edit_payload_queue_result_and_cancel():
    """Exercise actual adapter serialization, credentials, and output extraction."""
    requests = []
    receipt = {'request_id': 'request-1', **{key: f'https://queue.fal.run/fal-ai/kling-video/requests/request-1/{suffix}'
        for key, suffix in [('status_url', 'status'), ('response_url', 'response'), ('cancel_url', 'cancel')]}}
    def handle(request):
        """Deterministic local transport, including model-specific output shape."""
        requests.append(request)
        assert request.headers['Authorization'] == 'Key secret-key'
        if request.method == 'POST':
            data = json.loads(request.content)
            assert data == {'prompt': '修改 @Video1 参考 @Image1', 'video_url': 'data:video/mp4;base64,AA==',
                'image_urls': ['data:image/png;base64,AA=='], 'keep_audio': True}
            return httpx.Response(200, json=receipt)
        if request.url.path.endswith('/status'):
            return httpx.Response(200, json={'status': 'COMPLETED'})
        if request.method == 'PUT':
            return httpx.Response(202, json={'status': 'CANCELLATION_REQUESTED'})
        return httpx.Response(200, json={'video': {'url': 'https://v3.fal.media/result.mp4'}})
    async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as client:
        adapter = FalVideoEditAdapter(client, 'secret-key')
        saved = await adapter.submit(model=FAL_EDIT_MODEL, prompt='修改 @Video1 参考 @Image1',
            video_url='data:video/mp4;base64,AA==', image_urls=['data:image/png;base64,AA=='], keep_audio=True)
        assert saved == receipt
        assert (await adapter.status(saved))['status'] == 'COMPLETED'
        assert await adapter.result(saved) == 'https://v3.fal.media/result.mp4'
        assert (await adapter.cancel(saved))['status'] == 'CANCELLATION_REQUESTED'
    assert sum(r.method == 'POST' for r in requests) == 1


@pytest.mark.asyncio
async def test_unknown_submission_never_retries():
    """An empty receipt is an uncertain paid outcome, not permission to retry."""
    calls = []
    def handle(request):
        """Return a malformed success to emulate a lost/partial submit receipt."""
        calls.append(request)
        return httpx.Response(200, json={})
    async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as client:
        with pytest.raises(ValueError, match='outcome unknown'):
            await FalVideoEditAdapter(client, 'key').submit(model=FAL_EDIT_MODEL,
                prompt='修改', video_url='video', image_urls=[], keep_audio=True)
    assert len(calls) == 1
