"""Evidence-backed prompt limits; unknown models never inherit another model's budget."""
import re
from fastapi import HTTPException


def inspect_prompt_budget(*, provider: str, model: str, prompt: str, modality: str) -> dict:
    """Count characters, preserve all facts, and report explicit unknown limits."""
    limit = None
    source = None
    conservative = False
    from app.core.integrations.domestic_media import IMAGE_MODELS, VIDEO_MODELS
    from app.core.integrations.minimax_video import HAILUO_MODELS
    from app.core.integrations.minimax_images import IMAGE_MODELS as MINIMAX_IMAGES
    if provider == "minimax":
        if modality == "image" and model in MINIMAX_IMAGES:
            limit, source = 1500, "https://platform.minimax.cn/docs/api-reference/image-generation-i2i"
        elif modality == "video" and model in HAILUO_MODELS:
            limit, source = 2000, "https://platform.minimax.cn/docs/api-reference/video-generation-i2v"
    elif provider in IMAGE_MODELS:
        if modality == "video" and model in VIDEO_MODELS[provider]:
            limit = 512 if provider == "zhipu" else 200
            source = "https://docs.bigmodel.cn/api-reference/模型-api/视频生成异步" if provider == "zhipu" else "https://cloud.tencent.com/document/product/1823/137202"
            conservative = provider == "hunyuan"
        elif modality == "image" and model in IMAGE_MODELS[provider]:
            limit = 2000 if provider == "zhipu" else 8192
            source = "https://docs.bigmodel.cn/api-reference/模型-api/图像生成" if provider == "zhipu" else "https://cloud.tencent.com/document/product/1823/135745"
            conservative = provider == "zhipu"
    elif provider == "jimeng":
        from app.core.integrations.jimeng_media import IMAGE_NAMES, VIDEO_ROUTES, VIDEO_V3, IMAGE_MODEL
        if (modality == "image" and model in IMAGE_NAMES) or (modality == "video" and model in {*VIDEO_ROUTES.values(), VIDEO_V3}):
            document = "1863351" if model == IMAGE_MODEL else "1616429" if "3.0" in model or "v30" in model else "1817045"
            limit, source = 800, "https://docs.volcengine.com/docs/85621/" + (document if modality == "image" else "1792710")
    if provider == 'aliyun_bailian' and modality == 'video':
        if model in ('wan2.7-t2v', 'wan2.7-t2v-2026-06-12'):
            limit, source = 5000, 'https://help.aliyun.com/zh/model-studio/text-to-video-api-reference'
        elif model in ('wan2.7-r2v', 'wan2.7-r2v-2026-06-12'):
            limit, source = 5000, 'https://help.aliyun.com/zh/model-studio/wan-video-to-video-api-reference'
        elif model in ('wan2.7-i2v', 'wan2.7-i2v-2026-04-25'):
            limit, source = 5000, 'https://help.aliyun.com/zh/model-studio/image-to-video-general-api-reference'
        elif model in ('happyhorse-1.0-i2v', 'happyhorse-1.1-i2v'):
            # The docs distinguish Chinese/non-Chinese, not a mixed-language weighting algorithm.
            conservative = bool(re.search(r'[\u3400-\u9fff]', prompt))
            limit = 2500 if conservative else 5000
            source = 'https://help.aliyun.com/zh/model-studio/happyhorse-image-to-video-api-reference'
    return {'characters': len(prompt), 'max_characters': limit, 'official_source': source,
        'checked_on': '2026-09-08' if source else None, 'conservative_mixed_language': conservative,
        'limit_note': '部分值为本地保守接入限制，不是厂商官方最大值' if (provider == 'hunyuan' and modality == 'video') or (provider == 'zhipu' and modality == 'image') else '',
        'status': 'unknown' if limit is None else ('exceeded' if len(prompt) > limit else 'within_limit'),
        'warning': '该精确型号的提示词上限尚未核验，不代表无限制；不自动截断或套用其他型号限制。' if limit is None else ''}


def require_prompt_budget(**kwargs) -> dict:
    """Reject known overflow before billing instead of letting the vendor silently truncate."""
    report = inspect_prompt_budget(**kwargs)
    if report['status'] == 'exceeded':
        raise HTTPException(status_code=422, detail=f"最终提示词 {report['characters']} 字符，超过当前型号采用的 {report['max_characters']} 字符限制；请保留主体、动作与关键约束，人工精简后重新预览。不会自动截断。依据：{report['official_source']}")
    return report
