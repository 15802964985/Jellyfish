"""BFL async normalization without any paid model request."""
import httpx
import pytest
from app.core.contracts.provider import ProviderConfig
from app.core.contracts.image_generation import ImageGenerationInput
from app.core.integrations.bfl_images import BflImageApiAdapter, build_bfl_body


@pytest.mark.asyncio
async def test_bfl_single_submit_and_normalized_artifact(monkeypatch):
    """Ready images enter the shared result contract, no second generation submission."""
    original = httpx.AsyncClient
    calls = []
    def respond(request):
        """Simulate a provider job without billing or external networking."""
        calls.append(request)
        assert request.headers["x-key"] == "k"
        if request.method == "POST":
            return httpx.Response(200, json={"id": "job", "polling_url": "https://api.bfl.ai/v1/get_result?id=job"})
        return httpx.Response(200, json={"status": "Ready", "result": {"sample": "https://cdn.example.invalid/image.png"}})
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: original(transport=httpx.MockTransport(respond), **kwargs))
    result = await BflImageApiAdapter().generate(cfg=ProviderConfig(provider="bfl", api_key="k"), inp=ImageGenerationInput(model="flux-2-pro", prompt="pencil"), timeout_s=5)
    assert result.status == "succeeded" and result.provider_task_id == "job"
    assert result.images[0].url.endswith("image.png")
    assert [call.method for call in calls] == ["POST", "GET"]


@pytest.mark.asyncio
async def test_bfl_refuses_foreign_polling_host(monkeypatch):
    """A provider response cannot redirect credentials to an unrelated site."""
    original = httpx.AsyncClient
    calls = []
    def respond(request):
        calls.append(request)
        return httpx.Response(200, json={"id": "job", "polling_url": "https://attacker.invalid/result"})
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: original(transport=httpx.MockTransport(respond), **kwargs))
    with pytest.raises(ValueError, match="可信"):
        await BflImageApiAdapter().generate(cfg=ProviderConfig(provider="bfl", api_key="k"), inp=ImageGenerationInput(model="flux-2-pro", prompt="pencil"), timeout_s=5)
    assert len(calls) == 1


def test_bfl_unknown_model_rejected():
    """Unknown model names cannot inherit an unrelated request contract."""
    with pytest.raises(ValueError, match="型号"):
        build_bfl_body(ImageGenerationInput(model="future", prompt="pencil"))
