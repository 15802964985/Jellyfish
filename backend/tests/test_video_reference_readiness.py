"""Model-aware readiness and HappyHorse first-frame request regression tests."""
from types import SimpleNamespace

import httpx
import pytest

from app.models.llm import Model, ModelConfigRevision, ModelSettings
from app.services.studio.shot_video_readiness import _model_reference_mode_ready
from app.core.contracts.video_generation import VideoGenerationInput, VideoFrameReferences
from app.core.contracts.media import MediaReference
from app.core.integrations.aliyun.video import _build_video_body
from app.core.integrations.response_errors import raise_provider_error
from app.core.integrations.video_capabilities import validate_video_options


class ModelSession:
    """Minimal read-only default-model lookup without database or external API calls."""
    def __init__(self, model_name):
        self.rows = {
            ModelSettings: SimpleNamespace(default_video_model_id='model'),
            Model: SimpleNamespace(current_revision_id='revision'),
            ModelConfigRevision: SimpleNamespace(provider_key='aliyun_bailian', model_name=model_name),
        }

    async def get(self, entity, key):
        """Return the configured test model revision."""
        return self.rows.get(entity)


@pytest.mark.asyncio
@pytest.mark.parametrize('model,mode,ok', [
    ('happyhorse-1.1-i2v', 'text_only', False),
    ('happyhorse-1.1-i2v', 'first', True),
    ('happyhorse-1.1-i2v', 'first_last', False),
    ('happyhorse-1.1-t2v', 'text_only', True),
    ('happyhorse-1.1-t2v', 'first', False),
    ('happyhorse-1.1-r2v', 'text_only', False),
])
async def test_readiness_checks_model_input_contract(model, mode, ok):
    """File existence alone cannot make an incompatible input mode ready."""
    result = await _model_reference_mode_ready(ModelSession(model), mode)
    assert result.key == 'model_reference_mode'
    assert result.ok is ok


def test_happyhorse_preserves_actual_first_frame_and_rejects_missing_input():
    """The selected shot frame reaches the documented input.media field unchanged."""
    value = VideoGenerationInput(model='happyhorse-1.1-i2v', prompt='walk', ratio='16:9', seconds=5,
        frame_references=VideoFrameReferences(first_frame=MediaReference(file_id='shot-first', media_kind='image')))
    validate_video_options(provider='aliyun_bailian', model=value.model, input_=value)
    # The execution FileResolver projects persisted file IDs to provider URLs.
    projected = value.model_copy(update={'frame_references': SimpleNamespace(
        first_frame='https://example.com/first.png', last_frame=None, key_frames=[])})
    body = _build_video_body(projected)
    assert body['input']['media'] == [{'type': 'first_frame', 'url': 'https://example.com/first.png'}]
    assert 'ratio' not in body['parameters']
    missing = VideoGenerationInput(model=value.model, prompt='walk', ratio='16:9', seconds=5)
    with pytest.raises(ValueError, match='first frame is required'):
        validate_video_options(provider='aliyun_bailian', model=missing.model, input_=missing)


def test_agent_plan_rejection_keeps_diagnostics_and_does_not_rewrite_endpoint():
    """A model entitlement error is not repaired by switching billing endpoints."""
    url = 'https://ark.cn-beijing.volces.com/api/plan/v3/contents/generations/tasks'
    response = httpx.Response(404, request=httpx.Request('POST', url), json={
        'error': {'code': 'UnsupportedModel', 'message': 'The requested model does not support the agent plan feature.'},
        'request_id': 'req-plan-test',
    })
    with pytest.raises(httpx.HTTPStatusError) as caught:
        raise_provider_error(response, provider='volcengine')
    assert 'UnsupportedModel' in str(caught.value)
    assert 'req-plan-test' in str(caught.value)
    assert '不会自动切换' in str(caught.value)
    assert str(caught.value.request.url) == url
