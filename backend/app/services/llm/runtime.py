"""给 Celery worker 使用的同步 LLM runtime。"""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException
from langchain_core.language_models.chat_models import BaseChatModel
from sqlalchemy.orm import Session

from app.models.llm import Model, ModelCategoryKey, ModelConfigRevision, ModelSettings, Provider
from app.services.llm.provider_resolver import resolve_effective_base_url


def _default_model_id(settings_row: ModelSettings | None, category: ModelCategoryKey) -> str | None:
    if settings_row is None:
        return None
    if category == ModelCategoryKey.text:
        return settings_row.default_text_model_id
    if category == ModelCategoryKey.image:
        return settings_row.default_image_model_id
    if category == ModelCategoryKey.video:
        return settings_row.default_video_model_id
    return settings_row.default_audio_model_id


def _require_provider_and_model_sync(
    db: Session,
    *,
    category: ModelCategoryKey,
) -> tuple[Provider, Model]:
    settings_row = db.get(ModelSettings, 1)
    model_id = _default_model_id(settings_row, category)
    if not model_id:
        raise HTTPException(status_code=503, detail=f"No default model configured for category={category.value}")

    model = db.get(Model, model_id)
    if model is None:
        raise HTTPException(status_code=503, detail=f"Configured default model not found: {model_id}")

    provider = db.get(Provider, model.provider_id)
    if provider is None:
        raise HTTPException(status_code=503, detail=f"Provider not found for model_id={model.id}")

    return provider, model


def build_default_text_llm_sync(
    db: Session,
    *,
    thinking: bool,
) -> BaseChatModel:
    provider, model = _require_provider_and_model_sync(db, category=ModelCategoryKey.text)

    return _build_text_llm(provider=provider, model=model, thinking=thinking)


def build_text_llm_sync(
    db: Session,
    *,
    model_id: str,
    thinking: bool,
) -> BaseChatModel:
    """Build the exact text model approved when an asynchronous task was created."""

    model = db.get(Model, model_id)
    if model is None or model.category != ModelCategoryKey.text:
        raise HTTPException(status_code=503, detail=f"Configured text model not found: {model_id}")
    provider = db.get(Provider, model.provider_id)
    if provider is None:
        raise HTTPException(status_code=503, detail=f"Provider not found for model_id={model.id}")
    return _build_text_llm(provider=provider, model=model, thinking=thinking)


def build_text_llm_revision_sync(
    db: Session,
    *,
    revision_id: str,
    thinking: bool,
) -> BaseChatModel:
    """Build a text client from the immutable model/endpoint revision and current referenced credential."""

    revision = db.get(ModelConfigRevision, revision_id)
    if revision is None or revision.category != ModelCategoryKey.text:
        raise HTTPException(status_code=503, detail=f"Configured text model revision not found: {revision_id}")
    prefix, separator, provider_id = revision.credential_ref.partition(":")
    if prefix != "provider" or separator != ":" or not provider_id:
        raise HTTPException(status_code=503, detail="Configured text model credential reference is invalid")
    provider = db.get(Provider, provider_id)
    if provider is None:
        raise HTTPException(status_code=503, detail=f"Provider not found for model revision={revision.id}")
    return _build_text_llm_config(
        provider=provider,
        model_name=revision.model_name,
        provider_key=revision.provider_key,
        model_params=dict(revision.model_params or {}),
        base_url=str((revision.endpoint_config or {}).get("base_url") or ""),
        thinking=thinking,
    )


def _build_text_llm(*, provider: Provider, model: Model, thinking: bool) -> BaseChatModel:

    return _build_text_llm_config(
        provider=provider,
        model_name=model.name,
        model_params=dict(model.params or {}),
        base_url=resolve_effective_base_url(provider=provider, category=ModelCategoryKey.text),
        thinking=thinking,
    )


def _build_text_llm_config(
    *,
    provider: Provider,
    model_name: str,
    model_params: dict[str, Any],
    base_url: str | None,
    thinking: bool,
    provider_key: str | None = None,
) -> BaseChatModel:

    from app.bootstrap import bootstrap_all_registries
    from app.services.llm.provider_registry import get_provider_spec, resolve_provider_key
    bootstrap_all_registries()
    spec = get_provider_spec(provider_key or resolve_provider_key(provider))
    if spec.text_protocol in {"google_generate_content", "anthropic_messages"}:
        from app.core.integrations.native_chat import NativeTextChat
        if not provider.api_key:
            raise HTTPException(status_code=503, detail="供应商未配置 API Key")
        return NativeTextChat(protocol=spec.text_protocol, model_name=model_name, api_key=provider.api_key,
            base_url=base_url or spec.default_base_url or "", options=dict(model_params))

    api_key = (provider.api_key or "").strip()
    if not api_key:
        raise HTTPException(status_code=503, detail=f"Provider api_key is empty for provider_id={provider.id}")

    try:
        from langchain_openai import ChatOpenAI
    except ImportError as e:
        raise HTTPException(status_code=503, detail="Install langchain-openai to enable script-processing tasks") from e

    kwargs: dict[str, Any] = dict(model_params)
    if spec.key == "minimax":
        kwargs["extra_body"] = {**dict(kwargs.get("extra_body") or {}), "reasoning_split": True}
    kwargs["model"] = model_name
    kwargs["api_key"] = api_key
    kwargs.setdefault("temperature", 0)

    if base_url:
        kwargs.setdefault("base_url", base_url)

    from app.services.llm.provider_registry import resolve_provider_key
    # Unknown provider-specific thinking controls remain explicit model configuration.
    if not thinking and spec.key == "aliyun_bailian":
        extra_body = dict(kwargs.get("extra_body") or {})
        extra_body["enable_thinking"] = False
        kwargs["extra_body"] = extra_body

    return ChatOpenAI(**kwargs)
