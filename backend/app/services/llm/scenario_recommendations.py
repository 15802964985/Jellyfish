"""Derive recommendations locally; do not call /models, scrape quotas or invoke inference."""
from sqlalchemy import select
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.bootstrap import bootstrap_all_registries
from app.core.contracts.model_recommendations import ModelScenarioRead, ScenarioModelChoice
from app.core.integrations.video_capabilities import resolve_video_capability
from app.core.integrations.image_capabilities import resolve_image_capability
from app.core.integrations.video_edit_registry import VIDEO_EDIT_MODELS
from app.models.llm import Model, Provider, ModelCategoryKey
from app.services.llm.provider_registry import resolve_provider_key, get_provider_spec

SCENARIOS = (
    ("script", "剧本分析与资产提取", "text", "中文理解、长文本和字段证据", "千问、豆包、DeepSeek、MiniMax；新接入 GLM 等需先验收结构化输出。"),
    ("simplify", "角色检查与智能精简", "text", "保留姓名、事实与叙事关系", "优先在已配置文本模型中比较质量和延迟，不自动选最大型号。"),
    ("concept", "画风试稿与资产概念图", "image", "文生图", "Seedream、万相、可灵、Vidu，以及新接入 MiniMax、CogView/GLM-Image、混元、即梦均可比较；先确认尺寸与账户价格，不是免费额度排名。"),
    ("reference_image", "演员定妆与一致性图片", "image", "已验证的参考图输入", "图片类别不等于参考图已接通。须检查素材类型、数量以及实际发送记录。"),
    ("image_video", "分镜图片生成视频", "video", "首帧图生视频", "先确认构图与道具比例再生成；首帧不是人物身份参考的替代品。"),
    ("text_video", "纯文字生成视频", "video", "不依赖首帧或主体图", "适合概念和过场，不用于承诺跨镜头人物一致。"),
    ("first_last", "首尾帧过渡", "video", "首帧与尾帧同时输入", "只推荐实际声明支持双帧的型号，不能把关键帧自动当作尾帧。"),
    ("subjects", "多主体参考视频", "video", "主体参考图及明确数量上限", "角色、服装与场景要区分用途；具体可用数量以型号限制为准。"),
    ("performance", "人物表演与动作镜头", "video", "以首帧引导人物运动", "可灵、Seedance、海螺及混元是评估方向；复杂互动先用短镜头验证，不保证零穿帮。海螺 Fast 必须首帧，混元当前5秒。"),
    ("narration", "旁白与角色对白", "audio", "TTS与音色", "配音不同于音乐、音效和声音克隆；字幕优先在后期叠加。"),
    ("edit", "修改已有视频", "video", "真正的原视频编辑", "必须传入原片；参考重生成不冒充编辑。结果人工采用，保留原片。"),
)

DOMESTIC = {"aliyun_bailian", "volcengine", "kling", "vidu", "deepseek", "minimax", "zhipu", "hunyuan", "jimeng"}


def _supports(model: Model, key: str, scenario: str, *, check_configuration: bool = True) -> tuple[bool, str]:
    """Resolve only execution capabilities; unknown fine-grained image support stays unverified."""
    category = ModelCategoryKey(model.category)
    spec = get_provider_spec(key)
    if category not in spec.supported_categories:
        return False, "此供应商类别尚未接入"
    if category in {ModelCategoryKey.image, ModelCategoryKey.video} and key in {"volcengine", "aliyun_bailian", "vidu", "kling"}:
        from app.core.integrations.model_catalog import _VOLCENGINE_MODELS, _ALIYUN_MODELS, _VIDU_MODELS, _KLING_MODELS
        catalog = {"volcengine": _VOLCENGINE_MODELS, "aliyun_bailian": _ALIYUN_MODELS, "vidu": _VIDU_MODELS, "kling": _KLING_MODELS}[key]
        if model.name not in {item.name for item in catalog if item.category == category}:
            return False, "此精确型号不在已核对目录中；不借用供应商默认能力认证。可继续做官方接入核查"
    if category == ModelCategoryKey.text:
        return bool(spec.text_protocol), "需对具体型号做剧本结果验收"
    if category == ModelCategoryKey.audio:
        if key == "aliyun_bailian":
            name = model.name.lower()
            return name.startswith(("qwen3-tts", "qwen-tts", "qwen-audio-", "cosyvoice-")), "音色及独立音频端点需配置"
        if key == "minimax":
            if not check_configuration:
                from app.core.integrations.minimax_speech import SPEECH_MODELS
                return model.name in SPEECH_MODELS, "须配置独立 audio_endpoint、voice；TTS不是音效或克隆"
            from app.core.integrations.minimax_speech import build_speech_request
            try:
                build_speech_request(model=model.name, params=model.params or {}, text="配置检查")
            except ValueError as exc:
                return False, str(exc)
            return True, "显式音频端点和音色已配置；仍需确认账户 API 额度及音色授权"
        return False, "镜头配音执行链未接通此供应商"
    if category == ModelCategoryKey.image:
        resolve_image_capability(provider=key, model=model.name)
        if scenario == "concept" and key == "vidu" and model.name == "viduq1":
            return False, "此型号需要参考图，不作为纯文字概念图候选"
        if scenario == "reference_image":
            supported = {"volcengine": {"doubao-seedream-5.0-lite"},
                "aliyun_bailian": {"wan2.7-image", "wan2.7-image-pro"},
                "hunyuan": {"hy-image-v3"}, "vidu": {"viduq2", "viduq1"}, "kling": {"kling-v3"}}
            if model.name in supported.get(key, set()):
                return True, "代码已映射参考图；数量、图像内容及实际请求仍须在生成前检查"
            if key == "minimax":
                return False, "仅人物参考协议；通用素材尚未标记人物语义，不自动映射场景/服装图"
            return False, "参考图语义和数量需逐型号核验；不以图片类别自动认证"
        return True, "文生图适配存在，具体型号与参数仍需接入核查"
    if scenario == "edit":
        return VIDEO_EDIT_MODELS.get(key) == model.name, "仅接受独立编辑适配器的精确型号"
    if spec.video_operations == ("video_edit",):
        return False, "此型号仅用于已有视频编辑"
    cap = resolve_video_capability(provider=key, model=model.name)
    if key == "jimeng" and scenario != "first_last":
        return False, "当前即梦只开放首尾双帧视频，请选择首尾帧过渡场景"
    if scenario == "text_video":
        return cap.supports_text_to_video and not cap.requires_first_frame and not cap.requires_subject_reference, "纯文字入口不自动补图"
    if scenario == "first_last":
        return cap.supports_first_frame and cap.supports_last_frame, "使用前须提供合规首帧和尾帧"
    if scenario == "subjects":
        return cap.supports_subject_image_reference and cap.max_subjects is not None and cap.max_subjects > 1, f"主体上限：{cap.max_subjects or '待核对'}；不是任意多图"
    return cap.supports_first_frame and not cap.requires_subject_reference, "使用前须提供合规首帧"


def recommend_for_models(rows: list[tuple[Model, Provider]], *, domestic_only: bool = True) -> list[ModelScenarioRead]:
    """Calculate from current rows, keeping disabled and unmatched choices explanatory."""
    bootstrap_all_registries()
    result = []
    for scene, title, category, requirement, guidance in SCENARIOS:
        choices = []
        for model, provider in rows:
            if ModelCategoryKey(model.category).value != category:
                continue
            try:
                key = resolve_provider_key(provider)
                if domestic_only and key not in DOMESTIC:
                    continue
                spec = get_provider_spec(key)
                supported, reason = _supports(model, key, scene)
                reasons = [reason]
                state = getattr(provider.status, "value", provider.status)
                if state == "disabled":
                    supported = False
                    reasons.append("供应商已禁用")
                if not provider.api_key:
                    supported = False
                    reasons.append("尚未配置 API 凭据")
                if spec.requires_api_secret and not provider.api_secret:
                    supported = False
                    reasons.append("缺少独立 API Secret / SK")
                if key in {"minimax", "zhipu", "hunyuan", "jimeng"} and category in {"image", "video"}:
                    from app.services.llm.provider_resolver import resolve_effective_base_url
                    from app.core.contracts.provider import ProviderConfig
                    base = resolve_effective_base_url(provider=provider, category=ModelCategoryKey(category), provider_key=key)
                    cfg = ProviderConfig(provider=key, api_key="check", api_secret="check", base_url=base)
                    try:
                        if key == "minimax":
                            from app.core.integrations.minimax_video import api_base
                            api_base(cfg)
                        elif key == "jimeng":
                            if (base or "").rstrip("/") != "https://visual.volcengineapi.com":
                                raise ValueError("即梦需官方视觉 API 地址")
                        else:
                            from app.core.integrations.domestic_media import official_base
                            official_base(cfg)
                    except ValueError as exc:
                        supported = False
                        reasons.append(str(exc))
                choices.append(ScenarioModelChoice(model_id=model.id, model_name=model.name,
                    provider_name=provider.name, provider_key=key, eligible=supported,
                    reasons=reasons, official_documentation=spec.official_documentation))
            except (ValueError, KeyError, HTTPException):
                if domestic_only and (provider.adapter_key or "unknown") not in DOMESTIC:
                    continue
                choices.append(ScenarioModelChoice(model_id=model.id, model_name=model.name,
                    provider_name=provider.name, provider_key=provider.adapter_key or "unknown",
                    eligible=False, reasons=["型号能力尚未核验，不能推定可用"]))
        choices.sort(key=lambda item: (not item.eligible, item.provider_name, item.model_name))
        result.append(ModelScenarioRead(key=scene, title=title, requirement=requirement, guidance=guidance, choices=choices))
    return result


async def get_scenario_recommendations(db: AsyncSession, *, domestic_only: bool = True) -> list[ModelScenarioRead]:
    """Read all saved models with one query, independent of model-list search and pagination."""
    rows = (await db.execute(select(Model, Provider).join(Provider, Model.provider_id == Provider.id))).all()
    return recommend_for_models(list(rows), domestic_only=domestic_only)
