"""阿里云百炼万相图片生成与编辑 API 适配。"""

from __future__ import annotations

import asyncio
import time
from typing import Any

from app.core.contracts.image_generation import ImageGenerationInput, ImageGenerationResult, ImageItem
from app.core.contracts.provider import ProviderConfig
from app.core.integrations.aliyun.image_capabilities import validate_aliyun_image_options
from app.core.integrations.image_capabilities import resolve_image_size


def _aliyun_api_root(base_url: str | None) -> str:
    """把文本兼容地址或分类地址归一化为百炼 `/api/v1` 根地址。"""
    value = (base_url or "https://dashscope.aliyuncs.com/api/v1").rstrip("/")
    if "/services/" in value:
        return value.split("/services/", 1)[0]
    for suffix in ("/compatible-mode/v1", "/apps/anthropic"):
        if value.endswith(suffix):
            return value[: -len(suffix)] + "/api/v1"
    if value.endswith("/api/v1"):
        return value
    if value.endswith("/v1"):
        return value[:-3] + "/api/v1"
    return value + "/api/v1"


def _size_for_aliyun(size: str | None, resolution_profile: str | None) -> str | None:
    """将 Jellyfish 的 WxH 表达转换为百炼使用的 W*H；无尺寸时使用档位。"""
    if size:
        return size.replace("x", "*")
    return "2K" if resolution_profile == "high" else None


def _build_messages(input_: ImageGenerationInput) -> list[dict[str, Any]]:
    """构建万相单轮多模态消息，参考图片排在文本提示词之前。"""
    content: list[dict[str, str]] = []
    for ref in input_.images:
        value = ref.image_url or ref.file_id
        if value:
            content.append({"image": value})
    content.append({"text": input_.prompt})
    return [{"role": "user", "content": content}]


def _extract_images(payload: dict[str, Any]) -> list[ImageItem]:
    """兼容万相同步 choices 与异步 results 两类响应结构。"""
    output = payload.get("output") or {}
    candidates: list[Any] = []
    for choice in output.get("choices") or []:
        message = choice.get("message") if isinstance(choice, dict) else None
        if isinstance(message, dict):
            candidates.extend(message.get("content") or [])
    candidates.extend(output.get("results") or [])
    candidates.extend(payload.get("data") or [])

    images: list[ImageItem] = []
    for item in candidates:
        if not isinstance(item, dict):
            continue
        url = item.get("image") or item.get("url") or item.get("image_url")
        b64 = item.get("b64_json")
        if isinstance(url, str) and url:
            images.append(ImageItem(url=url))
        elif isinstance(b64, str) and b64:
            images.append(ImageItem(b64_json=b64))
    return images


class AliyunImageApiAdapter:
    """调用万相同步/异步图片接口，并统一返回 Jellyfish 图片结果。"""

    async def generate(
        self,
        *,
        cfg: ProviderConfig,
        inp: ImageGenerationInput,
        timeout_s: float,
    ) -> ImageGenerationResult:
        """根据模型版本选择万相接口，必要时轮询异步任务至终态。"""
        try:
            import httpx
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError("httpx is required for Aliyun image generation") from exc

        root = _aliyun_api_root(cfg.base_url)
        model = (inp.model or "").strip()
        resolved_size = resolve_image_size(
            provider="aliyun_bailian",
            model=model,
            purpose=inp.purpose,
            target_ratio=inp.target_ratio,
            resolution_profile=inp.resolution_profile,
            requested_size=inp.size,
        )
        resolved = inp.model_copy(update={"size": resolved_size})
        validate_aliyun_image_options(resolved)

        body: dict[str, Any] = {
            "model": model,
            "input": {"messages": _build_messages(resolved)},
            "parameters": {"n": resolved.n},
        }
        size = _size_for_aliyun(resolved.size, resolved.resolution_profile)
        if size:
            body["parameters"]["size"] = size
        if resolved.seed is not None:
            body["parameters"]["seed"] = resolved.seed
        if resolved.watermark is not None:
            body["parameters"]["watermark"] = resolved.watermark

        headers = {"Authorization": f"Bearer {cfg.api_key}", "Content-Type": "application/json"}
        sync_models = ("wan2.7", "qwen-image", "z-image")
        is_sync = model.lower().startswith(sync_models)
        path = (
            "/services/aigc/multimodal-generation/generation"
            if is_sync
            else "/services/aigc/image-generation/generation"
        )
        if not is_sync:
            headers["X-DashScope-Async"] = "enable"

        async with httpx.AsyncClient(timeout=timeout_s) as client:
            response = await client.post(root + path, headers=headers, json=body)
            response.raise_for_status()
            payload = response.json()
            images = _extract_images(payload)
            task_id = str((payload.get("output") or {}).get("task_id") or "")
            status_value = str((payload.get("output") or {}).get("task_status") or "SUCCEEDED")

            if task_id and not images:
                deadline = time.monotonic() + max(timeout_s, 300.0)
                while time.monotonic() < deadline:
                    await asyncio.sleep(2)
                    poll = await client.get(root + f"/tasks/{task_id}", headers=headers)
                    poll.raise_for_status()
                    payload = poll.json()
                    output = payload.get("output") or {}
                    status_value = str(output.get("task_status") or "").upper()
                    if status_value == "SUCCEEDED":
                        images = _extract_images(payload)
                        break
                    if status_value in {"FAILED", "CANCELED", "UNKNOWN"}:
                        raise RuntimeError(f"Aliyun image task failed: {output.get('message') or payload.get('message') or status_value}")
                else:
                    raise TimeoutError(f"Aliyun image task timed out: task_id={task_id}")

        if not images:
            raise RuntimeError(f"Aliyun image response has no usable image: status={status_value}")
        return ImageGenerationResult(
            images=images,
            provider="aliyun_bailian",
            provider_task_id=task_id or None,
            status=status_value or "SUCCEEDED",
        )

