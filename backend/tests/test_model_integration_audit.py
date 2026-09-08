"""Offline audit must not mistake configuration for verified business support."""
import pytest

from app.models.llm import Model, ModelCategoryKey, Provider
from app.services.llm.integration_audit import audit_model_integration


@pytest.mark.parametrize("name", ["OpenAI", "阿里百炼", "火山引擎", "Vidu", "可灵 AI"])
def test_all_builtin_providers_have_official_evidence_entry(name):
    """Each registered provider needs a visible official evidence entry, never a fake pass."""
    provider = Provider(id="p", name=name, base_url="https://example.com/v1", api_key="secret")
    model = Model(id="m", name="unknown-model", provider_id="p", category=ModelCategoryKey.image)
    report = audit_model_integration(model=model, provider=provider)
    assert report.official_documentation.startswith("https://")
    assert report.documentation_status == "pending_review"
    assert report.business_verification_status == "not_verified"
    assert "secret" not in report.model_dump_json()


def test_package_endpoint_preserved_and_credentials_not_displayed():
    """Do not request configured endpoints, leak URL credentials, or switch billing paths."""
    provider = Provider(id="p", name="火山引擎", base_url="https://user:password@example.com/api/plan/v3?key=secret", api_key="secret")
    model = Model(id="m", name="x", provider_id="p", category=ModelCategoryKey.video)
    report = audit_model_integration(model=model, provider=provider)
    assert report.endpoint == "https://example.com/api/plan/v3"
    assert "password" not in report.model_dump_json()
    assert any("套餐" in issue for issue in report.issues)


def test_unsupported_audio_not_certified():
    """A manually configured audio model cannot create an adapter that does not exist."""
    provider = Provider(id="p", name="OpenAI", base_url="https://api.openai.com/v1", api_key="secret")
    model = Model(id="m", name="tts-1", provider_id="p", category=ModelCategoryKey.audio)
    assert not audit_model_integration(model=model, provider=provider).adapter_registered


def test_database_string_category_and_new_provider_without_docs(monkeypatch):
    """New provider metadata is dynamic; missing evidence must stay explicitly unknown."""
    from app.services.llm import integration_audit
    from app.services.llm.provider_registry import ProviderSpec
    spec = ProviderSpec(key="future", display_name="Future", aliases=(), supported_categories=(ModelCategoryKey.text,))
    monkeypatch.setattr(integration_audit, "resolve_provider_key", lambda provider: "future")
    monkeypatch.setattr(integration_audit, "get_provider_spec", lambda key: spec)
    monkeypatch.setattr(integration_audit, "resolve_effective_base_url", lambda **kwargs: "https://example.invalid/v1")
    provider = Provider(id="p", name="Future", base_url="https://example.invalid/v1", api_key="x")
    model = Model(id="m", name="new", provider_id="p", category="text")
    report = audit_model_integration(model=model, provider=provider)
    assert report.official_documentation is None
    assert any("尚未登记" in issue for issue in report.issues)
    assert report.documentation_status == "pending_review"
