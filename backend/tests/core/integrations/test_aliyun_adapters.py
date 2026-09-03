"""阿里百炼图片/视频适配器：httpx MockTransport 单测，不访问真实服务。"""

from __future__ import annotations

import json
from types import SimpleNamespace

import httpx
import pytest

from app.core.contracts.image_generation import ImageGenerationInput
from app.core.contracts.provider import ProviderConfig
from app.core.contracts.video_generation import VideoGenerationInput
from app.core.integrations.aliyun.images import AliyunImageApiAdapter
from app.core.contracts.media import MediaReference
from app.core.integrations.aliyun.video import AliyunVideoApiAdapter, _build_video_body


def _projected_video_input(
    *, model: str, first_frame: str | None = None, subjects: list[SimpleNamespace] | None = None
) -> VideoGenerationInput:
    """构造包含执行期 URL 的阿里视频输入，不把 URL 写回持久化契约。"""
    return VideoGenerationInput.model_construct(
        prompt="人物走入雨夜",
        model=model,
        ratio="16:9",
        seconds=5,
        seed=7,
        watermark=False,
        frame_references=SimpleNamespace(first_frame=first_frame, last_frame=None, key_frames=[]),
        subject_references=subjects or [],
    )


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
        input_=VideoGenerationInput.model_construct(
            prompt="人物走入雨夜",
            model="wan3.0-video",
            ratio="16:9",
            seconds=5,
            seed=None,
            watermark=None,
            frame_references=SimpleNamespace(
                first_frame="data:image/png;base64,AAAA",
                last_frame=None,
                key_frames=[],
            ),
            subject_references=[],
        ),
        timeout_s=30,
    )
    payload = await adapter.get_video_task(cfg=cfg, task_id=task_id, timeout_s=30)

    assert requests[0][1].endswith("/services/aigc/video-generation/video-synthesis")
    assert requests[0][2]["input"]["media"][0]["type"] == "first_frame"  # type: ignore[index]
    assert requests[1][1].endswith("/api/v1/tasks/task-1")
    assert payload["output"]["video_url"] == "https://result.example/video.mp4"


def test_aliyun_happyhorse_payloads_follow_model_family_contracts() -> None:
    """t2v 不带素材、i2v 只带首帧、r2v 使用参考图片/视频。"""
    t2v = _build_video_body(_projected_video_input(model="happyhorse-1.1-t2v"))
    assert "media" not in t2v["input"]
    assert t2v["parameters"]["ratio"] == "16:9"

    i2v = _build_video_body(
        _projected_video_input(model="happyhorse-1.1-i2v", first_frame="https://example/first.png")
    )
    assert i2v["input"]["media"] == [
        {"type": "first_frame", "url": "https://example/first.png"}
    ]
    assert "ratio" not in i2v["parameters"]

    subject = SimpleNamespace(
        images=["https://example/actor.png"],
        videos=["https://example/action.mp4"],
        audios=["https://example/voice.wav"],
        media=[
            MediaReference(file_id="actor", media_kind="image"),
            MediaReference(file_id="action", media_kind="video", ordinal=1),
            MediaReference(file_id="voice", media_kind="audio", ordinal=2),
        ],
    )
    r2v = _build_video_body(_projected_video_input(model="happyhorse-1.1-r2v", subjects=[subject]))
    assert r2v["input"]["media"] == [
        {"type": "reference_image", "url": "https://example/actor.png", "reference_voice": "https://example/voice.wav"},
        {"type": "reference_video", "url": "https://example/action.mp4"},
    ]


def test_aliyun_wan26_uses_legacy_reference_urls_and_size() -> None:
    """Wan 2.6 不应误用 Wan 2.7 的 media/ratio 字段。"""
    subject = SimpleNamespace(
        images=["https://example/actor.png"],
        videos=[],
        media=[MediaReference(file_id="actor", media_kind="image")],
    )
    body = _build_video_body(_projected_video_input(model="wan2.6-r2v", subjects=[subject]))
    assert body["input"]["reference_urls"] == ["https://example/actor.png"]
    assert "media" not in body["input"]
    assert body["parameters"]["size"] == "1280*720"
    assert body["parameters"]["audio"] is False


@pytest.mark.asyncio
async def test_aliyun_video_cancel_uses_common_task_endpoint(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """取消请求必须命中百炼通用异步任务端点。"""

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "POST"
        assert request.url.path.endswith("/api/v1/tasks/task-9/cancel")
        return httpx.Response(200, json="request-9")

    _patch_httpx_client(monkeypatch, httpx.MockTransport(handler))
    result = await AliyunVideoApiAdapter().cancel_video_task(
        cfg=ProviderConfig(
            provider="aliyun_bailian",
            api_key="test-key",
            base_url="https://workspace.cn-beijing.maas.aliyuncs.com/api/v1",
        ),
        task_id="task-9",
        timeout_s=30,
    )
    assert result == "request-9"
