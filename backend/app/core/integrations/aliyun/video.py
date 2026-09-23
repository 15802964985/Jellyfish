"""阿里云百炼万相异步视频生成 API 适配。"""

from __future__ import annotations
from app.core.integrations.traced_http import create_http_client
from app.core.integrations.response_errors import raise_provider_error

from typing import Any

from app.core.contracts.provider import ProviderConfig
from app.core.contracts.video_generation import VideoGenerationInput
from app.core.integrations.aliyun.video_capabilities import validate_aliyun_video_options
from app.core.integrations.aliyun.images import _aliyun_api_root


def _frame_media(input_: VideoGenerationInput) -> list[dict[str, str]]:
    """将首尾帧投影为 Wan/HappyHorse 使用的 media 数组。"""
    media: list[dict[str, str]] = []
    frames = input_.frame_references
    if frames.first_frame:
        media.append({"type": "first_frame", "url": frames.first_frame})
    if frames.last_frame:
        media.append({"type": "last_frame", "url": frames.last_frame})
    if frames.key_frames and not frames.first_frame:
        media.append({"type": "first_frame", "url": frames.key_frames[0]})

    return media


def _subject_media(input_: VideoGenerationInput) -> list[dict[str, str]]:
    """按主体和组内顺序展开参考图片/视频，供 r2v 与 Wan 参考生视频使用。"""
    media: list[dict[str, str]] = []
    for subject in input_.subject_references:
        audios = list(getattr(subject, "audios", []))
        voice = audios[0] if audios else None
        for value in getattr(subject, "images", []):
            item = {"type": "reference_image", "url": value}
            if voice:
                item["reference_voice"] = voice
                voice = None
            media.append(item)
        for value in getattr(subject, "videos", []):
            item = {"type": "reference_video", "url": value}
            if voice:
                item["reference_voice"] = voice
                voice = None
            media.append(item)
    return media


def _build_video_body(input_: VideoGenerationInput) -> dict[str, Any]:
    """按阿里模型家族构建请求，避免把通用字段错误发送给所有视频模型。"""
    model = (input_.model or "").strip().lower()
    frames = _frame_media(input_)
    subjects = _subject_media(input_)
    request_input: dict[str, Any] = {}
    if input_.prompt:
        request_input["prompt"] = input_.prompt.strip()

    if model.startswith("happyhorse-1.1-t2v"):
        pass
    elif model.startswith("happyhorse-1.1-i2v"):
        request_input["media"] = frames[:1]
    elif model.startswith("happyhorse-1.1-r2v"):
        request_input["media"] = subjects
    elif model.startswith("wan2.6"):
        request_input["reference_urls"] = [item["url"] for item in subjects]
        if frames:
            request_input["first_frame_url"] = frames[0]["url"]
    else:
        media = [*frames, *subjects]
        if media:
            request_input["media"] = media

    parameters: dict[str, Any] = {"ratio": input_.ratio}
    if model.startswith("happyhorse-1.1-i2v"):
        # 首帧决定画幅，官方 i2v 请求不接受 ratio。
        parameters.pop("ratio", None)
    if model.startswith("wan2.6"):
        size_map = {
            "16:9": "1280*720",
            "9:16": "720*1280",
            "1:1": "960*960",
            "4:3": "1104*832",
            "3:4": "832*1104",
            "21:9": "1344*576",
        }
        parameters = {"size": size_map[input_.ratio], "audio": False}
    if input_.resolution is not None:
        parameters["resolution"] = input_.resolution
    if input_.seconds is not None:
        parameters["duration"] = input_.seconds
    if input_.seed is not None:
        parameters["seed"] = input_.seed
    if input_.watermark is not None:
        parameters["watermark"] = input_.watermark
    return {"model": input_.model, "input": request_input, "parameters": parameters}


class AliyunVideoApiAdapter:
    """负责万相视频任务创建和状态查询，轮询节奏由 Task 层控制。"""

    async def create_video_task(
        self,
        *,
        cfg: ProviderConfig,
        input_: VideoGenerationInput,
        timeout_s: float,
    ) -> str:
        """创建万相异步视频任务并返回供应商 task_id。"""
        try:
            import httpx
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError("httpx is required for Aliyun video generation") from exc

        validate_aliyun_video_options(input_)
        root = _aliyun_api_root(cfg.base_url)
        headers = {
            "Authorization": f"Bearer {cfg.api_key}",
            "Content-Type": "application/json",
            "X-DashScope-Async": "enable",
        }
        async with create_http_client(timeout=timeout_s) as client:
            response = await client.post(
                root + "/services/aigc/video-generation/video-synthesis",
                headers=headers,
                json=_build_video_body(input_),
            )
            raise_provider_error(response, provider=cfg.provider, api_key=cfg.api_key)
            payload: dict[str, Any] = response.json()
        task_id = str((payload.get("output") or {}).get("task_id") or "")
        if not task_id:
            raise RuntimeError(f"Aliyun video create response missing task_id: {payload.get('message') or payload!r}")
        return task_id

    async def get_video_task(
        self,
        *,
        cfg: ProviderConfig,
        task_id: str,
        timeout_s: float,
    ) -> dict[str, Any]:
        """查询万相异步任务，返回原始响应供 Task 层解析。"""
        try:
            import httpx
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError("httpx is required for Aliyun video generation") from exc

        root = _aliyun_api_root(cfg.base_url)
        headers = {"Authorization": f"Bearer {cfg.api_key}"}
        async with create_http_client(timeout=timeout_s) as client:
            response = await client.get(root + f"/tasks/{task_id}", headers=headers)
            raise_provider_error(response, provider=cfg.provider, api_key=cfg.api_key)
            return response.json()

    async def cancel_video_task(
        self,
        *,
        cfg: ProviderConfig,
        task_id: str,
        timeout_s: float,
    ) -> dict[str, Any] | str:
        """取消仍处于 PENDING 的百炼任务；其他状态由供应商返回明确错误。"""
        try:
            import httpx
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError("httpx is required for Aliyun video generation") from exc

        root = _aliyun_api_root(cfg.base_url)
        async with create_http_client(timeout=timeout_s) as client:
            response = await client.post(
                root + f"/tasks/{task_id}/cancel",
                headers={"Authorization": f"Bearer {cfg.api_key}"},
            )
            raise_provider_error(response, provider=cfg.provider, api_key=cfg.api_key)
            return response.json()
