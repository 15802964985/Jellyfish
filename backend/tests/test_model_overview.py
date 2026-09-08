"""Read-only overview regression tests: no database writes, remote discovery or paid calls."""
import httpx
import pytest
from app.models.llm import Model, Provider
from app.services.llm.model_overview import build_model_overview
from app.core.integrations.model_catalog import builtin_provider_catalog, discover_provider_models
from app.core.contracts.provider import ProviderConfig


def provider(key="hunyuan", id="p1", **kwargs):
    """Build a local account fixture with deliberately recognizable secret values."""
    values = dict(id=id, name=id, adapter_key=key, api_key="secret-not-for-output", api_secret="secret-sk",
                  base_url="https://tokenhub.tencentmaas.com/v1", status="active")
    values.update(kwargs)
    return Provider(**values)


def model(name="hy-image-v3", category="image", id="m1"):
    """Use an exact implemented model identity, independent of database defaults."""
    return Model(id=id, name=name, category=category, params={})


def find(result, key, name, category):
    """Select an exact row; image/video models may deliberately share a name."""
    return next(item for item in result.models if
                (item.provider_key, item.model_name, item.category) == (key, name, category))


def test_empty_database_shows_supported_catalog_without_network(monkeypatch):
    """Users can choose a model before configuring anything; no discovery or inference is permitted."""
    def blocked(*args, **kwargs):
        raise AssertionError("Overview must not access the network")
    monkeypatch.setattr(httpx.AsyncClient, "request", blocked)
    result = build_model_overview([], [])
    assert len(result.models) >= 60
    assert all(item.configuration_status == "not_configured" for item in result.models)
    assert all(item.integration == "integrated" and item.scenario_keys for item in result.models)
    assert len(result.scenarios) == 11
    assert find(result, "minimax", "speech-2.8-hd", "audio").scenario_keys == ["narration"]


def test_saved_model_merges_with_catalog_and_keeps_multiple_accounts():
    """One healthy and one disabled account remain separately actionable without duplicated model rows."""
    good, disabled = provider(), provider(id="p2", status="disabled")
    result = build_model_overview([(model(), good), (model(id="m2"), disabled)], [good, disabled])
    entry = find(result, "hunyuan", "hy-image-v3", "image")
    assert entry.configuration_status == "configured"
    assert {c.status for c in entry.configurations} == {"configured", "needs_attention"}
    assert len(entry.configurations) == 2
    assert len([m for m in result.models if m.key == entry.key]) == 1
    assert entry.provider_ids == ["p1", "p2"]
    serialized = result.model_dump_json()
    assert "secret-not-for-output" not in serialized and "secret-sk" not in serialized
    assert result.models[0].configurations


def test_provider_without_models_is_configuration_destination():
    """An existing account is not mistaken for a configured model."""
    p = provider()
    entry = find(build_model_overview([], [p]), "hunyuan", "hy-image-v3", "image")
    assert entry.provider_ids == ["p1"]
    assert not entry.configurations and entry.configuration_status == "not_configured"


@pytest.mark.parametrize("changes", [{"api_key": ""}, {"status": "disabled"}, {"base_url": "https://example.invalid"}])
def test_incomplete_or_disabled_account_is_not_ready(changes):
    """Registration, account credentials and supported execution are distinct states."""
    p = provider(**changes)
    entry = find(build_model_overview([(model(), p)], [p]), "hunyuan", "hy-image-v3", "image")
    assert entry.integration == "integrated"
    assert entry.configuration_status == "needs_attention"


def test_unknown_saved_model_is_visible_but_not_certified():
    """Never turn a provider-wide media default into evidence for an arbitrary model name."""
    p = provider()
    result = build_model_overview([(model(name="invented-video", category="video"), p)], [p])
    entry = find(result, "hunyuan", "invented-video", "video")
    assert entry.integration == "unverified" and entry.scenario_keys == []
    assert entry.configuration_status == "needs_attention"


def test_custom_text_keeps_protocol_scenarios_without_certifying_model():
    """Self-service text providers remain discoverable without claiming exact-model validation."""
    p = provider(key="custom_openai_text")
    entry = find(build_model_overview([(model(name="my-model", category="text"), p)], [p],
                                     domestic_only=False), "custom_openai_text", "my-model", "text")
    assert set(entry.scenario_keys) == {"script", "simplify"}
    assert entry.integration == "unverified" and entry.configuration_status == "needs_attention"


def test_domestic_scope_and_same_name_different_categories():
    """Regional filtering preserves distinct Vidu image/video rows and all-provider protocol notices."""
    domestic = build_model_overview([], [])
    assert not any(item.provider_key in {"fal", "runway", "bfl"} for item in domestic.models)
    full = build_model_overview([], [], domestic_only=False)
    assert any(item.provider_key == "runway" and item.scenario_keys == ["edit"] for item in full.models)
    assert full.notices
    assert find(domestic, "vidu", "viduq1", "image").scenario_keys == ["reference_image"]
    assert find(domestic, "vidu", "viduq1", "video").category == "video"


def test_aliyun_known_images_and_frame_requirements():
    """Mapped Wan images must appear without saved models; Jimeng cannot pretend to be text-to-video."""
    result = build_model_overview([], [])
    entry = find(result, "aliyun_bailian", "wan2.7-image-pro", "image")
    assert set(entry.scenario_keys) == {"concept", "reference_image"}
    video = next(m for m in result.models if m.provider_key == "jimeng" and m.category == "video")
    assert video.scenario_keys == ["first_last"]
    assert "必须提供首帧" in video.limitations and "必须提供尾帧" in video.limitations


@pytest.mark.asyncio
@pytest.mark.parametrize("key", ["minimax", "zhipu", "hunyuan", "jimeng", "vidu", "kling", "bfl", "fal", "runway"])
async def test_local_catalog_is_same_as_existing_discovery(key):
    """Factoring out the offline catalogue must not change existing static discovery results."""
    result = await discover_provider_models(cfg=ProviderConfig(provider=key, api_key="test"))
    assert result == builtin_provider_catalog(key)
