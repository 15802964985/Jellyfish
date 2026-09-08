"""Read-only model integration diagnostics; configuration is not certification."""
from __future__ import annotations

from datetime import datetime, timezone
from urllib.parse import urlsplit

from app.bootstrap import bootstrap_all_registries
from app.models.llm import Model, ModelCategoryKey, Provider
from app.schemas.llm import ModelIntegrationAuditRead
from app.services.llm.provider_registry import get_provider_spec, resolve_provider_key
from app.services.llm.provider_resolver import resolve_effective_base_url

BUSINESS_CHECKS = {
    "text": ["剧本分析：结构化输出、拒答、截断、思考模式", "章节/角色/镜头：字段校验与结果持久化"],
    "image": ["演员/场景/道具/服装/镜头/实验室：图片结果入库与刷新", "参考图：数量、格式、尺寸、可访问性与实际请求传递"],
    "video": ["文生/首尾帧/主体参考：逐项确认模型能力", "任务提交、查询、取消、下载、发布与剪辑使用"],
    "audio": ["TTS：端点、音色、语言、指令、返回音频格式", "配音轨道：结果入库、播放与视频合成"],
}


def audit_model_integration(*, model: Model, provider: Provider) -> ModelIntegrationAuditRead:
    """Inspect saved configuration without requesting credentials or paid generation.

    Never promote a provider-wide adapter declaration to per-model verification.
    Reports are recomputed so editing a model cannot preserve a stale pass badge.
    """
    bootstrap_all_registries()
    key = resolve_provider_key(provider)
    category = ModelCategoryKey(model.category).value
    spec = get_provider_spec(key)
    adapter = model.category in spec.supported_categories
    issues: list[str] = []
    if category == 'video' and spec.video_operations == ('video_edit',):
        issues.append('此适配器仅用于已有视频编辑，不支持普通文生视频或首帧生成；请使用工作室视频编辑入口。')
    if not adapter:
        issues.append("系统未注册该供应商的此类生成适配器。")
    if not spec.official_documentation:
        issues.append("该供应商尚未登记官方文档来源，不能进行有依据的契约核对。")
    endpoint = resolve_effective_base_url(provider=provider, category=model.category, provider_key=key) or ""
    if category == "audio":
        # Audio endpoints are selected separately by shot_tts; do not report the chat URL as TTS.
        endpoint = str((model.params or {}).get("audio_endpoint") or "")
        issues.append("音频使用独立 TTS 路由；未显式指定 audio_endpoint 时需核对所选模型的默认端点及计费入口。")
    try:
        parsed = urlsplit(endpoint)
        endpoint_display = f"{parsed.scheme}://{parsed.hostname or ''}{parsed.path}" if endpoint else "由音频适配器按模型选择"
        if endpoint and (parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password):
            issues.append("端点格式异常或包含用户凭据，请修正；核查不会请求该地址。")
    except ValueError:
        endpoint_display = "无效端点"
        issues.append("端点无法解析。")
    if "/api/plan/" in endpoint or "token-plan" in endpoint:
        issues.append("当前为套餐端点：须核对套餐模型权限；不会自动切换按量计费端点。")
    if str(provider.status) == "disabled" or getattr(provider.status, "value", None) == "disabled":
        issues.append("供应商已禁用，不能用于生成。")
    if not provider.api_key:
        issues.append("未配置 API Key。")
    if spec.requires_api_secret and not provider.api_secret:
        issues.append("此协议需要独立 API Secret / SK，目前缺失。")
    if key in {"minimax", "zhipu", "hunyuan", "jimeng"}:
        from app.services.llm.scenario_recommendations import recommend_for_models
        scene = {"text": "script", "image": "concept", "video": "first_last" if key == "jimeng" else "image_video", "audio": "narration"}.get(category)
        for recommendation in recommend_for_models([(model, provider)]):
            if recommendation.key == scene:
                for choice in recommendation.choices:
                    issues.extend(choice.reasons)
        if key == "jimeng":
            issues.append("即梦图片仅文生图；本地参考图公网导出未开放。视频为首尾双帧，不是原片编辑。")
        if key == "minimax" and category == "image":
            issues.append("人物参考语义确认入口未接通，当前仅开放文生图，不能使用通用参考素材。")
    issues.append("已配置不等于已验证：尚未对该模型、端点及参数组合建立可追溯的官方契约核验记录。")
    return ModelIntegrationAuditRead(
        model_id=model.id, model_name=model.name, provider_key=key, category=model.category,
        checked_at=datetime.now(timezone.utc).isoformat(), adapter_registered=adapter,
        endpoint=endpoint_display, official_documentation=spec.official_documentation,
        issues=issues, business_checks=BUSINESS_CHECKS.get(category, []),
    )
