"""阿里云百炼万相异步视频生成 API 适配。"""

from __future__ import annotations

from typing import Any

from app.core.contracts.provider import ProviderConfig
from app.core.contracts.video_generation import VideoGenerationInput
from app.core.integrations.aliyun.video_capabilities import validate_aliyun_video_options
from app.core.integrations.aliyun.images import _aliyun_api_root


def _build_video_body(input_: VideoGenerationInput) -> dict[str, Any]:
    """将 Jellyfish 首/尾/关键帧契约映射为万相 media 数组。"""
    media: list[dict[str, str]] = []
    if input_.first_frame_base64:
        media.append({"type": "first_frame", "url": input_.first_frame_base64})
    if input_.last_frame_base64:
        media.append({"type": "last_frame", "url": input_.last_frame_base64})
    if input_.key_frame_base64 and not input_.first_frame_base64:
        media.append({"type": "first_frame", "url": input_.key_frame_base64})

    request_input: dict[str, Any] = {}
    if input_.prompt:
        request_input["prompt"] = input_.prompt.strip()
    if media:
        request_input["media"] = media

    parameters: dict[str, Any] = {"ratio": input_.ratio}
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
        async with httpx.AsyncClient(timeout=timeout_s) as client:
            response = await client.post(
                root + "/services/aigc/video-generation/video-synthesis",
                headers=headers,
                json=_build_video_body(input_),
            )
            response.raise_for_status()
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
        async with httpx.AsyncClient(timeout=timeout_s) as client:
            response = await client.get(root + f"/tasks/{task_id}", headers=headers)
            response.raise_for_status()
            return response.json()

