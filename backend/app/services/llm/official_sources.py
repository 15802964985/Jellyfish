"""Explicit source identities: overview pages never certify every model or billing channel."""
from app.services.llm.contract_rules import CONTRACT_SOURCES

CATEGORY_SOURCES = {
    ("aliyun_bailian", "text"): ["https://help.aliyun.com/zh/model-studio/qwen-api-reference"],
    ("volcengine", "text"): ["https://www.volcengine.com/docs/82379/1795150"],
    ("minimax", "text"): ["https://platform.minimax.cn/docs/api-reference/text-openai-api"],
    ("minimax", "image"): ["https://platform.minimax.cn/docs/api-reference/image-generation-i2i"],
    ("minimax", "video"): ["https://platform.minimax.cn/docs/api-reference/video-generation-i2v", "https://platform.minimax.cn/docs/api-reference/video-generation-t2v"],
    ("minimax", "audio"): ["https://platform.minimax.cn/docs/api-reference/speech-t2a-http"],
    ("hunyuan", "image"): ["https://cloud.tencent.com/document/product/1823/135745"],
    ("hunyuan", "video"): ["https://cloud.tencent.com/document/product/1823/137202"],
    ("zhipu", "image"): ["https://docs.bigmodel.cn/api-reference/模型-api/图像生成"],
    ("zhipu", "video"): ["https://docs.bigmodel.cn/cn/guide/models/video-generation/cogvideox-3"],
    ("vidu", "image"): ["https://platform.vidu.com/docs/reference-to-image"],
    ("vidu", "video"): ["https://platform.vidu.com/docs/model-map", "https://platform.vidu.com/docs/text-to-video", "https://platform.vidu.com/docs/image-to-video", "https://platform.vidu.com/docs/start-end-to-video", "https://platform.vidu.com/docs/reference-to-video"],
    ("aliyun_bailian", "audio"): ["https://help.aliyun.com/zh/model-studio/non-realtime-tts-user-guide"],
    ("openai", "image"): ["https://developers.openai.com/api/docs/guides/image-generation"],
    ("openai", "video"): ["https://developers.openai.com/api/docs/guides/video-generation"],
    ("anthropic", "text"): ["https://platform.claude.com/docs/en/api/messages"],
    ("google", "text"): ["https://ai.google.dev/api/generate-content"],
    ("deepseek", "text"): ["https://api-docs.deepseek.com/api/create-chat-completion/"],
}
JIMENG_DOCS = {
    "即梦AI-图片生成3.0": ["1616429", "1747301"], "jimeng_t2i_v30": ["1616429"],
    "jimeng_i2i_v30": ["1747301"], "即梦AI-图片生成4.0": ["1817045"],
    "jimeng_t2i_v40": ["1817045"], "t2i_v40_jimeng": ["1863351"],
    "即梦AI-视频生成3.0": ["1792704", "1785204", "1791184", "1792702", "1798092", "1802721"],
    "jimeng_i2v_first_tail_v30": ["1791184"],
    "jimeng_t2v_v30": ["1792704"], "jimeng_i2v_first_v30": ["1785204"],
    "jimeng_t2v_v30_1080p": ["1792702"], "jimeng_i2v_first_v30_1080": ["1798092"],
    "jimeng_i2v_first_tail_v30_1080": ["1802721"],
}
# Exact model tokens were read in these API bodies; this is source identity, not live account acceptance.
VERIFIED_MODEL_SOURCE_IDENTITIES = {
    ("hunyuan", "image", "hy-image-v3"): "https://cloud.tencent.com/document/product/1823/135745",
    ("hunyuan", "video", "hy-video-v1.5"): "https://cloud.tencent.com/document/product/1823/137202",
    **{("zhipu", "image", name): "https://docs.bigmodel.cn/api-reference/模型-api/图像生成"
       for name in ("glm-image", "cogview-4", "cogview-4-250304", "cogview-3-flash")},
    ("zhipu", "video", "cogvideox-3"): "https://docs.bigmodel.cn/cn/guide/models/video-generation/cogvideox-3",
    **{("minimax", "video", name): "https://platform.minimax.cn/docs/api-reference/video-generation-i2v"
       for name in ("MiniMax-Hailuo-2.3", "MiniMax-Hailuo-2.3-Fast", "MiniMax-Hailuo-02")},
}

PRICE_SOURCES = {
    ("aliyun_bailian", "happyhorse-1.1-i2v"): "https://help.aliyun.com/zh/model-studio/happyhorse-1-1-i2v",
    ("aliyun_bailian", "wan2.7-image-pro"): "https://help.aliyun.com/zh/model-studio/wan2-7-image-pro",
}


def model_sources(provider, category, model, overview=None):
    """Return registered evidence scope, not a claim that a page or account passed verification."""
    result = []
    def add(url, kind, scope):
        """Deduplicate source identities while retaining their intended role."""
        if url and not any(item["url"] == url for item in result):
            result.append({"url": url, "kind": kind, "scope": scope})
    add(VERIFIED_MODEL_SOURCE_IDENTITIES.get((provider, category, model)), "interface", "model")
    source = CONTRACT_SOURCES.get((provider, model))
    add(source, "interface", "model")
    if provider == "vidu" and category == "video":
        for path in ("text-to-video", "image-to-video", "start-end-to-video", "reference-to-video"):
            add("https://platform.vidu.cn/docs/" + path, "interface", "category_protocol")
    if provider == "jimeng":
        for doc in JIMENG_DOCS.get(model, []):
            add("https://docs.volcengine.com/docs/85621/"+doc, "interface", "model")
    if provider == "bfl" and model == "flux-kontext-pro":
        add("https://docs.bfl.ai/kontext/kontext_image_editing", "interface", "model")
    elif provider == "bfl":
        add("https://docs.bfl.ai/flux_2/flux2_text_to_image", "interface", "category_protocol")
    if provider == "aliyun_bailian" and model == "wan2.7-image":
        add("https://help.aliyun.com/zh/model-studio/wan-image-generation-and-editing-api-reference", "interface", "model")
    from app.core.integrations.video_edit_registry import CAPABILITIES
    for cap in CAPABILITIES:
        if (cap.provider, cap.model) == (provider, model):
            add(cap.source_url, "interface", "model")
    add(PRICE_SOURCES.get((provider, model)), "price", "model_standard_beijing")
    if provider == "volcengine":
        add("https://www.volcengine.com/docs/82379/2516283", "billing_channel", "account_plan")
    if provider == "aliyun_bailian":
        add("https://help.aliyun.com/zh/model-studio/token-plan-personal-overview", "billing_channel", "account_plan")
    for url in CATEGORY_SOURCES.get((provider, category), []):
        add(url, "interface", "category_protocol")
    add(overview, "overview", "provider_only")
    return result


def build_source_plan(scope, specs):
    """Bind each fetched URL only to explicit model/category targets; include missing-source coverage."""
    sources = {}
    for item in scope:
        spec = specs.get(item["provider"])
        evidence = model_sources(item["provider"], item["category"], item["model"], spec.official_documentation if spec else None)
        item["documentation_scope"] = "model" if any(s["scope"] == "model" for s in evidence) else "protocol_only" if evidence else "missing"
        item["official_sources"] = evidence
        for source in evidence:
            sources.setdefault(source["url"], []).append({**item, "source_kind": source["kind"], "source_scope": source["scope"]})
    for key, spec in specs.items():
        if not any(item["provider"] == key for item in scope):
            for category in getattr(spec, "supported_categories", ("protocol",)):
                category = str(getattr(category, "value", category))
                for source in model_sources(key, category, "", spec.official_documentation):
                    sources.setdefault(source["url"], []).append({"provider": key, "category": category,
                        "model": "未登记固定型号：仅检查协议入口", "configured_ids": [],
                        "source_kind": source["kind"], "source_scope": source["scope"]})
    return sources
