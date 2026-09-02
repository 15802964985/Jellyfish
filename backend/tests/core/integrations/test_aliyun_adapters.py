"""阿里百炼图片/视频适配器：httpx MockTransport 单测，不访问真实服务。"""

from __future__ import annotations

import json

import httpx
import pytest

from app.core.contracts.image_generation import ImageGenerationInput
from app.core.contracts.provider import ProviderConfig
from app.core.contracts.video_generation import VideoGenerationInput
from app.core.integrations.aliyun.images import AliyunImageApiAdapter
from app.core.integrations.aliyun.video import AliyunVideoApiAdapter


def _patch_httpx_client(monkeypatch: pytest.MonkeyPatch, transport: httpx.MockTransport) -> None:
    """把适配器内部 AsyncClient 替换为 MockTransport 客户端。"""
    real_client = httpx.AsyncClient

    def factory(**kwargs: object) -> httpx.AsyncClient:
        kwargs["transport"] = transport
        return real_client(**kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", factory)


@pytest.mark.asyncio
async def test_aliyun_sync_image_generation(monkeypatch: pytest.MonkeyPatch) -> None:
    """万相 2.7 同步响应应解析图片 URL，并使用分类 Base URL。"""
    captured: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["body"] = json.loads(request.content)
        return httpx.Response(
            200,
            json={
                "output": {
                    "choices": [
                        {"message": {"content": [{"image": "https://result.example/image.png"}]}}
                    ]
                }
            },
        )

    _patch_httpx_client(monkeypatch, httpx.MockTransport(handler))
    result = await AliyunImageApiAdapter().generate(
        cfg=ProviderConfig(
            provider="aliyun_bailian",
            api_key="test-key",
            base_url="https://workspace.cn-beijing.maas.aliyuncs.com/api/v1",
        ),
        inp=ImageGenerationInput(prompt="电影角色", model="wan2.7-image", n=1),
        timeout_s=30,
    )

    assert captured["url"] == (
        "https://workspace.cn-beijing.maas.aliyuncs.com/api/v1/"
        "services/aigc/multimodal-generation/generation"
    )
    assert captured["body"]["model"] == "wan2.7-image"  # type: ignore[index]
    assert result.provider == "aliyun_bailian"
    assert result.images[0].url == "https://result.example/image.png"


@pytest.mark.asyncio
async def test_aliyun_video_create_and_poll(monkeypatch: pytest.MonkeyPatch) -> None:
    """万相视频应携带异步请求头，并从统一 tasks 地址查询状态。"""
    requests: list[tuple[str, str, dict[str, object] | None]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content) if request.content else None
        requests.append((request.method, str(request.url), body))
        if request.method == "POST":
            assert request.headers["X-DashScope-Async"] == "enable"
            return httpx.Response(200, json={"output": {"task_id": "task-1", "task_status": "PENDING"}})
        return httpx.Response(
            200,
            json={"output": {"task_id": "task-1", "task_status": "SUCCEEDED", "video_url": "https://result.example/video.mp4"}},
        )

    _patch_httpx_client(monkeypatch, httpx.MockTransport(handler))
    adapter = AliyunVideoApiAdapter()
    cfg = ProviderConfig(
        provider="aliyun_bailian",
        api_key="test-key",
        base_url="https://workspace.cn-beijing.maas.aliyuncs.com/api/v1",
    )
    task_id = await adapter.create_video_task(
        cfg=cfg,
        input_=VideoGenerationInput(
            prompt="人物走入雨夜",
            first_frame_base64="data:image/png;base64,AAAA",
            model="wan3.0-video",
            ratio="16:9",
            seconds=5,
        ),
        timeout_s=30,
    )
    payload = await adapter.get_video_task(cfg=cfg, task_id=task_id, timeout_s=30)

    assert requests[0][1].endswith("/services/aigc/video-generation/video-synthesis")
    assert requests[0][2]["input"]["media"][0]["type"] == "first_frame"  # type: ignore[index]
    assert requests[1][1].endswith("/api/v1/tasks/task-1")
    assert payload["output"]["video_url"] == "https://result.example/video.mp4"

