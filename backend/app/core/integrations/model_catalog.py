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


def builtin_provider_catalog(provider_key: str) -> ProviderModelCatalog | None:
    """Return the local execution catalogue without credentials, discovery or network traffic."""
    if provider_key == "jimeng":
        from app.core.integrations.jimeng_media import IMAGE_MODEL, VIDEO_MODEL
        return ProviderModelCatalog(provider_key="jimeng", source="provider_catalog", models=[
            ProviderModelCandidate(name=IMAGE_MODEL, category=ModelCategoryKey.image, capabilities=["text_to_image"],
                description="独立AK/SK视觉API，标准2K单图；本地参考图公网导出未开放，不复用网页积分"),
            ProviderModelCandidate(name=VIDEO_MODEL, category=ModelCategoryKey.video, capabilities=["image_to_video"],
                description="720P，5/10秒，首尾帧均必需；本地JPEG/PNG支持，非已有视频编辑")])
    if provider_key in {"zhipu", "hunyuan"}:
        from app.core.integrations.domestic_media import IMAGE_MODELS, VIDEO_MODELS
        texts = ("glm-4.7", "glm-4.6", "glm-4-plus") if provider_key == "zhipu" else ("hy3", "hy4-preview", "hunyuan-role-latest")
        return ProviderModelCatalog(provider_key=provider_key, source="provider_catalog", models=[
            ProviderModelCandidate(name=name, category=ModelCategoryKey.text, capabilities=["text_generation"],
                description="官方目录候选；需对应中国站 API 账户，未认证免费额度或真实账户可用性") for name in texts] + [
            ProviderModelCandidate(name=name, category=ModelCategoryKey.image,
                capabilities=["text_to_image"] if provider_key == "zhipu" else ["text_to_image", "image_to_image"],
                description="智谱仅文生图；混元最多三张参考图，TokenHub 独立 API 额度") for name in sorted(IMAGE_MODELS[provider_key])] + [
            ProviderModelCandidate(name=name, category=ModelCategoryKey.video, capabilities=["text_to_video", "image_to_video"],
                description="智谱5/10秒含双帧；混元5秒720p仅首帧。未做真实收费验收") for name in sorted(VIDEO_MODELS[provider_key])])
    if provider_key == 'runway':
        return ProviderModelCatalog(provider_key='runway', source='provider_catalog', models=[
            ProviderModelCandidate(name='aleph2', category=ModelCategoryKey.video, capabilities=['video_edit'],
                description='已有视频编辑，参考图需要时间位置；使用 Runway Dev 独立 API 余额')])
    if provider_key == 'fal':
        from app.core.integrations.fal_video_edit import FAL_EDIT_MODEL
        return ProviderModelCatalog(provider_key='fal', source='provider_catalog', models=[
            ProviderModelCandidate(name=FAL_EDIT_MODEL, category=ModelCategoryKey.video,
                capabilities=['video_edit'], description='仅编辑已有视频；独立 fal.ai API Key 与余额，不复用可灵会员')])
    if provider_key == "minimax":
        from app.core.integrations.minimax_speech import SPEECH_MODELS
        return ProviderModelCatalog(provider_key="minimax", source="provider_catalog", models=[
            ProviderModelCandidate(name=name, category=ModelCategoryKey.text, capabilities=["text_generation"])
            for name in ("MiniMax-M3", "MiniMax-M2.7", "MiniMax-M2.7-highspeed")] + [
            ProviderModelCandidate(name=name, category=ModelCategoryKey.audio, capabilities=["text_to_speech"],
                description="HTTP TTS：须自行配置 audio_endpoint 和 voice；不复用海螺网页积分")
            for name in sorted(SPEECH_MODELS)] + [
            ProviderModelCandidate(name=name, category=ModelCategoryKey.video,
                capabilities=["image_to_video"] if name.endswith("-Fast") else ["text_to_video", "image_to_video"],
                description="768P，6/10秒；仅 Hailuo-02 支持双帧；API 余额独立，未做真实收费验收")
            for name in ("MiniMax-Hailuo-2.3", "MiniMax-Hailuo-2.3-Fast", "MiniMax-Hailuo-02")] + [
            ProviderModelCandidate(name=name, category=ModelCategoryKey.image,
                capabilities=["text_to_image"],
                description="标准档文生图；人物参考协议已有代码，但业务语义确认入口待接通，不接受通用参考图")
            for name in ("image-01", "image-01-live")])
    if provider_key == "bfl":
        from app.core.integrations.bfl_images import BFL_MODELS
        return ProviderModelCatalog(provider_key="bfl", source="provider_catalog", models=[
            ProviderModelCandidate(name=name, category=ModelCategoryKey.image,
                capabilities=["text_to_image", "image_to_image"] if name == "flux-kontext-pro" else ["text_to_image"],
                description="本地参考图已映射" if name == "flux-kontext-pro" else "当前仅接入文生图；本地参考图传输待核验")
            for name in sorted(BFL_MODELS)])
    if provider_key == "vidu":
        return ProviderModelCatalog(provider_key="vidu", source="provider_catalog", models=_VIDU_MODELS)
    if provider_key == "kling":
        return ProviderModelCatalog(provider_key="kling", source="provider_catalog", models=_KLING_MODELS)
    if provider_key == "aliyun_bailian":
        return ProviderModelCatalog(provider_key=provider_key, source="provider_catalog", models=_ALIYUN_MODELS)
    if provider_key == "volcengine":
        return ProviderModelCatalog(provider_key=provider_key, source="provider_catalog", models=_VOLCENGINE_MODELS)
    if provider_key == "deepseek":
        return ProviderModelCatalog(provider_key=provider_key, source="provider_catalog", models=[
            ProviderModelCandidate(name=name, category=ModelCategoryKey.text, capabilities=["text_generation"],
                description="官方文本协议；思考模式与剧本质量须验收，不认证账户额度")
            for name in ("deepseek-v4-flash", "deepseek-v4-pro")])
    return None


async def discover_provider_models(*, cfg: ProviderConfig) -> ProviderModelCatalog:
    """按供应商协议获取可导入模型，并只暴露已接入 Jellyfish 的模态。"""
    if cfg.provider not in {"aliyun_bailian", "volcengine", "deepseek"}:
        builtin = builtin_provider_catalog(cfg.provider)
        if builtin is not None:
            return builtin
    if cfg.provider in {"google", "anthropic"}:
        return await _discover_native_text_models(cfg=cfg)
    if cfg.provider == "aliyun_bailian":
        return await _discover_aliyun_models(cfg=cfg)
    if cfg.provider == "custom_openai_text":
        catalog = await _discover_openai_compatible_models(cfg=cfg)
        catalog.models = [item for item in catalog.models if item.category == ModelCategoryKey.text]
        return catalog
    try:
        return await _discover_openai_compatible_models(cfg=cfg)
    except Exception as exc:
        # Token Plan 不一定实现 `/models`；仅对明确的“接口不存在”回退，不能掩盖鉴权错误。
        if cfg.provider == "volcengine" and _is_missing_models_endpoint(exc):
            return ProviderModelCatalog(
                provider_key="volcengine", source="provider_catalog", models=_VOLCENGINE_MODELS
            )
        raise


async def _discover_native_text_models(*, cfg: ProviderConfig) -> ProviderModelCatalog:
    """Read native paginated catalogues with their own authentication, never fake /models compatibility."""
    import httpx
    from app.core.integrations.response_errors import raise_provider_error
    google = cfg.provider == "google"
    headers = {"x-goog-api-key": cfg.api_key} if google else {"x-api-key": cfg.api_key, "anthropic-version": "2023-06-01"}
    params = {"pageSize": 100} if google else {"limit": 100}
    candidates: dict[str, ProviderModelCandidate] = {}
    async with httpx.AsyncClient(timeout=15, follow_redirects=False) as client:
        for _ in range(10):
            response = await client.get(f"{(cfg.base_url or '').rstrip('/')}/models", headers=headers, params=params)
            raise_provider_error(response, provider=cfg.provider, api_key=cfg.api_key)
            payload = response.json()
            for item in payload.get("models" if google else "data", []):
                name = str(item.get("name" if google else "id") or "").removeprefix("models/")
                if not name:
                    continue
                if google and ("generateContent" not in item.get("supportedGenerationMethods", []) or any(token in name.lower() for token in ("image", "tts", "audio", "live", "embedding"))):
                    continue
                candidates[name] = ProviderModelCandidate(name=name, category=ModelCategoryKey.text,
                    source="provider_api", capabilities=["text_generation"])
            next_page = payload.get("nextPageToken") if google else payload.get("last_id") if payload.get("has_more") else None
            if not next_page:
                return ProviderModelCatalog(provider_key=cfg.provider, source="provider_api", models=list(candidates.values()))
            params["pageToken" if google else "after_id"] = next_page
    raise ValueError("模型目录分页超过读取上限，未将不完整目录标记为完整")


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
    """规范化实时目录；TTS 归语音类别，ASR/Realtime 暂不导入。"""
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
    """把供应商模型映射到已接入类别，排除 ASR 与实时双工模型。"""
    normalized = model_name.lower()
    metadata = " ".join(
        str(value).lower()
        for value in (item or {}).values()
        if isinstance(value, (str, list, tuple))
    )
    combined = f"{normalized} {metadata}"
    if any(token in combined for token in ("asr", "realtime")):
        return None
    if any(token in combined for token in ("tts", "speech", "cosyvoice")):
        return ModelCategoryKey.audio
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
    if category == ModelCategoryKey.audio:
        return ["text_to_speech"]
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
    _catalog_candidate("qwen3.8-max", "text", "中文剧本与复杂指令；账户地域/输出模式需核对", provider_key="aliyun_bailian"),
    _catalog_candidate("qwen3.8-flash", "text", "文本处理候选；具体延迟与质量需验收", provider_key="aliyun_bailian"),
    _catalog_candidate("wan2.7-image", "image", "已映射文生图与参考图；数量、尺寸以生成门禁为准", provider_key="aliyun_bailian", capabilities=["text_to_image", "image_to_image"]),
    _catalog_candidate("wan2.7-image-pro", "image", "已映射文生图与参考图；不是官网全部高级编辑能力", provider_key="aliyun_bailian", capabilities=["text_to_image", "image_to_image"]),
    _catalog_candidate(
        "qwen3-tts-flash",
        "audio",
        "千问 3 非实时语音合成（系统音色，适合短剧对白与旁白）",
        provider_key="aliyun_bailian",
        capabilities=["text_to_speech"],
    ),
    _catalog_candidate(
        "qwen-audio-3.0-tts-plus",
        "audio",
        "Qwen-Audio 高表现力语音合成（需在参数中配置北京地域 Workspace 端点）",
        provider_key="aliyun_bailian",
        capabilities=["text_to_speech"],
    ),
    _catalog_candidate(
        "qwen-audio-3.0-tts-flash",
        "audio",
        "Qwen-Audio 快速语音合成（需在参数中配置北京地域 Workspace 端点）",
        provider_key="aliyun_bailian",
        capabilities=["text_to_speech"],
    ),
    _catalog_candidate("happyhorse-1.1-t2v", "video", "HappyHorse 1.1 文生视频（3-15 秒）", provider_key="aliyun_bailian"),
    _catalog_candidate("happyhorse-1.1-i2v", "video", "HappyHorse 1.1 首帧图生视频（3-15 秒）", provider_key="aliyun_bailian"),
    _catalog_candidate("happyhorse-1.1-r2v", "video", "HappyHorse 1.1 多素材参考生视频（2-10 秒）", provider_key="aliyun_bailian"),
]
