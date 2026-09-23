"""供应商模型目录发现测试。"""

from __future__ import annotations

import httpx
import pytest

from app.core.contracts.provider import ProviderConfig
from app.core.integrations.model_catalog import discover_provider_models


def _patch_httpx_client(monkeypatch: pytest.MonkeyPatch, transport: httpx.MockTransport) -> None:
    """让目录发现 adapter 的 AsyncClient 使用 MockTransport。"""
    real_client = httpx.AsyncClient

    def factory(**kwargs: object) -> httpx.AsyncClient:
        return real_client(transport=transport, timeout=kwargs.get("timeout", 15.0))  # type: ignore[arg-type]

    monkeypatch.setattr(httpx, "AsyncClient", factory)


@pytest.mark.asyncio
@pytest.mark.parametrize("provider", ["google", "anthropic"])
async def test_native_catalog_pagination_and_auth(monkeypatch, provider):
    """Native catalogues use their documented auth and cursor, not Bearer assumptions."""
    calls = []
    def handler(request):
        """Two pages exercise the provider-specific next cursor."""
        calls.append(request)
        if provider == "google":
            assert request.headers["x-goog-api-key"] == "k"
            if len(calls) == 1:
                return httpx.Response(200, json={"models": [{"name": "models/gemini-text", "supportedGenerationMethods": ["generateContent"]}], "nextPageToken": "next"})
            assert request.url.params["pageToken"] == "next"
            return httpx.Response(200, json={"models": [{"name": "models/gemini-image", "supportedGenerationMethods": ["generateContent"]}]})
        assert request.headers["x-api-key"] == "k"
        if len(calls) == 1:
            return httpx.Response(200, json={"data": [{"id": "claude-one"}], "has_more": True, "last_id": "claude-one"})
        assert request.url.params["after_id"] == "claude-one"
        return httpx.Response(200, json={"data": [{"id": "claude-two"}], "has_more": False})
    _patch_httpx_client(monkeypatch, httpx.MockTransport(handler))
    result = await discover_provider_models(cfg=ProviderConfig(provider=provider, api_key="k", base_url="https://example.invalid/v1"))
    assert len(calls) == 2
    assert all(model.category.value == "text" for model in result.models)
    assert len(result.models) == (1 if provider == "google" else 2)


@pytest.mark.asyncio
async def test_openai_compatible_catalog_reads_models_endpoint(monkeypatch: pytest.MonkeyPatch) -> None:
    """OpenAI 兼容供应商应在后端使用 Bearer 密钥读取 `/models`。"""

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path.endswith("/v1/models")
        assert request.headers.get("authorization") == "Bearer secret"
        return httpx.Response(200, json={"data": [{"id": "gpt-4o-mini"}, {"id": "gpt-image-1"}]})

    _patch_httpx_client(monkeypatch, httpx.MockTransport(handler))
    result = await discover_provider_models(
        cfg=ProviderConfig(provider="openai", api_key="secret", base_url="https://api.example/v1")
    )
    assert result.source == "provider_api"
    assert [(item.name, item.category.value) for item in result.models] == [
        ("gpt-4o-mini", "text"),
        ("gpt-image-1", "image"),
    ]
    assert all(item.source == "provider_api" for item in result.models)


@pytest.mark.asyncio
async def test_aliyun_catalog_merges_official_video_and_audio(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Token Plan 实时列表应补足已接入的 HappyHorse 视频和百炼语音模型。"""

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/api/v1/models"):
            return httpx.Response(404, request=request)
        assert request.url.path.endswith("/compatible-mode/v1/models")
        return httpx.Response(
            200,
            json={
                "data": [
                    {"id": "qwen3.8-max"},
                    {"id": "qwen-image-3.0-pro"},
                    {"id": "qwen-audio-3.0-tts-plus"},
                ]
            },
        )

    _patch_httpx_client(monkeypatch, httpx.MockTransport(handler))
    result = await discover_provider_models(
        cfg=ProviderConfig(
            provider="aliyun_bailian",
            api_key="secret",
            base_url="https://token-plan.example/compatible-mode/v1",
        )
    )
    assert result.source == "hybrid"
    names = {item.name for item in result.models}
    assert {"happyhorse-1.1-t2v", "happyhorse-1.1-i2v", "happyhorse-1.1-r2v"} <= names
    assert "qwen-audio-3.0-tts-plus" in names
    audio = next(item for item in result.models if item.name == "qwen-audio-3.0-tts-plus")
    assert audio.category.value == "audio"
    assert audio.capabilities == ["text_to_speech"]
    video = next(item for item in result.models if item.name == "happyhorse-1.1-r2v")
    assert video.source == "provider_catalog"
    assert video.capabilities == ["reference_to_video"]


@pytest.mark.asyncio
async def test_vidu_catalog_uses_official_model_map_without_network() -> None:
    """Vidu 尚未提供模型列表 API 时，刷新应返回内置的官方模型目录。"""
    result = await discover_provider_models(cfg=ProviderConfig(provider="vidu", api_key="secret"))
    assert result.source == "provider_catalog"
    assert ("viduq2", "image") in {(item.name, item.category.value) for item in result.models}
    assert ("viduq3-turbo", "video") in {(item.name, item.category.value) for item in result.models}


@pytest.mark.asyncio
async def test_kling_catalog_uses_static_model_map_without_network() -> None:
    """可灵仅暴露项目确认的静态模型目录，刷新时不请求 `/models`。"""
    result = await discover_provider_models(cfg=ProviderConfig(provider="kling", api_key="secret"))
    assert result.source == "provider_catalog"
    assert {(item.name, item.category.value) for item in result.models} == {
        ("kling-3.0-turbo", "video"),
        ("kling-3.0-omni", "video"),
        ("kling-o1", "video"),
        ("kling-3.0", "video"),
        ("kling-v3", "image"),
    }


@pytest.mark.asyncio
async def test_volcengine_plan_falls_back_when_models_endpoint_is_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Token Plan 未实现 `/models` 时应返回内置目录，不阻断手动建模。"""

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path.endswith("/api/plan/v3/models")
        return httpx.Response(404, request=request)

    _patch_httpx_client(monkeypatch, httpx.MockTransport(handler))
    result = await discover_provider_models(
        cfg=ProviderConfig(
            provider="volcengine",
            api_key="secret",
            base_url="https://ark.cn-beijing.volces.com/api/plan/v3",
        )
    )
    assert result.source == "provider_catalog"
    assert {(item.name, item.category.value) for item in result.models} == {
        ("doubao-seed-2.0-lite", "text"),
        ("doubao-seedream-5.0-lite", "image"),
        ("doubao-seedance-1.5-pro", "video"),
        ("doubao-seedance-2-5-260628", "video"),
    }


@pytest.mark.asyncio
async def test_volcengine_catalog_does_not_hide_authentication_errors(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """火山目录鉴权失败必须显式报错，不能使用静态目录掩盖错误密钥。"""

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, request=request)

    _patch_httpx_client(monkeypatch, httpx.MockTransport(handler))
    with pytest.raises(httpx.HTTPStatusError) as exc_info:
        await discover_provider_models(
            cfg=ProviderConfig(
                provider="volcengine",
                api_key="invalid",
                base_url="https://ark.cn-beijing.volces.com/api/plan/v3",
            )
        )
    assert exc_info.value.response.status_code == 401
