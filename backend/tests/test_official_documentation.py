"""Official evidence reader must not become an arbitrary URL fetcher."""
import socket
from unittest.mock import AsyncMock

import httpx
import pytest

from app.services.llm import documentation as docs


@pytest.mark.asyncio
@pytest.mark.parametrize("url", ["http://help.aliyun.com/", "https://127.0.0.1/", "https://help.aliyun.com.evil.test/", "https://a:b@help.aliyun.com/", "https://help.aliyun.com/?key=x"])
async def test_reject_untrusted_origins(url):
    """Reject invalid origins before DNS or HTTP."""
    with pytest.raises(ValueError):
        await docs.validate_official_url(url)


@pytest.mark.asyncio
async def test_reject_private_resolution(monkeypatch):
    """Even an allowlisted host must not resolve to a local service."""
    monkeypatch.setattr(socket, "getaddrinfo", lambda *args, **kwargs: [(2, 1, 6, "", ("127.0.0.1", 443))])
    with pytest.raises(ValueError):
        await docs.validate_official_url("https://help.aliyun.com/")


@pytest.mark.asyncio
@pytest.mark.parametrize("status,body,expected", [
    (200, "<script>secret_script</script><p>" + "API parameter contract " * 30 + "</p>", "fetched"),
    (302, "redirect", "unavailable"),
    (200, "<div id='root'></div>", "unreadable"),
    (200, "x" * (docs.MAX_BYTES + 1), "unavailable"),
], ids=["html", "redirect", "dynamic", "too-large"])
async def test_bounded_read_and_no_secrets(monkeypatch, status, body, expected):
    """Fetch only inert bounded text, with no automatic redirects or credential headers."""
    monkeypatch.setattr(docs, "validate_official_url", AsyncMock())
    original_client = httpx.AsyncClient
    def respond(request):
        assert "authorization" not in request.headers
        assert "cookie" not in request.headers
        return httpx.Response(status, text=body, headers={"content-type": "text/html", "location": "http://127.0.0.1/"})
    monkeypatch.setattr(docs.httpx, "AsyncClient", lambda **kwargs: original_client(transport=httpx.MockTransport(respond), **kwargs))
    result = await docs.fetch_official_document("https://help.aliyun.com/")
    assert result.status == expected
    assert "secret_script" not in result.text
    if expected == "fetched":
        assert len(result.content_sha256) == 64


@pytest.mark.asyncio
async def test_missing_source():
    """Missing metadata is not a successful official check."""
    assert (await docs.fetch_official_document(None)).status == "not_registered"
