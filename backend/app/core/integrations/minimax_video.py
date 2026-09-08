"""MiniMax Hailuo adapters, verified against official video-generation API 2026-09-08.

This implementation intentionally uses 768P for Hailuo and explicit model-specific modes.
There is no remote cancellation API in the checked contract: local cancellation stops waiting,
does not promise stopping or refunding the remote generation.
"""
import asyncio
import base64
import io
from urllib.parse import urlsplit
import httpx
from PIL import Image
from app.core.contracts.provider import ProviderConfig
from app.core.contracts.video_generation import VideoGenerationResult
from app.core.integrations.response_errors import raise_provider_error

HAILUO_MODELS = frozenset({"MiniMax-Hailuo-2.3", "MiniMax-Hailuo-2.3-Fast", "MiniMax-Hailuo-02"})
HOSTS = {"api.minimax.cn", "api.minimaxi.com", "api.minimax.io"}


def api_base(cfg: ProviderConfig) -> str:
    """Require an explicit official API origin; never cross accounts or switch plan endpoints."""
    base = (cfg.base_url or "").rstrip("/")
    p = urlsplit(base)
    if (p.scheme != "https" or p.hostname not in HOSTS or p.path != "/v1"
            or p.port not in (None, 443) or p.username or p.password or p.query or p.fragment):
        raise ValueError("请为 MiniMax 显式配置官方 /v1 API 地址，不能使用套餐聊天地址代替媒体 API")
    return base


def validate_frame(value: str, *, ratio: str) -> str:
    """Inspect local projected data URLs without uploading, cropping or silently changing ratio."""
    if not isinstance(value, str) or not value.startswith(("data:image/jpeg;base64,", "data:image/png;base64,", "data:image/webp;base64,")):
        raise ValueError("海螺首尾帧需要经本地文件解析的 JPEG/PNG/WebP 图片")
    if len(value) > 28_000_000:
        raise ValueError("海螺参考图必须小于 20MB")
    try:
        raw = base64.b64decode(value.split(",", 1)[1], validate=True)
        if len(raw) >= 20_000_000:
            raise ValueError("海螺参考图必须小于 20MB")
        with Image.open(io.BytesIO(raw)) as img:
            w, h = img.size
            img.verify()
    except Exception as exc:
        raise ValueError("参考图片无法读取或超过大小限制") from exc
    if min(w, h) <= 300 or not 0.4 <= w / h <= 2.5:
        raise ValueError("海螺首尾帧短边需大于 300px，宽高比须在 2:5 至 5:2")
    rw, rh = map(int, ratio.split(":"))
    if abs(w / h - rw / rh) > 0.03:
        raise ValueError("海螺视频画幅遵循首帧，请调整目标比例或显式处理参考图；不会自动裁剪")
    return value


def build_video_body(inp) -> dict:
    """Validate model/mode and map both frames; unknown controls are rejected before billing."""
    if inp.model not in HAILUO_MODELS:
        raise ValueError("海螺型号尚未核验")
    frames = inp.frame_references
    if inp.subject_references or frames.key_frames:
        raise ValueError("当前海螺适配不接收主体参考或关键帧，不能静默丢弃素材")
    if inp.seed is not None:
        raise ValueError("当前海螺接口未核验 seed")
    if inp.seconds not in (None, 6, 10):
        raise ValueError("当前海螺 768P 时长仅支持 6 或 10 秒")
    prompt = (inp.prompt or "").strip()
    if len(prompt) > 2000:
        raise ValueError("海螺提示词超过 2000 字符，请精简并保留关键事实")
    first, last = frames.first_frame, frames.last_frame
    if inp.model == "MiniMax-Hailuo-2.3-Fast" and not first:
        raise ValueError("海螺 Fast 必须提供首帧")
    if last and (inp.model != "MiniMax-Hailuo-02" or not first):
        raise ValueError("首尾帧模式请使用 MiniMax-Hailuo-02 并提供首帧")
    if not first and (not prompt or inp.ratio != "16:9"):
        raise ValueError("当前海螺文生模式需非空提示词，且仅开放默认 16:9；其他比例请使用首帧")
    body = {"model": inp.model, "prompt": prompt, "duration": inp.seconds or 6,
        "resolution": "768P", "prompt_optimizer": False}
    if first:
        body["first_frame_image"] = validate_frame(first, ratio=inp.ratio)
    if last:
        body["last_frame_image"] = validate_frame(last, ratio=inp.ratio)
    if inp.watermark is not None:
        body["aigc_watermark"] = inp.watermark
    return body


async def request_json(client: httpx.AsyncClient, *, cfg: ProviderConfig, method: str, path: str, **kwargs) -> dict:
    """Keep diagnostics bounded and credentials out of returned errors."""
    response = await client.request(method, api_base(cfg) + path, headers={"Authorization": f"Bearer {cfg.api_key}"}, **kwargs)
    raise_provider_error(response, provider="minimax", api_key=cfg.api_key)
    payload = response.json()
    if not isinstance(payload, dict) or (payload.get("base_resp") or {}).get("status_code") != 0:
        code = (payload.get("base_resp") or {}).get("status_code") if isinstance(payload, dict) else None
        raise ValueError(f"MiniMax 业务请求失败 code={code}；未自动重试")
    return payload


class MinimaxVideoApiAdapter:
    """Submit once, poll at ten-second intervals, retrieve downloadable file, then use shared publication."""
    async def generate(self, *, cfg: ProviderConfig, inp, timeout_s: float = 120) -> VideoGenerationResult:
        """Bound total waiting and preserve selected billing origin across submit/status/file requests."""
        body = build_video_body(inp)
        async with asyncio.timeout(3300):
            async with httpx.AsyncClient(timeout=timeout_s, follow_redirects=False) as client:
                created = await request_json(client, cfg=cfg, method="POST", path="/video_generation", json=body)
                task_id = created.get("task_id")
                if not isinstance(task_id, str) or not task_id:
                    raise ValueError("MiniMax 缺少任务 ID，不自动重复提交")
                while True:
                    payload = await request_json(client, cfg=cfg, method="GET", path="/query/video_generation", params={"task_id": task_id})
                    state = payload.get("status")
                    if state == "Success":
                        file_id = payload.get("file_id")
                        if not file_id:
                            raise ValueError("MiniMax 成功但缺少文件 ID")
                        meta = await request_json(client, cfg=cfg, method="GET", path="/files/retrieve", params={"file_id": file_id})
                        url = (meta.get("file") or {}).get("download_url")
                        if not isinstance(url, str) or urlsplit(url).scheme != "https":
                            raise ValueError("MiniMax 结果没有 HTTPS 下载地址")
                        return VideoGenerationResult(provider="minimax", provider_task_id=task_id, url=url, status="succeeded")
                    if state not in {"Preparing", "Queueing", "Processing"}:
                        raise ValueError(f"MiniMax 视频未成功；task_id={task_id}，状态={str(state)[:40]}")
                    await asyncio.sleep(10)
