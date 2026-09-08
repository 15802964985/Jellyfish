"""Provider identity remains stable across rename and queued text execution."""
import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from app.core.db import Base
from app.models.llm import Provider, ModelConfigRevision, ModelCategoryKey
from app.schemas.llm import ProviderCreate, ProviderUpdate, ModelCreate
from app.services.llm.manage import create_provider, update_provider, create_model
from app.services.llm.provider_registry import resolve_provider_key
from app.services.llm.runtime import build_text_llm_revision_sync


@pytest.mark.asyncio
async def test_custom_provider_rename_and_category_guard():
    """Custom display names work; changing protocols cannot break referenced jobs."""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    async with async_sessionmaker(engine, expire_on_commit=False)() as db:
        provider = await create_provider(db, body=ProviderCreate(id="p", name="内部模型服务", adapter_key="custom_openai_text", base_url="https://example.invalid/v1", api_key="k"))
        assert resolve_provider_key(provider) == "custom_openai_text"
        model = await create_model(db, body=ModelCreate(id="m", name="text-model", provider_id="p", category=ModelCategoryKey.text))
        old_revision = model.current_revision_id
        await update_provider(db, provider_id="p", body=ProviderUpdate(name="新名称"))
        assert provider.adapter_key == "custom_openai_text"
        assert (await db.get(ModelConfigRevision, old_revision)).provider_key == "custom_openai_text"
        with pytest.raises(HTTPException) as error:
            await update_provider(db, provider_id="p", body=ProviderUpdate(adapter_key="google"))
        assert error.value.status_code == 409
        assert provider.adapter_key == "custom_openai_text"
        with pytest.raises(HTTPException):
            await create_model(db, body=ModelCreate(id="image", name="image-model", provider_id="p", category=ModelCategoryKey.image))
    await engine.dispose()


@pytest.mark.asyncio
async def test_reject_unknown_adapter_and_credential_url():
    """Fail before persistence or network calls; a name alone cannot create executable code."""
    for key, url in [("unimplemented", "https://example.invalid/v1"), ("custom_openai_text", "https://secret@example.invalid/v1")]:
        with pytest.raises(HTTPException) as error:
            await create_provider(None, body=ProviderCreate(id="p", name="x", adapter_key=key, base_url=url))
        assert error.value.status_code == 400


def test_text_revision_freezes_protocol(monkeypatch):
    """Worker selects protocol from revision, not a renamed/reconfigured live provider."""
    from app.services.llm import runtime
    provider = Provider(id="p", name="anything", adapter_key="google", api_key="k")
    revision = ModelConfigRevision(id="r", category=ModelCategoryKey.text, provider_key="anthropic", credential_ref="provider:p", model_name="frozen-model", model_params={}, endpoint_config={"base_url": "https://example.invalid/v1"})
    class FakeSession:
        """Read only the two references needed by the worker."""
        def get(self, model, key):
            return revision if model is ModelConfigRevision else provider
    model = build_text_llm_revision_sync(FakeSession(), revision_id="r", thinking=False)
    assert model.protocol == "anthropic_messages"
    assert model.model_name == "frozen-model"
