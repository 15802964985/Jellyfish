"""Executable generation options and conservative price estimates, keyed by exact model and billing origin."""
from decimal import Decimal
from math import prod
from urllib.parse import urlsplit
from fastapi import HTTPException
from app.models.llm import Model, ModelSettings, ModelConfigRevision
from app.core.contracts.generation import ImageGenerationOperationInput, VideoGenerationOperationInput
from app.core.integrations.image_capabilities import resolve_image_capability, DEFAULT_VIDEO_REFERENCE_RATIO_SIZE_MAP
from app.core.integrations.video_capabilities import resolve_video_capability

CHECKED_AT = "2026-09-09"
HAPPY_SOURCE = "https://help.aliyun.com/zh/model-studio/happyhorse-image-to-video-api-reference"
HAPPY_PRICE = "https://help.aliyun.com/zh/model-studio/happyhorse-1-1-i2v"
WAN_PRICE = "https://help.aliyun.com/zh/model-studio/wan2-7-image-pro"
SEEDREAM_PRICE = "https://www.volcengine.com/product/doubao/"


def specification(revision, *, ratio: str | None = None, references: int = 0, editing: bool = False) -> dict:
    """Expose only controls implemented by the selected adapter; unknown pricing stays unknown."""
    provider, model = revision.provider_key, revision.model_name
    category = str(getattr(revision.category, "value", revision.category))
    ratio = ratio or "1:1"
    options = []
    audio_supported = False
    notice = "规格基于当前适配器；官方变化监测与真实调用验收分别记录。"
    if category == "image":
        if provider in {"hunyuan", "zhipu"}:
            from app.core.integrations.domestic_media import SIZES, GLM_SIZES
            sizes = GLM_SIZES if model == "glm-image" else SIZES
            if ratio in sizes:
                options = [{"value": "standard", "label": sizes[ratio], "size": sizes[ratio]}]
                if provider == "zhipu" and model != "glm-image":
                    options.append({"value": "high", "label": sizes[ratio] + " · 高清质量", "size": sizes[ratio]})
        elif provider == "jimeng":
            from app.core.integrations.jimeng_media import image_profiles
            try:
                profiles = image_profiles(model, references)
            except ValueError as exc:
                raise HTTPException(status_code=422, detail=str(exc)) from exc
            options = [{"value": key, "label": size, "size": size} for key, size in profiles.get(ratio, {}).items()]
            notice = "按所选服务版本及参考图数量自动匹配req_key；3.0参考模式仅1张，实际输出宽高按官网规则调整。不会自动升级版本。"
        else:
            cap = resolve_image_capability(provider=provider, model=model)
            profiles = cap.ratio_size_profiles or DEFAULT_VIDEO_REFERENCE_RATIO_SIZE_MAP
            options = [{"value": key, "label": value, "size": value} for key, value in profiles.get(ratio, {}).items()]
            if provider in {"bfl", "minimax"}:
                # Native defaults do not share the generic size mapping.
                options = [{"value": "standard", "label": "当前接口标准规格"}]
            if provider == "aliyun_bailian" and model == "wan2.7-image-pro" and references:
                options = [option for option in options if prod(map(int, option["size"].split("x"))) <= 2048 ** 2]
    elif not editing:
        cap = resolve_video_capability(provider=provider, model=model)
        options = [{"value": value, "label": value} for value in cap.resolutions]
        audio_supported = cap.supports_generate_audio
        notice = ("规格由当前型号的适配器与已同步官方规则共同确定，未配置默认档时优先低成本档。"
            if options else "该型号的额外分辨率档位尚未核验，沿用当前接口规格；不推测或静默传入未知参数。")
    else:
        notice = "视频编辑按源片与该编辑接口的规格执行，不将普通视频生成参数强行传入。"
    defaults = (revision.model_params or {}).get("generation_defaults") or {}
    if not isinstance(defaults, dict):
        raise HTTPException(status_code=422, detail="generation_defaults 必须是规格配置对象")
    if audio_supported and "generate_audio" in defaults and not isinstance(defaults["generate_audio"], bool):
        raise HTTPException(status_code=422, detail="原生音频默认值必须是 true 或 false")
    field = "resolution_profile" if category == "image" else "resolution"
    default = defaults.get(field) or (options[0]["value"] if options else None)
    if category == "image" and provider == "aliyun_bailian" and model == "wan2.7-image-pro" and references and default == "high":
        default = options[0]["value"] if options else None
        notice = "当前参考图模式最高支持 2K；已按当前输入模式选择可用规格，请确认。"
    if category == "image" and provider == "jimeng" and references and default == "high" and options:
        default = options[0]["value"]
        notice += " 当前参考模式不支持文生图高清默认档，已显示可用标准档，请确认。"
    if default and default not in [option["value"] for option in options]:
        raise HTTPException(status_code=422, detail="模型默认生成规格已不兼容，请在模型参数中修正 generation_defaults")
    endpoint = str((revision.endpoint_config or {}).get(category + "_base_url") or (revision.endpoint_config or {}).get("base_url") or "")
    host = urlsplit(endpoint).hostname or ""
    standard_billing = "/plan/" not in endpoint and "token-plan" not in endpoint
    price = None
    if standard_billing and provider == "aliyun_bailian" and (host == "dashscope.aliyuncs.com" or host.endswith(".cn-beijing.maas.aliyuncs.com")):
        if model == "happyhorse-1.1-i2v":
            price = {"unit": "second", "rates": {"480P": "0.45", "720P": "0.9", "1080P": "1.2"}, "source": HAPPY_PRICE}
        elif model == "wan2.7-image-pro":
            price = {"unit": "image", "rates": {"preview": "0.5", "standard": "0.5", "high": "0.5"}, "source": WAN_PRICE}
    if standard_billing and provider == "volcengine" and host == "ark.cn-beijing.volces.com" and model == "doubao-seedream-5.0-lite":
        price = {"unit": "image", "rates": {"standard": "0.22", "high": "0.22", "ultra": "0.22"}, "source": SEEDREAM_PRICE}
    if provider == "volcengine" and host == "ark.cn-beijing.volces.com" and model == "doubao-seedance-1.5-pro":
        from app.services.generation.seedance_pricing import seedance_price
        if standard_billing:
            price = seedance_price(ratio)
    if price:
        price.update(currency="CNY", checked_at=CHECKED_AT, note="官方按量原价估算，不扣减账户优惠、赠送额度；以实际账单为准。")
    reference_price = None
    if price is None and not standard_billing:
        if provider == "aliyun_bailian" and model == "happyhorse-1.1-i2v":
            reference_price = {"rates": {"480P": "0.45", "720P": "0.9", "1080P": "1.2"}, "unit": "second", "source": HAPPY_PRICE}
        elif provider == "aliyun_bailian" and model == "wan2.7-image-pro":
            reference_price = {"rates": {"preview": "0.5", "standard": "0.5", "high": "0.5"}, "unit": "image", "source": WAN_PRICE}
        elif provider == "volcengine" and model == "doubao-seedream-5.0-lite":
            reference_price = {"rates": {"standard": "0.22", "high": "0.22", "ultra": "0.22"}, "unit": "image", "source": SEEDREAM_PRICE}
        if provider == "volcengine" and host == "ark.cn-beijing.volces.com" and model == "doubao-seedance-1.5-pro":
            from app.services.generation.seedance_pricing import seedance_price
            reference_price = seedance_price(ratio)
        if reference_price:
            reference_price.update(currency="CNY", checked_at=CHECKED_AT,
                note="北京区官方按量原价，仅供对比，不是当前套餐的扣费估算。")
    billing_evidence = None
    if not standard_billing and provider == "aliyun_bailian":
        billing_evidence = {"unit": "Credits", "source": "https://help.aliyun.com/zh/model-studio/token-plan-personal-overview",
            "reason": "当前 Token Plan 按 Credits 动态结算，公开文档未提供可复现的单次换算；以控制台实际消耗为准。"}
    elif not standard_billing and provider == "volcengine":
        billing_evidence = {"unit": "AFP", "source": "https://www.volcengine.com/docs/82379/2516283",
            "reason": "当前为套餐端点。官方 Agent Plan 以 AFP 结算；账户套餐资格及实际消耗以控制台为准。"}
        if model == "doubao-seedream-5.0-lite":
            billing_evidence.update(image_rate="99", reason="Agent Plan 官方参考：成功生成 1 张 Seedream 5.0 lite 图片抵扣 99 AFP；请核对账户实际套餐，不能换算成人民币扣费。")
        elif model == "doubao-seedance-1.5-pro":
            billing_evidence.update(token_divisor=10000, audio_coefficient="72", silent_coefficient="36",
                reason="Agent Plan 官方参考：Seedance 1.5 pro 消耗 token / 10000 × 抵扣系数；无声 36、有声 72。实际 token 以响应 usage 为准；官网已标记该套餐型号即将下线。")
    package_reference = None
    if provider == "volcengine" and host == "ark.cn-beijing.volces.com" and not standard_billing:
        if model == "doubao-seedance-1.5-pro":
            from app.services.generation.seedance_pricing import seedance_price
            package_reference = seedance_price(ratio, afp=True)
        elif model == "doubao-seedream-5.0-lite":
            package_reference = {"currency": "AFP", "unit": "image", "rates": {item["value"]: "99" for item in options},
                "source": billing_evidence["source"], "checked_at": CHECKED_AT}
    return {"model_id": revision.model_id, "model_name": model, "provider": provider, "category": category,
        "revision_id": revision.id, "field": field, "options": options, "default": default, "configured_default": bool(defaults.get(field)),
        "price": price, "reference_price": reference_price, "notice": notice, "billing_evidence": billing_evidence, "package_reference": package_reference,
        "input_mode": "reference_image" if references else "text",
        "generate_audio": {"default": defaults.get("generate_audio", False)} if audio_supported else None,
        "pricing_status": "verified_standard" if price else "package_or_unverified", "verification": "official_document" if model == "happyhorse-1.1-i2v" else "existing_adapter"}


async def get_specification(db, *, model_id: str | None, category: str, ratio: str | None, references: int, editing: bool = False) -> dict:
    """Resolve the same configured default model used by the submission gate, without making provider calls."""
    if not model_id:
        settings = await db.get(ModelSettings, 1)
        model_id = getattr(settings, "default_" + category + "_model_id", None) if settings else None
    model = await db.get(Model, model_id) if model_id else None
    revision = await db.get(ModelConfigRevision, model.current_revision_id) if model and model.current_revision_id else None
    if revision is None or str(getattr(revision.category, "value", revision.category)) != category:
        raise HTTPException(status_code=422, detail="请先配置当前生成模型")
    return await attach_synchronized_price(db, specification(revision, ratio=ratio, references=references, editing=editing))


async def freeze_specification(db, revision, operation, *, references: int) -> tuple[object, dict | None]:
    """Validate the actual chosen tier and freeze its price basis; no silent unsupported-parameter fallback."""
    if not isinstance(operation, (ImageGenerationOperationInput, VideoGenerationOperationInput)):
        return operation, None
    is_image = isinstance(operation, ImageGenerationOperationInput)
    spec = specification(revision, ratio=operation.target_ratio if is_image else operation.ratio, references=references)
    spec = await attach_synchronized_price(db, spec)
    rule = spec.get("contract_rule")
    if rule and not is_image and operation.seconds is not None and not rule["duration_min"] <= operation.seconds <= rule["duration_max"]:
        raise HTTPException(status_code=422, detail=f"当前官方兼容时长为 {rule['duration_min']}–{rule['duration_max']} 秒")
    if is_image and rule and operation.count > rule.get("max_outputs", operation.count):
        raise HTTPException(status_code=422, detail="生成数量超出当前官方兼容范围")
    if is_image and revision.provider_key == "aliyun_bailian" and revision.model_name == "wan2.7-image-pro":
        if references > 9 or operation.count > 4:
            raise HTTPException(status_code=422, detail="当前万相单图模式最多 9 张参考图、生成 4 张")
    if is_image and revision.provider_key == "volcengine" and revision.model_name == "doubao-seedream-5.0-lite":
        if references + operation.count > 15:
            raise HTTPException(status_code=422, detail="当前 Seedream 参考图与输出图总数不能超过 15 张")
    field = spec["field"]
    chosen = getattr(operation, field, None) or spec["default"]
    if chosen and chosen not in [item["value"] for item in spec["options"]]:
        raise HTTPException(status_code=422, detail="当前模型不支持所选生成规格，请重新选择")
    updates = {field: chosen}
    if is_image and chosen:
        option = next(item for item in spec["options"] if item["value"] == chosen)
        if operation.size and operation.size != option.get("size"):
            raise HTTPException(status_code=422, detail="图片尺寸与所选模型档位不一致")
        updates["size"] = option.get("size")
    if not is_image:
        if spec.get("generate_audio"):
            updates["generate_audio"] = operation.generate_audio if operation.generate_audio is not None else spec["generate_audio"]["default"]
        elif operation.generate_audio is not None:
            raise HTTPException(status_code=422, detail="当前模型不支持原生音频配置")
    result = operation.model_copy(update=updates)
    price = spec["price"]
    quantity = operation.count if is_image else operation.seconds
    estimate = {"status": "unknown", "reason": "当前计费端点或单价未核实，或实际时长尚未确定"}
    if price and quantity and chosen in price["rates"]:
        estimate = {**price, "status": "estimated", "quantity": quantity, "specification": chosen,
            "amount": str(Decimal((price.get("audio_rates") if getattr(result, "generate_audio", False) and price.get("audio_rates") else price["rates"])[chosen]) * quantity)}
    if spec.get("package_reference"):
        estimate["package_reference"] = spec["package_reference"]
    if spec.get("billing_evidence"):
        estimate["billing_evidence"] = spec["billing_evidence"]
    if spec.get("reference_price"):
        estimate["standard_price_reference"] = spec["reference_price"]
    if rule:
        estimate["contract_rule"] = rule
    return result, estimate


async def attach_synchronized_price(db, spec: dict) -> dict:
    """Apply only validated official prices for the already-verified billing origin, preserving their source timestamp."""
    from app.services.llm.contract_rules import apply_contract_rule, effective_rule
    spec = await apply_contract_rule(db, spec)
    if db is not None and spec.get("package_reference"):
        from hashlib import sha256
        from app.models.model_governance import ModelGovernanceRecord
        package_source = spec["package_reference"]["source"]
        package_row = await db.get(ModelGovernanceRecord, sha256(package_source.encode()).hexdigest())
        if package_row and package_row.data.get("status") == "changed_requires_validation":
            spec["package_reference"] = None
            spec["billing_evidence"]["reason"] = "官方套餐计费文档已变化，暂缓数值估算，待核实最新规则。"
    price_field = "price" if spec.get("price") else "reference_price"
    if db is None or not spec.get(price_field):
        return spec
    from hashlib import sha256
    from app.models.model_governance import ModelGovernanceRecord
    source = spec[price_field]["source"]
    row = await db.get(ModelGovernanceRecord, sha256(source.encode()).hexdigest())
    rule = effective_rule(row.data, "price_rule") if row else None
    if row and not rule:
        spec[price_field] = None
        spec["pricing_status"] = "changed_requires_validation"
        return spec
    if rule and rule.get("model") == spec["model_name"] and rule.get("source") == source:
        spec[price_field] = {**spec[price_field], **rule}
    return spec


async def save_generation_default(db, model_id: str, body) -> dict:
    """Validate a chosen default against the exact revision and atomically issue a new immutable model revision."""
    from sqlalchemy import select
    from app.schemas.llm import ModelUpdate
    from app.services.llm.manage import update_model
    model = (await db.execute(select(Model).where(Model.id == model_id).with_for_update())).scalar_one_or_none()
    if model is None or model.current_revision_id != body.expected_revision_id:
        raise HTTPException(status_code=409, detail="模型配置已变化，请重新选择")
    revision = await db.get(ModelConfigRevision, model.current_revision_id)
    spec = await attach_synchronized_price(db, specification(revision))
    if body.field != spec["field"] or body.value not in [item["value"] for item in spec["options"]]:
        raise HTTPException(status_code=422, detail="该模型不支持此默认规格")
    params = dict(model.params or {})
    params["generation_defaults"] = {**params.get("generation_defaults", {}), body.field: body.value}
    if body.generate_audio is not None:
        if not spec.get("generate_audio"):
            raise HTTPException(status_code=422, detail="当前模型不支持原生音频默认值")
        params["generation_defaults"]["generate_audio"] = body.generate_audio
    updated = await update_model(db, model_id=model_id, body=ModelUpdate(params=params))
    await db.commit()
    return {"revision_id": updated.current_revision_id}
