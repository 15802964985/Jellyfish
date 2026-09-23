from app.core.contracts.generation_recovery import confirm_media_receipt
from app.core.integrations.traced_http import create_http_client
"""BFL image jobs mapped to the existing artifact/publication pipeline."""
import asyncio
from urllib.parse import urlsplit

import httpx

from app.core.contracts.image_generation import ImageGenerationInput, ImageGenerationResult, ImageItem
from app.core.contracts.provider import ProviderConfig
from app.core.integrations.response_errors import raise_provider_error

BFL_MODELS = {"flux-2-pro", "flux-2-pro-preview", "flux-kontext-pro"}


def build_bfl_body(inp: ImageGenerationInput) -> dict:
    """Validate exact mapped models; never ignore references or change the selected model."""
    if inp.model not in BFL_MODELS:
        raise ValueError("BFL 型号尚无已验证的请求映射")
    if inp.n != 1 or inp.watermark is not None:
        raise ValueError("当前 BFL 适配每次一张，不支持 watermark 参数")
    body: dict = {"prompt": inp.prompt}
    if inp.seed is not None:
        body["seed"] = inp.seed
    if inp.model == "flux-kontext-pro":
        if len(inp.images) > 1:
            raise ValueError("Kontext 当前仅支持一张参考图")
        if inp.target_ratio:
            body["aspect_ratio"] = inp.target_ratio
        if inp.images:
            image = getattr(inp.images[0], "image_url", "")
            if not image:
                raise ValueError("参考图尚未由文件解析器加载")
            body["input_image"] = image.split(",", 1)[1] if image.startswith("data:") else image
    else:
        # FLUX.2 official examples document remote URLs; local inline references
        # must not silently be dropped or assumed compatible with Kontext encoding.
        if inp.images:
            raise ValueError("当前 FLUX.2 本地参考图传输尚未核验；请显式选择已支持参考图的模型")
        profiles = {"16:9": (1792, 1024), "9:16": (1024, 1792), "1:1": (1024, 1024), "4:3": (1536, 1152), "3:4": (1152, 1536)}
        if inp.size:
            width, height = map(int, inp.size.lower().split("x"))
        else:
            if inp.target_ratio and inp.target_ratio not in profiles:
                raise ValueError("当前 BFL 画幅尚未映射")
            width, height = profiles[inp.target_ratio or "1:1"]
        if min(width, height) < 64 or width % 16 or height % 16 or width * height > 4_000_000:
            raise ValueError("BFL 图片尺寸超出当前适配范围")
        body.update(width=width, height=height)
    return body


class BflImageApiAdapter:
    """One create followed by bounded polling; no retry that could create duplicate charges."""
    async def generate(self, *, cfg: ProviderConfig, inp: ImageGenerationInput, timeout_s: float) -> ImageGenerationResult:
        """Normalize Ready/failure states to the shared image result."""
        body = build_bfl_body(inp)
        base = (cfg.base_url or "https://api.bfl.ai/v1").rstrip("/")
        headers = {"x-key": cfg.api_key}
        async with asyncio.timeout(timeout_s):
            async with create_http_client(timeout=timeout_s, follow_redirects=False) as client:
                response = await client.post(f"{base}/{inp.model}", headers=headers, json=body)
                raise_provider_error(response, provider="bfl", api_key=cfg.api_key)
                created = response.json()
                poll_url = created.get("polling_url", "")
                poll, origin = urlsplit(poll_url), urlsplit(base)
                trusted_bfl = (origin.hostname or "").endswith(".bfl.ai") and (poll.hostname or "").endswith(".bfl.ai")
                if not created.get("id") or poll.scheme != "https" or poll.username or poll.password or poll.port not in {None, 443} or (poll.hostname != origin.hostname and not trusted_bfl):
                    raise ValueError("BFL 未返回可信查询地址或任务 ID；不会再次创建任务")
                await confirm_media_receipt(str(created["id"]))
                while True:
                    response = await client.get(poll_url, headers=headers)
                    raise_provider_error(response, provider="bfl", api_key=cfg.api_key)
                    result = response.json()
                    state = result.get("status")
                    if state == "Ready":
                        sample = (result.get("result") or {}).get("sample")
                        if not isinstance(sample, str) or not sample.startswith("https://"):
                            raise ValueError("BFL 成功结果缺少图片地址")
                        return ImageGenerationResult(provider="bfl", images=[ImageItem(url=sample)], provider_task_id=str(created["id"]), status="succeeded")
                    if state not in {"Pending", "Reasoning", "Generating"}:
                        raise ValueError("BFL 图片任务失败或返回未识别状态；未自动重试")
                    await asyncio.sleep(3)
