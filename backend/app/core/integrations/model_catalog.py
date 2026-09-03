"""供应商模型目录发现：实时 `/models` 与内置官方目录。"""

from __future__ import annotations

from typing import Any

from app.core.contracts.model_catalog import ProviderModelCandidate, ProviderModelCatalog
from app.core.contracts.provider import ProviderConfig


async def discover_provider_models(*, cfg: ProviderConfig) -> ProviderModelCatalog:
    """按供应商协议获取可导入模型。

    无模型列表 API 的供应商使用内置官方目录。
    """
    if cfg.provider == "vidu":
        return ProviderModelCatalog(
            provider_key="vidu",
            source="provider_catalog",
            models=_VIDU_MODELS,
        )
    if cfg.provider == "kling":
        return ProviderModelCatalog(
            provider_key="kling",
            source="provider_catalog",
            models=_KLING_MODELS,
        )
    try:
        return await _discover_openai_compatible_models(cfg=cfg)
    except Exception as exc:
        # 火山方舟 Token Plan 使用独立的 OpenAI-compatible 地址，但该地址不提供
        # `/models`。仅在“接口不存在”时回退到维护的模型目录；鉴权、限流和网络
        # 错误仍交给调用方展示，避免把错误配置伪装成刷新成功。
        if cfg.provider == "volcengine" and _is_missing_models_endpoint(exc):
            return ProviderModelCatalog(
                provider_key="volcengine",
                source="provider_catalog",
                models=_VOLCENGINE_MODELS,
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
    """读取 OpenAI 兼容供应商的 `/models` 响应，并按模型命名规则推断项目类别。"""
    try:
        import httpx
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError("httpx is required for provider model discovery") from exc

    base_url = (cfg.base_url or "").rstrip("/")
    if not base_url:
        raise ValueError(f"Provider {cfg.provider} has no base_url for model discovery")
    headers = {"Authorization": f"Bearer {cfg.api_key}"}
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(f"{base_url}/models", headers=headers)
        response.raise_for_status()
        payload: dict[str, Any] = response.json()

    names = [
        str(item.get("id") or item.get("name") or "").strip()
        for item in (payload.get("data") or payload.get("models") or [])
        if isinstance(item, dict)
    ]
    candidates = [
        ProviderModelCandidate(name=name, category=_infer_category(cfg.provider, name))
        for name in sorted(set(names))
        if name
    ]
    return ProviderModelCatalog(provider_key=cfg.provider, source="provider_api", models=candidates)


def _infer_category(provider_key: str, model_name: str):
    """将兼容 API 未携带类别的模型名映射到 Jellyfish 的 text/image/video 三类。"""
    from app.models.llm import ModelCategoryKey

    normalized = model_name.lower()
    if any(token in normalized for token in ("seedream", "image", "dall-e", "cogview")):
        return ModelCategoryKey.image
    if any(token in normalized for token in ("sora", "seedance", "video", "wanx")):
        return ModelCategoryKey.video
    # 方舟与兼容网关通常将聊天模型置于同一列表，未识别项按 text 处理。
    _ = provider_key
    return ModelCategoryKey.text


_VIDU_MODELS = [
    ProviderModelCandidate(name="viduq2", category="image", description="文生图、参考图生图和图片编辑"),
    ProviderModelCandidate(name="viduq1", category="image", description="参考图生图"),
    ProviderModelCandidate(name="viduq3-pro", category="video", description="高质量文生、单图和首尾帧视频"),
    ProviderModelCandidate(name="viduq3-mix", category="video", description="多参考图一致性视频"),
    ProviderModelCandidate(name="viduq3-drama", category="video", description="短剧/漫画场景视频"),
    ProviderModelCandidate(name="viduq3-ad", category="video", description="广告场景视频"),
    ProviderModelCandidate(name="viduq3-turbo", category="video", description="快速视频生成"),
    ProviderModelCandidate(name="viduq2-pro", category="video", description="参考图与视频编辑"),
    ProviderModelCandidate(name="viduq2", category="video", description="文生与多参考图视频"),
    ProviderModelCandidate(name="viduq2-turbo", category="video", description="快速单图视频"),
    ProviderModelCandidate(name="viduq1", category="video", description="稳定镜头视频"),
    ProviderModelCandidate(name="viduq1-classic", category="video", description="丰富运镜视频"),
    ProviderModelCandidate(name="vidu2.0", category="video", description="Vidu 2.0 视频"),
]

# 可灵未提供适合管理端导入的标准模型列表接口。
# 因此保持为经过确认的官方模型白名单。
_KLING_MODELS = [
    ProviderModelCandidate(
        name="kling-3.0-turbo",
        category="video",
        description="Kling 3.0 Turbo 文生视频",
    ),
    ProviderModelCandidate(
        name="kling-3.0",
        category="video",
        description="Kling 3.0 Omni 文生、首帧和首尾帧图生视频",
    ),
    ProviderModelCandidate(
        name="kling-v3",
        category="image",
        description="Kling Image 3.0 Omni 图片生成",
    ),
]

# 火山方舟 Token Plan 不暴露 `/models`，这里维护 Jellyfish 已接入并验证过的
# 文本、图片和视频模型。标准 Ark v3 若能返回实时列表，仍优先使用实时结果。
_VOLCENGINE_MODELS = [
    ProviderModelCandidate(
        name="doubao-seed-2.0-lite",
        category="text",
        description="豆包 Seed 2.0 Lite 文本生成",
    ),
    ProviderModelCandidate(
        name="doubao-seedream-5.0-lite",
        category="image",
        description="豆包 Seedream 5.0 Lite 图片生成",
    ),
    ProviderModelCandidate(
        name="doubao-seedance-1.5-pro",
        category="video",
        description="豆包 Seedance 1.5 Pro 视频生成",
    ),
]
