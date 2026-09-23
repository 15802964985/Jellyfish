"""Verify real serialized requests are captured and credentials/media cannot enter diagnostic records."""
import json
import pytest
import httpx
from app.core.integrations.traced_http import TracedAsyncClient, call_sink, sanitize


@pytest.mark.asyncio
async def test_real_request_success_is_recorded_without_secret_or_media():
    """Record the outgoing JSON and provider request ID while preserving request order and prompt."""
    records = []
    async def sink(attempt, values):
        """Capture persistence events without touching the business database."""
        records.append((attempt, values))
    def handler(request):
        """Simulate provider receipt using the exact submitted body."""
        assert json.loads(request.content)["resolution"] == "480P"
        return httpx.Response(200, json={"request_id": "provider-1", "output": {"task_id": "remote-1"}})
    token = call_sink.set(sink)
    try:
        async with TracedAsyncClient(transport=httpx.MockTransport(handler)) as client:
            await client.post("https://official.test/tasks?signature=private", headers={"Authorization": "Bearer SECRET"},
                json={"prompt": "保留完整中文提示词", "resolution": "480P", "image": "data:image/png;base64,AAAA"})
    finally:
        call_sink.reset(token)
    serialized = json.dumps(records, ensure_ascii=False)
    assert "SECRET" not in serialized and "signature=private" not in serialized and "AAAA" not in serialized
    assert "保留完整中文提示词" in serialized and "provider-1" in serialized and "remote-1" in serialized
    assert len(records) == 2 and records[0][0] == records[1][0]


@pytest.mark.asyncio
async def test_unknown_transport_result_never_retries():
    """A disconnected submission records an unknown result and performs exactly one attempt."""
    records = []
    attempts = 0
    async def sink(attempt, values):
        """Capture the audit transition for the attempted submission."""
        records.append(values)
    def handler(request):
        """Fail after submission without revealing credentials in the exception."""
        nonlocal attempts
        attempts += 1
        raise httpx.ReadError("connection lost", request=request)
    token = call_sink.set(sink)
    try:
        async with TracedAsyncClient(transport=httpx.MockTransport(handler)) as client:
            with pytest.raises(httpx.ReadError):
                await client.post("https://official.test/tasks", json={"prompt": "test"})
    finally:
        call_sink.reset(token)
    assert attempts == 1 and records[-1]["state"] == "transport_error"


def test_nested_sensitive_configuration_is_redacted():
    """Diagnostic exports recursively sanitize config credentials and signed URLs."""
    assert sanitize({"api_key": "private", "nested": [{"url": "https://user:password@test/a?token=private"}]}) == {
        "api_key": "[redacted]", "nested": [{"url": "https://test/a"}]}
