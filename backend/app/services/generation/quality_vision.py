"""Opt-in image review for exact models with verified multimodal chat contracts."""
import base64
from langchain_core.messages import HumanMessage
from app.core.contracts.media import ImageMediaInput
from app.services.generation.files import FileResolver

# https://help.aliyun.com/zh/model-studio/vision-model (verified 2026-09-08)
VISION_REVIEW_MODELS = {'aliyun_bailian': frozenset({
    'qwen3.8-max', 'qwen3.8-max-0902', 'qwen3.8-flash', 'qwen3.7-plus',
    'qwen3.6-plus', 'qwen3.7-flash', 'qwen3.6-flash', 'qwen3.5-plus', 'qwen3.5-flash',
    'qwen3-vl-plus', 'qwen3-vl-flash', 'qwen-vl-max', 'qwen-vl-plus',
})}


def supports_quality_vision(provider: str, model: str) -> bool:
    """Do not infer vision support merely from a provider or an unknown model name."""
    return model in VISION_REVIEW_MODELS.get(provider, ())


async def attach_review_images(db, *, task_id: str, media: ImageMediaInput, messages: list) -> list:
    """Resolve frozen images at execution only; never persist data URIs in task payloads."""
    if len(media.references) > 4:
        raise ValueError('本地质量预检最多选择四张图片')
    parts = [{'type': 'text', 'text': '以下仅为用户确认的参考图片，按顺序编号；区分可见事实与推断，不能保证生成视频质量。'}]
    for index, reference in enumerate(media.references, 1):
        image = await FileResolver(db).resolve_task_reference(task_id=task_id, reference=reference)
        if image.content_type not in ('image/jpeg', 'image/png', 'image/webp') or len(image.content) > 10 * 1024 * 1024:
            raise ValueError('预检图片须为 JPG/PNG/WebP，单张不超过10MB（本地保守限制）')
        parts.extend([{'type': 'text', 'text': f'参考图片 {index}'},
            {'type': 'image_url', 'image_url': {'url': f'data:{image.content_type};base64,' + base64.b64encode(image.content).decode('ascii')}}])
    return [*messages, HumanMessage(content=parts)]
