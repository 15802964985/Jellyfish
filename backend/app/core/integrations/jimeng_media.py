from app.core.contracts.generation_recovery import confirm_media_receipt
from app.core.integrations.traced_http import create_http_client
"""Jimeng Visual APIs: independent AK/SK signing, never Ark bearer or web membership."""
import asyncio
import base64
from datetime import datetime, timezone
import hashlib
import hmac
import io
import json
from urllib.parse import urlsplit
import httpx
from PIL import Image
from app.core.contracts.image_generation import ImageGenerationResult, ImageItem
from app.core.contracts.video_generation import VideoGenerationResult
from app.core.integrations.domestic_media import local_image

IMAGE_MODEL = "t2i_v40_jimeng"
VIDEO_MODEL = "jimeng_i2v_first_tail_v30"
SIZES = {"1:1": "2048x2048", "16:9": "2560x1440", "9:16": "1440x2560",
         "4:3": "2304x1728", "3:4": "1728x2304", "3:2": "2496x1664", "2:3": "1664x2496", "21:9": "3024x1296"}
# Service families are user choices; wire req_key is resolved from actual inputs.
IMAGE_V3 = "即梦AI-图片生成3.0"
IMAGE_V4 = "即梦AI-图片生成4.0"
VIDEO_V3 = "即梦AI-视频生成3.0"
IMAGE_NAMES = {IMAGE_V3, IMAGE_V4, IMAGE_MODEL, "jimeng_t2i_v30", "jimeng_i2i_v30", "jimeng_t2i_v40"}
VIDEO_ROUTES = {
    ("text", "720P"): "jimeng_t2v_v30",
    ("first", "720P"): "jimeng_i2v_first_v30",
    ("first_last", "720P"): "jimeng_i2v_first_tail_v30",
    ("text", "1080P"): "jimeng_t2v_v30_1080p",
    ("first", "1080P"): "jimeng_i2v_first_v30_1080",
    ("first_last", "1080P"): "jimeng_i2v_first_tail_v30_1080",
}
V3_SIZES = {"1:1": "1328x1328", "16:9": "1664x936", "9:16": "936x1664",
    "4:3": "1472x1104", "3:4": "1104x1472", "3:2": "1584x1056", "2:3": "1056x1584", "21:9": "2016x864"}


def image_route(model, reference_count):
    """Select an official operation within the chosen version, never upgrade accounts silently."""
    if model not in IMAGE_NAMES:
        raise ValueError("即梦图片服务版本未核验，请从目录选择")
    if model in {IMAGE_V3, "jimeng_t2i_v30", "jimeng_i2i_v30"}:
        if reference_count > 1:
            raise ValueError("即梦图片3.0智能参考仅支持1张参考图，请明确选择；不会自动升级4.0")
        if model == "jimeng_t2i_v30" and reference_count:
            raise ValueError("此旧配置固定文生图，请改选即梦AI-图片生成3.0以按参考图自动分流")
        if model == "jimeng_i2i_v30" and not reference_count:
            raise ValueError("图生图3.0必须提供1张参考图")
        return "jimeng_i2i_v30" if reference_count else "jimeng_t2i_v30"
    if reference_count:
        raise ValueError("即梦4.0要求公网参考图URL，当前公网导出尚未开放；可选3.0单图参考，不会忽略素材")
    return IMAGE_MODEL if model == IMAGE_MODEL else "jimeng_t2i_v40"


def image_profiles(model, reference_count=0):
    """Keep UI tiers and request sizes sourced from the same version/mode matrix."""
    route = image_route(model, reference_count)
    if route in {"jimeng_t2i_v30", "jimeng_i2i_v30"}:
        return {r: {"standard": size, **({"high": SIZES[r]} if route == "jimeng_t2i_v30" else {})} for r, size in V3_SIZES.items()}
    return {r: {"standard": size} for r, size in SIZES.items()}


def video_route(model, *, first, last, resolution=None):
    """Resolve exact official spelling, including the different 1080p/1080 suffixes."""
    if last and not first:
        raise ValueError("即梦不支持仅尾帧，请提供首帧或选择首尾帧")
    mode = "first_last" if last else "first" if first else "text"
    if model == VIDEO_V3:
        key = VIDEO_ROUTES.get((mode, resolution or "720P"))
    elif model in VIDEO_ROUTES.values():
        expected_mode, tier = next(pair for pair, key in VIDEO_ROUTES.items() if key == model)
        if mode != expected_mode or resolution not in (None, tier):
            raise ValueError("旧即梦配置固定参考模式/分辨率，请改选即梦AI-视频生成3.0以动态匹配；此模式可能需要首帧与尾帧")
        key = model
    else:
        key = None
    if not key:
        raise ValueError("即梦视频服务版本或分辨率未核验")
    return key


HOST = "visual.volcengineapi.com"


def signed_request(cfg, action, payload, *, now=None):
    """Implement public V4 canonical signing; source: volcengine SDK SignerV4, not AWS key derivation."""
    if (cfg.base_url or "").rstrip("/") != "https://" + HOST or not cfg.api_key or not cfg.api_secret:
        raise ValueError("即梦需独立配置官方视觉 API 地址及 AK（API Key）/SK（API Secret），不能使用方舟套餐 Key")
    if action not in {"CVSync2AsyncSubmitTask", "CVSync2AsyncGetResult"}:
        raise ValueError("不允许的即梦接口")
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    stamp = (now or datetime.now(timezone.utc)).strftime("%Y%m%dT%H%M%SZ")
    digest = hashlib.sha256(body).hexdigest()
    query = f"Action={action}&Version=2022-08-31"
    headers = {"content-type": "application/json", "host": HOST, "x-content-sha256": digest, "x-date": stamp}
    names = ";".join(sorted(headers))
    canonical = "\n".join(("POST", "/", query, "".join(f"{key}:{headers[key]}\n" for key in sorted(headers)), names, digest))
    scope = stamp[:8] + "/cn-north-1/cv/request"
    to_sign = "\n".join(("HMAC-SHA256", stamp, scope, hashlib.sha256(canonical.encode()).hexdigest()))
    key = cfg.api_secret.encode()
    for value in (stamp[:8], "cn-north-1", "cv", "request"):
        key = hmac.new(key, value.encode(), hashlib.sha256).digest()
    signature = hmac.new(key, to_sign.encode(), hashlib.sha256).hexdigest()
    headers["authorization"] = f"HMAC-SHA256 Credential={cfg.api_key}/{scope}, SignedHeaders={names}, Signature={signature}"
    return "https://" + HOST + "/?" + query, headers, body


async def request_json(client, *, cfg, action, payload):
    """Keep both AK/SK out of errors; HTTP 200 alone is not success."""
    url, headers, body = signed_request(cfg, action, payload)
    response = await client.post(url, headers=headers, content=body)
    try:
        result = response.json()
    except ValueError as exc:
        raise ValueError(f"即梦返回非 JSON，HTTP {response.status_code}") from exc
    if not isinstance(result, dict):
        raise ValueError("即梦返回非对象结果")
    if response.is_error or result.get("code") != 10000:
        detail = str(result.get("message") or "接口调用失败")
        for secret in (cfg.api_key, cfg.api_secret):
            if secret:
                detail = detail.replace(secret, "[redacted]")
        raise ValueError(f"即梦 HTTP {response.status_code}, code={result.get('code')}, message={detail[:300]}")
    return result


async def run_task(cfg, body, *, timeout_s, watermark=None, image=False):
    """Submit once and keep polling at ten seconds; no charge-bearing automatic retries."""
    async with asyncio.timeout(3300):
        async with create_http_client(timeout=timeout_s, follow_redirects=False) as client:
            result = await request_json(client, cfg=cfg, action="CVSync2AsyncSubmitTask", payload=body)
            task_id = (result.get("data") or {}).get("task_id")
            if not isinstance(task_id, str) or not task_id:
                raise ValueError("即梦未返回任务 ID，不自动重新提交")
            await confirm_media_receipt(task_id)
            query = {"req_key": body["req_key"], "task_id": task_id}
            if image:
                options = {"return_url": True}
                if watermark is not None:
                    options["logo_info"] = {"add_logo": watermark}
                query["req_json"] = json.dumps(options)
            while True:
                result = await request_json(client, cfg=cfg, action="CVSync2AsyncGetResult", payload=query)
                data = result.get("data") or {}
                state = data.get("status")
                if state == "done":
                    return task_id, data
                if state not in {"in_queue", "generating"}:
                    raise ValueError(f"即梦任务未完成；task_id={task_id}, status={str(state)[:40]}")
                await asyncio.sleep(10)


def image_body(inp):
    """Build one billed image using the selected version and actual reference count."""
    route = image_route(inp.model, len(inp.images))
    if not inp.prompt.strip() or len(inp.prompt) > 800 or inp.n != 1:
        raise ValueError("即梦每次生成1张图片，提示词须为1至800字符")
    profiles = image_profiles(inp.model, len(inp.images))
    profile, ratio = inp.resolution_profile or "standard", inp.target_ratio or "1:1"
    size = profiles.get(ratio, {}).get(profile)
    if not size or (inp.size and inp.size != size):
        raise ValueError("即梦当前版本/参考方式不支持所选尺寸或档位，请重新选择")
    w, h = map(int, size.split("x"))
    result = {"req_key": route, "prompt": inp.prompt, "width": w, "height": h}
    if route in {IMAGE_MODEL, "jimeng_t2i_v40"}:
        result["force_single"] = True
    if route == "jimeng_t2i_v30":
        # Preserve the reviewed production prompt rather than accepting implicit vendor rewriting.
        result["use_pre_llm"] = False
    if inp.images:
        encoded = local_image(inp.images[0].image_url, max_bytes=4_700_000)
        with Image.open(io.BytesIO(base64.b64decode(encoded))) as img:
            width, height = img.size
        if max(width, height) > 4096 or max(width/height, height/width) > 3:
            raise ValueError("即梦参考图最大4096px，长短边比不超过3")
        result["binary_data_base64"] = [encoded]
    if inp.seed is not None:
        if inp.seed < -1:
            raise ValueError("即梦 seed 必须不小于 -1")
        result["seed"] = inp.seed
    return result


def video_body(inp):
    """Map text/first/two-frame scenes and resolution without discarding any input."""
    f = inp.frame_references
    route = video_route(inp.model, first=bool(f.first_frame), last=bool(f.last_frame), resolution=getattr(inp, "resolution", None))
    if f.key_frames or inp.subject_references or inp.watermark is not None or getattr(inp, "generate_audio", None) is not None:
        raise ValueError("当前即梦视频不接受关键帧、主体参考、通用水印或原生音频开关")
    if inp.seconds not in (None, 5, 10) or not (inp.prompt or "").strip() or len(inp.prompt) > 800:
        raise ValueError("即梦视频需800字符内提示词，时长5或10秒")
    refs = [local_image(value, max_bytes=4_700_000, ratio=inp.ratio) for value in (f.first_frame, f.last_frame) if value]
    dimensions = []
    for ref in refs:
        with Image.open(io.BytesIO(base64.b64decode(ref))) as img:
            w, h = img.size
        if min(w, h) < 320 or max(w, h) > 4096 or max(w/h, h/w) > 3:
            raise ValueError("即梦首尾帧需320至4096px，长短边比不超过3")
        dimensions.append((w, h))
    if len(dimensions) == 2 and dimensions[0][0]*dimensions[1][1] != dimensions[1][0]*dimensions[0][1]:
        raise ValueError("即梦首帧与尾帧必须为相同比例")
    body = {"req_key": route, "prompt": inp.prompt, "frames": 24 * (inp.seconds or 5) + 1}
    if refs:
        body["binary_data_base64"] = refs
    else:
        body["aspect_ratio"] = inp.ratio
    if inp.seed is not None:
        if inp.seed < -1:
            raise ValueError("即梦 seed 必须不小于 -1")
        body["seed"] = inp.seed
    return body


class JimengImageApiAdapter:
    """Normalize an actual single completed image into shared artifact storage."""
    async def generate(self, *, cfg, inp, timeout_s):
        """The force_single control prevents silently increasing billed image count."""
        task_id, data = await run_task(cfg, image_body(inp), timeout_s=timeout_s, image=True, watermark=inp.watermark)
        urls = data.get("image_urls") or []
        if len(urls) != 1 or not isinstance(urls[0], str) or urlsplit(urls[0]).scheme != "https":
            raise ValueError(f"即梦成功但图片结果异常；task_id={task_id}")
        return ImageGenerationResult(provider="jimeng", images=[ImageItem(url=urls[0])], provider_task_id=task_id, status="succeeded")


class JimengVideoApiAdapter:
    """Return a completed video to existing controlled publication."""
    async def generate(self, *, cfg, inp, timeout_s):
        """Require a usable result URL instead of trusting status alone."""
        task_id, data = await run_task(cfg, video_body(inp), timeout_s=timeout_s)
        url = data.get("video_url")
        if not isinstance(url, str) or urlsplit(url).scheme != "https":
            raise ValueError(f"即梦成功但视频结果缺失；task_id={task_id}")
        return VideoGenerationResult(provider="jimeng", provider_task_id=task_id, url=url, status="succeeded")
