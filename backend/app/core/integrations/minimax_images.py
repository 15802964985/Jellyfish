from app.core.integrations.traced_http import create_http_client
"""MiniMax image-01 explicit text/person-reference generation; no generic scene-reference claims."""
import base64
import io
import httpx
from PIL import Image
from app.core.contracts.image_generation import ImageGenerationResult, ImageItem
from app.core.integrations.minimax_video import request_json

IMAGE_MODELS = {"image-01", "image-01-live"}
RATIO_SIZES = {"1:1": "1024x1024", "16:9": "1280x720", "9:16": "720x1280",
    "4:3": "1152x864", "3:4": "864x1152", "3:2": "1248x832", "2:3": "832x1248", "21:9": "1344x576"}


def build_image_body(inp) -> dict:
    """Map the documented character-reference data URL field without dropping a chosen reference."""
    if inp.model not in IMAGE_MODELS or len(inp.prompt) > 1500:
        raise ValueError("MiniMax 图片型号未核验或提示词超过 1500 字符")
    ratio = inp.target_ratio or "1:1"
    if ratio not in RATIO_SIZES or (inp.model == "image-01-live" and ratio == "21:9"):
        raise ValueError("MiniMax 当前图片型号不支持此比例")
    if not 1 <= inp.n <= 9:
        raise ValueError("MiniMax 单次图片数量需在 1 至 9")
    if inp.resolution_profile == "high":
        raise ValueError("当前 MiniMax 图片适配仅标准档；不会忽略高清选择")
    if inp.size and inp.size != RATIO_SIZES[ratio]:
        raise ValueError("请使用当前比例对应的标准尺寸，自定义尺寸暂未接通")
    body = {"model": inp.model, "prompt": inp.prompt, "aspect_ratio": ratio, "n": inp.n,
        "prompt_optimizer": False, "response_format": "base64"}
    if inp.watermark is not None:
        body["aigc_watermark"] = inp.watermark
    if inp.seed is not None:
        body["seed"] = inp.seed
    if len(inp.images) > 1:
        raise ValueError("当前 MiniMax 人物参考仅开放一张；多图语义待验收")
    refs = []
    for ref in inp.images:
        if getattr(ref, "reference_semantics", None) != "character":
            raise ValueError("MiniMax 仅支持人物参考；当前通用素材未确认人物语义，请选择其他参考图模型")
        value = getattr(ref, "image_url", None)
        if not value or not value.startswith(("data:image/jpeg;base64,", "data:image/png;base64,")) or len(value) > 14_000_000:
            raise ValueError("MiniMax 人物参考需要本地解析的 JPEG/PNG，且小于 10MB")
        try:
            raw = base64.b64decode(value.split(",", 1)[1], validate=True)
            if len(raw) >= 10_000_000:
                raise ValueError("reference too large")
            with Image.open(io.BytesIO(raw)) as img:
                img.verify()
        except Exception as exc:
            raise ValueError("人物参考图片无效") from exc
        refs.append({"type": "character", "image_file": value})
    if refs:
        body["subject_reference"] = refs
    return body


class MinimaxImageApiAdapter:
    """Submit one image call and normalize base64 results into the existing artifact publisher."""
    async def generate(self, *, cfg, inp, timeout_s):
        """Require actual images and expose the vendor request ID without credentials."""
        body = build_image_body(inp)
        async with create_http_client(timeout=timeout_s, follow_redirects=False) as client:
            payload = await request_json(client, cfg=cfg, method="POST", path="/image_generation", json=body)
        data = payload.get("data") or {}
        images = [ImageItem(b64_json=value) for value in data.get("image_base64", []) if isinstance(value, str) and value]
        if not images:
            raise ValueError("MiniMax 没有返回有效图片，不标记成功")
        return ImageGenerationResult(provider="minimax", images=images, provider_task_id=payload.get("id"), status="succeeded")
