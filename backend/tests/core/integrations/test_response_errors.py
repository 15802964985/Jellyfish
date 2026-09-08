"""Cross-provider error envelope tests: useful diagnostics, no credential dumps."""
import httpx
import pytest
from app.core.integrations.response_errors import raise_provider_error


@pytest.mark.parametrize('provider', ['openai', 'volcengine', 'aliyun_bailian', 'vidu', 'kling'])
def test_error_details_and_secret_redaction(provider):
    """The helper accepts both nested and flat errors without returning raw bodies."""
    for body in [
        {'error': {'code': 'ModelUnavailable', 'message': 'bad sk-test-secret https://host/private'}, 'request_id': 'req-1'},
        {'code': 'ModelUnavailable', 'message': 'bad sk-test-secret https://host/private', 'request_id': 'req-1'},
    ]:
        response = httpx.Response(404, json=body, request=httpx.Request('POST', 'https://host/tasks'))
        with pytest.raises(httpx.HTTPStatusError) as error:
            raise_provider_error(response, provider=provider, api_key='sk-test-secret')
        message = str(error.value)
        assert 'ModelUnavailable' in message and 'req-1' in message
        assert 'sk-test-secret' not in message and '/private' not in message


def test_html_error_not_dumped_and_success_unchanged():
    """Proxy HTML often contains operational details; retain only HTTP status."""
    request = httpx.Request('POST', 'https://host/tasks')
    with pytest.raises(httpx.HTTPStatusError) as error:
        raise_provider_error(httpx.Response(502, text='private proxy diagnostic', request=request), provider='proxy')
    assert 'private' not in str(error.value)
    raise_provider_error(httpx.Response(200, json={}, request=request), provider='proxy')
