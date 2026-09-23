from app.core.integrations.traced_http import create_http_client
"""Verified BigModel and TokenHub media contracts (2026-09-08), not generic OpenAI guessing."""
import asyncio
import base64
import io
from urllib.parse import quote, urlsplit
import httpx
from PIL import Image
from app.core.contracts.image_generation import ImageGenerationResult, ImageItem
from app.core.contracts.video_generation import VideoGenerationResult
from app.core.integrations.response_errors import raise_provider_error

IMAGE_MODELS = {"zhipu": {"glm-image", "cogview-4", "cogview-4-250304", "cogview-3-flash"},
                "hunyuan": {"hy-image-v3"}}
VIDEO_MODELS = {"zhipu": {"cogvideox-3"}, "hunyuan": {"hy-video-v1.5"}}
SIZES = {"16:9": "1280x720", "9:16": "720x1280", "1:1": "1024x1024",
         "4:3": "1024x768", "3:4": "768x1024"}
GLM_SIZES = {"16:9": "2048x1152", "9:16": "1152x2048", "1:1": "1280x1280",
             "4:3": "1536x1152", "3:4": "1152x1536"}


def official_base(cfg):
    """Reject cross-provider and coding-plan endpoints before attaching credentials."""
    base = (cfg.base_url or "").rstrip("/")
    p = urlsplit(base)
    hosts, path = ({"open.bigmodel.cn"}, "/api/paas/v4") if cfg.provider == "zhipu" else (
        {"tokenhub.tencentmaas.com", "tokenhub.tencentmaas.cn"}, "/v1")
    if cfg.provider not in IMAGE_MODELS or p.scheme != "https" or p.hostname not in hosts or p.path != path or p.port not in (None, 443) or p.username or p.password or p.query or p.fragment:
        raise ValueError("媒体端点需为该厂商中国站官方 API；不自动切换地区、套餐或计费渠道")
    return base


def local_image(value, *, max_bytes, ratio=None):
    """Decode only local JPEG/PNG projections, enforce limits and preserve source framing."""
    if not isinstance(value, str) or not value.startswith(("data:image/jpeg;base64,", "data:image/png;base64,")) or len(value) > max_bytes * 4 / 3 + 128:
        raise ValueError("参考图须为大小合规的本地 JPEG/PNG")
    encoded = value.split(",", 1)[1]
    try:
        raw = base64.b64decode(encoded, validate=True)
        if len(raw) > max_bytes:
            raise ValueError("image too large")
        with Image.open(io.BytesIO(raw)) as img:
            w, h = img.size
            img.verify()
    except Exception as exc:
        raise ValueError("参考图无法读取或超过接口大小限制") from exc
    if ratio:
        rw, rh = map(int, ratio.split(":"))
        if abs(w / h - rw / rh) > 0.03:
            raise ValueError("图生视频遵循首帧比例，请显式调整图片或目标画幅，不会自动裁剪")
    return encoded


async def request_json(client, *, cfg, method, path, **kwargs):
    """One request with bounded, redacted failure evidence; never retry charged submissions."""
    response = await client.request(method, official_base(cfg) + path,
        headers={"Authorization": f"Bearer {cfg.api_key}"}, **kwargs)
    raise_provider_error(response, provider=cfg.provider, api_key=cfg.api_key)
    payload = response.json()
    if not isinstance(payload, dict):
        raise ValueError("供应商返回非对象结果")
    if payload.get("error"):
        error = payload["error"]
        detail = str(error).replace(cfg.api_key, "[redacted]") if cfg.api_key else str(error)
        raise ValueError(f"{cfg.provider} 业务失败：{detail[:500]}")
    return payload


def image_body(provider, inp):
    """Map only documented controls and reject unsupported references instead of dropping them."""
    if inp.model not in IMAGE_MODELS[provider] or inp.n != 1:
        raise ValueError("未核验的图片型号或图片数量；当前每次仅生成一张")
    if not inp.prompt.strip() or len(inp.prompt) > (8192 if provider == "hunyuan" else 2000):
        raise ValueError("提示词为空或超过当前安全接入长度，请精简后重试")
    ratio = inp.target_ratio or "1:1"
    sizes = GLM_SIZES if inp.model == "glm-image" else SIZES
    if ratio not in sizes:
        raise ValueError("当前适配尚未开放此画幅")
    size = inp.size or sizes[ratio]
    w, h = map(int, size.split("x"))
    if inp.target_ratio:
        rw, rh = map(int, ratio.split(":"))
        if abs(w / h - rw / rh) > 0.03:
            raise ValueError("尺寸与目标比例不一致")
    body = {"model": inp.model, "prompt": inp.prompt, "size": size}
    if provider == "zhipu":
        if inp.images or inp.seed is not None:
            raise ValueError("当前智谱图像接口未接入参考图或 seed，请明确改用支持的模型")
        step, minimum, max_area = (32, 1024, 2**22) if inp.model == "glm-image" else (16, 512, 2**21)
        if min(w, h) < minimum or max(w, h) > 2048 or w % step or h % step or w*h > max_area:
            raise ValueError("图片尺寸不符合智谱型号约束")
        body["quality"] = "hd" if inp.model == "glm-image" or inp.resolution_profile == "high" else "standard"
        if inp.watermark is not None:
            body["watermark_enabled"] = inp.watermark
    else:
        if inp.resolution_profile == "high" or min(w, h) < 512 or max(w, h) > 2048 or w*h > 1024**2:
            raise ValueError("混元当前图片标准档面积上限 1024×1024，不会忽略高清参数")
        if inp.watermark is not None:
            raise ValueError("混元 footnote 不是开关水印，当前不能映射此选择")
        if len(inp.images) > 3:
            raise ValueError("混元最多三张参考图")
        if inp.seed is not None:
            if not 0 <= inp.seed <= 4294967295:
                raise ValueError("混元 seed 超出范围")
            body["seed"] = inp.seed
        body["revise"] = False
        if inp.images:
            body["images"] = [local_image(getattr(ref, "image_url", None), max_bytes=10_000_000) for ref in inp.images]
    return body


class DomesticImageApiAdapter:
    """Return provider URLs to existing controlled download/storage/publication."""
    async def generate(self, *, cfg, inp, timeout_s):
        """Do not report success when no usable image is returned."""
        body = image_body(cfg.provider, inp)
        path = "/images/generations" if cfg.provider == "zhipu" else "/wand/hunyuan-image/v3-generation"
        async with create_http_client(timeout=timeout_s, follow_redirects=False) as client:
            payload = await request_json(client, cfg=cfg, method="POST", path=path, json=body)
        images = [ImageItem(url=row["url"]) for row in payload.get("data", [])
            if isinstance(row, dict) and isinstance(row.get("url"), str) and urlsplit(row["url"]).scheme == "https"]
        if len(images) != 1:
            raise ValueError("图片结果数量异常或缺少 HTTPS 地址，不标记成功")
        return ImageGenerationResult(provider=cfg.provider, images=images, status="succeeded",
            provider_task_id=payload.get("id") or payload.get("request_id"))


def video_body(provider, inp):
    """Separate native field names and mode restrictions for CogVideoX and HY video."""
    if inp.model not in VIDEO_MODELS[provider]:
        raise ValueError("视频型号未核验")
    f = inp.frame_references
    if f.key_frames or inp.subject_references or inp.seed is not None:
        raise ValueError("当前视频适配不接受关键帧、主体参考或 seed")
    ratios = {"16:9", "9:16", "1:1"} if provider == "zhipu" else set(SIZES)
    if inp.ratio not in ratios or inp.seconds not in ((None, 5, 10) if provider == "zhipu" else (None, 5)):
        raise ValueError("视频比例或时长不受此型号支持")
    prompt = (inp.prompt or "").strip()
    if not prompt and not f.first_frame:
        raise ValueError("请提供提示词或首帧")
    if len(prompt) > (512 if provider == "zhipu" else 200):
        raise ValueError("视频提示词超过当前接入长度；不会擅自截断镜头事实")
    body = {"model": inp.model, "prompt": prompt, "duration": inp.seconds or 5}
    if provider == "zhipu":
        body.update(size=SIZES[inp.ratio], fps=30, with_audio=False, quality="quality")
        if inp.watermark is not None:
            body["watermark_enabled"] = inp.watermark
        if f.last_frame and not f.first_frame:
            raise ValueError("尾帧必须同时提供首帧")
        refs = [local_image(value, max_bytes=5_000_000, ratio=inp.ratio) for value in (f.first_frame, f.last_frame) if value]
        if refs:
            body["image_url"] = refs if len(refs) == 2 else refs[0]
    else:
        if f.last_frame or inp.watermark is not None:
            raise ValueError("当前混元视频不支持尾帧及通用水印开关")
        body.update(n=1, resolution="720p", revise=False)
        if f.first_frame:
            body["image"] = local_image(f.first_frame, max_bytes=5_000_000, ratio=inp.ratio)
        else:
            body["aspect_ratio"] = inp.ratio
    return body


class DomesticVideoApiAdapter:
    """Submit once and poll boundedly; preserve task ID and reject empty successes."""
    async def generate(self, *, cfg, inp, timeout_s=120):
        """Use separate provider envelopes, never infer success from HTTP 200 alone."""
        body = video_body(cfg.provider, inp)
        zhipu = cfg.provider == "zhipu"
        path = "/videos/generations" if zhipu else "/wand/hunyuan-video/generation"
        async with asyncio.timeout(3300):
            async with create_http_client(timeout=timeout_s, follow_redirects=False) as client:
                created = await request_json(client, cfg=cfg, method="POST", path=path, json=body)
                task_id = created.get("id" if zhipu else "task_id")
                if not isinstance(task_id, str) or not task_id:
                    raise ValueError("供应商未返回任务 ID，不自动重复提交")
                query = ("/async-result/" if zhipu else "/wand/hunyuan-video/tasks/") + quote(task_id, safe="")
                while True:
                    payload = await request_json(client, cfg=cfg, method="GET", path=query)
                    state = payload.get("task_status" if zhipu else "status")
                    if state == ("SUCCESS" if zhipu else "succeeded"):
                        rows = payload.get("video_result" if zhipu else "videos") or []
                        url = rows[0].get("url") if len(rows) == 1 and isinstance(rows[0], dict) else None
                        if not isinstance(url, str) or urlsplit(url).scheme != "https":
                            raise ValueError(f"视频成功但结果缺失；task_id={task_id}")
                        return VideoGenerationResult(provider=cfg.provider, provider_task_id=task_id, url=url, status="succeeded")
                    if state not in ({"PROCESSING"} if zhipu else {"queued", "running"}):
                        raise ValueError(f"视频未成功；task_id={task_id}, status={str(state)[:40]}")
                    await asyncio.sleep(10)
