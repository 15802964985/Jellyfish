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
        async with httpx.AsyncClient(timeout=timeout_s, follow_redirects=False) as client:
            result = await request_json(client, cfg=cfg, action="CVSync2AsyncSubmitTask", payload=body)
            task_id = (result.get("data") or {}).get("task_id")
            if not isinstance(task_id, str) or not task_id:
                raise ValueError("即梦未返回任务 ID，不自动重新提交")
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
    """Open text-only generation until an approved public reference export is available."""
    if inp.model != IMAGE_MODEL or not inp.prompt.strip() or len(inp.prompt) > 800 or inp.n != 1:
        raise ValueError("即梦当前开放 t2i_v40_jimeng 单图、800字符内提示词")
    if inp.images:
        raise ValueError("即梦图片接口要求公网参考图 URL；当前本地文件未开放公网导出。请改用支持本地参考图的模型，不会忽略素材")
    if inp.resolution_profile == "high":
        raise ValueError("即梦当前开放标准2K档，4K档需单独验收")
    ratio = inp.target_ratio or "1:1"
    if ratio not in SIZES or (inp.size and inp.size != SIZES[ratio]):
        raise ValueError("即梦当前请使用标准档指定比例尺寸")
    w, h = map(int, SIZES[ratio].split("x"))
    result = {"req_key": IMAGE_MODEL, "prompt": inp.prompt, "width": w, "height": h, "force_single": True}
    if inp.seed is not None:
        if inp.seed < -1:
            raise ValueError("即梦 seed 必须不小于 -1")
        result["seed"] = inp.seed
    return result


def video_body(inp):
    """Require both compliant first/last frames; don't relabel image guidance as editing."""
    f = inp.frame_references
    if inp.model != VIDEO_MODEL or not f.first_frame or not f.last_frame:
        raise ValueError("即梦当前视频型号必须同时提供首帧与尾帧")
    if f.key_frames or inp.subject_references or inp.watermark is not None:
        raise ValueError("当前即梦视频不接受关键帧、主体参考或通用水印开关")
    if inp.seconds not in (None, 5, 10) or not inp.prompt or len(inp.prompt) > 800:
        raise ValueError("即梦视频需800字符内提示词，时长5或10秒")
    refs = [local_image(value, max_bytes=4_700_000, ratio=inp.ratio) for value in (f.first_frame, f.last_frame)]
    for ref in refs:
        with Image.open(io.BytesIO(base64.b64decode(ref))) as img:
            w, h = img.size
        if min(w, h) < 320 or max(w, h) > 4096 or max(w/h, h/w) > 3:
            raise ValueError("即梦首尾帧需320至4096px，长短边比不超过3")
    body = {"req_key": VIDEO_MODEL, "prompt": inp.prompt, "binary_data_base64": refs, "frames": 24 * (inp.seconds or 5) + 1}
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
