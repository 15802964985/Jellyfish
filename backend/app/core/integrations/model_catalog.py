"""供应商模型目录发现：实时 `/models` 与内置官方目录。"""

from __future__ import annotations

from typing import Any

from app.core.contracts.model_catalog import (
    ModelOperation,
    ProviderModelCandidate,
    ProviderModelCatalog,
)
from app.core.contracts.provider import ProviderConfig
from app.models.llm import ModelCategoryKey


async def discover_provider_models(*, cfg: ProviderConfig) -> ProviderModelCatalog:
    """按供应商协议获取可导入模型，并只暴露已接入 Jellyfish 的模态。"""
    if cfg.provider == "vidu":
        return ProviderModelCatalog(provider_key="vidu", source="provider_catalog", models=_VIDU_MODELS)
    if cfg.provider == "kling":
        return ProviderModelCatalog(provider_key="kling", source="provider_catalog", models=_KLING_MODELS)
    if cfg.provider == "aliyun_bailian":
        return await _discover_aliyun_models(cfg=cfg)
    try:
        return await _discover_openai_compatible_models(cfg=cfg)
    except Exception as exc:
        # Token Plan 不一定实现 `/models`；仅对明确的“接口不存在”回退，不能掩盖鉴权错误。
        if cfg.provider == "volcengine" and _is_missing_models_endpoint(exc):
            return ProviderModelCatalog(
                provider_key="volcengine", source="provider_catalog", models=_VOLCENGINE_MODELS
            )
        raise


def _is_missing_models_endpoint(exc: Exception) -> bool:
    """判断目录发现失败是否仅由供应商未实现 `/models` 导致。"""
    try:
        import httpx
    except ImportError:  # pragma: no cover
        return False
    return isinstance(exc, httpx.HTTPStatusError) and exc.response.status_code in {404, 405}


async def _discover_openai_compatible_models(*, cfg: ProviderConfig) -> ProviderModelCatalog:
    """读取 OpenAI 兼容 `/models`，结合元数据和显式命名规则进行分类。"""
    try:
        import httpx
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError("httpx is required for provider model discovery") from exc

    base_url = (cfg.base_url or "").rstrip("/")
    if not base_url:
        raise ValueError(f"Provider {cfg.provider} has no base_url for model discovery")
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(
            f"{base_url}/models", headers={"Authorization": f"Bearer {cfg.api_key}"}
        )
        response.raise_for_status()
        payload: dict[str, Any] = response.json()
    return ProviderModelCatalog(
        provider_key=cfg.provider,
        source="provider_api",
        models=_provider_api_candidates(provider_key=cfg.provider, payload=payload),
    )


def _provider_api_candidates(
    *, provider_key: str, payload: dict[str, Any]
) -> list[ProviderModelCandidate]:
    """规范化实时目录，并过滤 ASR/TTS/Realtime Audio 等未接入类别。"""
    raw_items = payload.get("data") or payload.get("models") or []
    candidates: dict[tuple[str, str], ProviderModelCandidate] = {}
    for item in raw_items:
        if not isinstance(item, dict):
            continue
        name = str(item.get("id") or item.get("name") or "").strip()
        category = _infer_category(provider_key, name, item=item)
        if not name or category is None:
            continue
        candidate = ProviderModelCandidate(
            name=name,
            category=category,
            source="provider_api",
            capabilities=_infer_operations(
                provider_key=provider_key, model_name=name, category=category
            ),
        )
        candidates[(candidate.name, category.value)] = candidate
    return sorted(candidates.values(), key=lambda value: value.name)


def _infer_category(
    provider_key: str,
    model_name: str,
    *,
    item: dict[str, Any] | None = None,
) -> ModelCategoryKey | None:
    """把供应商模型映射到三类；明确的音频模型返回 None，不再误归为文本。"""
    normalized = model_name.lower()
    metadata = " ".join(
        str(value).lower()
        for value in (item or {}).values()
        if isinstance(value, (str, list, tuple))
    )
    combined = f"{normalized} {metadata}"
    if any(token in combined for token in ("audio", "asr", "tts", "speech", "realtime")):
        return None
    if any(token in combined for token in ("seedream", "image", "dall-e", "cogview")):
        return ModelCategoryKey.image
    video_tokens = ("sora", "seedance", "video", "wanx", "happyhorse", "-t2v", "-i2v", "-r2v")
    if any(token in combined for token in video_tokens):
        return ModelCategoryKey.video
    _ = provider_key
    return ModelCategoryKey.text


def _infer_operations(
    *, provider_key: str, model_name: str, category: ModelCategoryKey
) -> list[ModelOperation]:
    """返回 UI 可展示的已映射操作摘要；参数细节仍由 capability resolver 校验。"""
    value = model_name.lower()
    if category == ModelCategoryKey.text:
        return ["text_generation"]
    if category == ModelCategoryKey.image:
        return ["text_to_image", "image_to_image"]
    operations: list[ModelOperation] = [
        "text_to_video",
        "image_to_video",
        "reference_to_video",
    ]
    if provider_key == "aliyun_bailian":
        if "-t2v" in value:
            operations = ["text_to_video"]
        elif "-i2v" in value:
            operations = ["image_to_video"]
        elif "-r2v" in value:
            operations = ["reference_to_video"]
    elif provider_key == "openai":
        operations = ["text_to_video", "image_to_video"]
    return operations


async def _discover_aliyun_models(*, cfg: ProviderConfig) -> ProviderModelCatalog:
    """合并百炼实时目录与官方目录，补足 Token Plan 不返回的视频模型。"""
    live_models: list[ProviderModelCandidate] = []
    base_url = (cfg.base_url or "").rstrip("/")
    discovery_urls = [base_url]
    if base_url.endswith("/compatible-mode/v1"):
        discovery_urls.insert(0, base_url[: -len("/compatible-mode/v1")] + "/api/v1")
    for discovery_url in dict.fromkeys(discovery_urls):
        try:
            live_models = (
                await _discover_openai_compatible_models(
                    cfg=ProviderConfig(
                        provider="aliyun_bailian",
                        api_key=cfg.api_key,
                        base_url=discovery_url,
                    )
                )
            ).models
            break
        except Exception as exc:
            if not _is_missing_models_endpoint(exc):
                raise
    merged = {
        (item.name, ModelCategoryKey(item.category).value): item
        for item in _ALIYUN_MODELS
    }
    for item in live_models:
        category_value = ModelCategoryKey(item.category).value
        merged[(item.name, category_value)] = item
    return ProviderModelCatalog(
        provider_key="aliyun_bailian",
        source="hybrid" if live_models else "provider_catalog",
        models=sorted(merged.values(), key=lambda value: (value.category.value, value.name)),
    )


def _catalog_candidate(
    name: str,
    category: ModelCategoryKey | str,
    description: str,
    *,
    provider_key: str,
    capabilities: list[ModelOperation] | None = None,
) -> ProviderModelCandidate:
    """创建带官方来源和已映射操作的静态目录候选。"""
    normalized_category = (
        category if isinstance(category, ModelCategoryKey) else ModelCategoryKey(category)
    )
    return ProviderModelCandidate(
        name=name,
        category=normalized_category,
        description=description,
        source="provider_catalog",
        capabilities=capabilities or _infer_operations(
            provider_key=provider_key, model_name=name, category=normalized_category
        ),
    )


_VIDU_MODELS = [
    _catalog_candidate("viduq2", "image", "文生图、参考图生图和图片编辑", provider_key="vidu"),
    _catalog_candidate("viduq1", "image", "参考图生图", provider_key="vidu"),
    _catalog_candidate("viduq3-pro", "video", "高质量文生、单图和首尾帧视频", provider_key="vidu", capabilities=["text_to_video", "image_to_video"]),
    _catalog_candidate("viduq3-mix", "video", "多参考图一致性视频", provider_key="vidu", capabilities=["reference_to_video"]),
    _catalog_candidate("viduq3-drama", "video", "短剧/漫画场景参考生视频", provider_key="vidu", capabilities=["reference_to_video"]),
    _catalog_candidate("viduq3-ad", "video", "广告场景参考生视频", provider_key="vidu", capabilities=["reference_to_video"]),
    _catalog_candidate("viduq3-turbo", "video", "快速文生、图生与参考生视频", provider_key="vidu", capabilities=["text_to_video", "image_to_video", "reference_to_video"]),
    _catalog_candidate("viduq2-pro", "video", "参考图与视频编辑", provider_key="vidu"),
    _catalog_candidate("viduq2", "video", "文生与多参考图视频", provider_key="vidu"),
    _catalog_candidate("viduq2-turbo", "video", "快速单图视频", provider_key="vidu"),
    _catalog_candidate("viduq1", "video", "稳定镜头视频", provider_key="vidu"),
    _catalog_candidate("viduq1-classic", "video", "丰富运镜视频", provider_key="vidu"),
    _catalog_candidate("vidu2.0", "video", "Vidu 2.0 视频", provider_key="vidu"),
]

_KLING_MODELS = [
    _catalog_candidate("kling-3.0-turbo", "video", "Kling 3.0 Turbo 文生视频", provider_key="kling"),
    _catalog_candidate("kling-3.0", "video", "Kling 3.0 Omni 文生、首帧和首尾帧图生视频", provider_key="kling"),
    _catalog_candidate("kling-v3", "image", "Kling Image 3.0 Omni 图片生成", provider_key="kling"),
]

_VOLCENGINE_MODELS = [
    _catalog_candidate("doubao-seed-2.0-lite", "text", "豆包 Seed 2.0 Lite 文本生成", provider_key="volcengine"),
    _catalog_candidate("doubao-seedream-5.0-lite", "image", "豆包 Seedream 5.0 Lite 图片生成", provider_key="volcengine"),
    _catalog_candidate("doubao-seedance-1.5-pro", "video", "豆包 Seedance 1.5 Pro 视频生成", provider_key="volcengine"),
]

# Token Plan 兼容目录当前不返回视频项；这里维护已完成请求契约映射的官方模型。
_ALIYUN_MODELS = [
    _catalog_candidate("happyhorse-1.1-t2v", "video", "HappyHorse 1.1 文生视频（3-15 秒）", provider_key="aliyun_bailian"),
    _catalog_candidate("happyhorse-1.1-i2v", "video", "HappyHorse 1.1 首帧图生视频（3-15 秒）", provider_key="aliyun_bailian"),
    _catalog_candidate("happyhorse-1.1-r2v", "video", "HappyHorse 1.1 多素材参考生视频（2-10 秒）", provider_key="aliyun_bailian"),
]
