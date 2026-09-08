"""Offline contract regressions; no credentials, external inference, or provider quota assertions."""
import asyncio
import base64
from datetime import datetime, timezone
import io
import json
from types import SimpleNamespace as NS
import httpx
import pytest
from PIL import Image
from app.core.contracts.provider import ProviderConfig
from app.core.integrations import domestic_media as dm, jimeng_media as jm, minimax_video as mv, minimax_images as mi, minimax_speech as ms
from app.core.integrations.video_capabilities import resolve_video_capability, register_video_model_capability, VideoModelCapability, validate_video_options
from app.core.integrations.model_catalog import discover_provider_models
from app.services.llm.scenario_recommendations import recommend_for_models


def png(w=640, h=360):
    """Generate tiny deterministic local references, never copy customer assets."""
    data = io.BytesIO()
    Image.new("RGB", (w, h), "white").save(data, format="PNG")
    return "data:image/png;base64," + base64.b64encode(data.getvalue()).decode()


def image_input(model, **overrides):
    """Build the execution projection without URLs in public DTOs."""
    return NS(**dict(dict(model=model, prompt="画一支铅笔", images=[], n=1, target_ratio="1:1",
        size=None, resolution_profile="standard", seed=None, watermark=None), **overrides))


def video_input(model, **overrides):
    """Default to a text-only test, opt in to each frame explicitly."""
    return NS(**dict(dict(model=model, prompt="微风轻吹", frame_references=NS(first_frame=None, last_frame=None, key_frames=[]),
        subject_references=[], ratio="16:9", seconds=None, seed=None, watermark=None), **overrides))


@pytest.mark.parametrize("provider,model", [("zhipu", "glm-image"), ("zhipu", "cogview-4"), ("hunyuan", "hy-image-v3")])
def test_native_image_size_and_reference_contract(provider, model):
    """Standard sizes obey each native limit; selected references aren't silently discarded."""
    body = dm.image_body(provider, image_input(model))
    assert body["model"] == model and body["size"]
    refs = [NS(image_url=png())]
    if provider == "zhipu":
        with pytest.raises(ValueError, match="参考图"):
            dm.image_body(provider, image_input(model, images=refs))
    else:
        body = dm.image_body(provider, image_input(model, images=refs))
        assert base64.b64decode(body["images"][0])[:8] == b"\x89PNG\r\n\x1a\n"


@pytest.mark.parametrize("provider,model", [("zhipu", "cogvideox-3"), ("hunyuan", "hy-video-v1.5")])
def test_native_video_modes(provider, model):
    """Do not use first/last/keyframe fields interchangeably."""
    frame = png()
    body = dm.video_body(provider, video_input(model, frame_references=NS(first_frame=frame, last_frame=None, key_frames=[])))
    assert body["duration"] == 5
    if provider == "hunyuan":
        assert "image" in body and "aspect_ratio" not in body
        with pytest.raises(ValueError, match="尾帧"):
            dm.video_body(provider, video_input(model, frame_references=NS(first_frame=frame, last_frame=frame, key_frames=[])))
    else:
        body = dm.video_body(provider, video_input(model, frame_references=NS(first_frame=frame, last_frame=frame, key_frames=[])))
        assert len(body["image_url"]) == 2 and body["with_audio"] is False


@pytest.mark.parametrize("provider,model", [("zhipu", "cogvideox-3"), ("hunyuan", "hy-video-v1.5")])
def test_native_video_duration_rejected(provider, model):
    """No silent truncation of a chapter's desired shot length."""
    with pytest.raises(ValueError, match="时长"):
        dm.video_body(provider, video_input(model, seconds=12))


def test_hailuo_and_jimeng_required_frames():
    """Fast requires first; Jimeng requires both frames before any call."""
    with pytest.raises(ValueError, match="首帧"):
        mv.build_video_body(video_input("MiniMax-Hailuo-2.3-Fast"))
    frame = png()
    both = NS(first_frame=frame, last_frame=frame, key_frames=[])
    assert mv.build_video_body(video_input("MiniMax-Hailuo-02", frame_references=both))["last_frame_image"] == frame
    assert jm.video_body(video_input(jm.VIDEO_MODEL, frame_references=both))["frames"] == 121
    with pytest.raises(ValueError, match="尾帧"):
        validate_video_options(provider="jimeng", model=jm.VIDEO_MODEL,
            input_=video_input(jm.VIDEO_MODEL, frame_references=NS(first_frame=frame, last_frame=None, key_frames=[])))


def test_no_generic_person_reference_or_public_export():
    """Do not pass scenery as a face or claim private RustFS files are publicly accessible."""
    ref = NS(image_url=png())
    with pytest.raises(ValueError, match="人物语义"):
        mi.build_image_body(image_input("image-01", images=[ref]))
    with pytest.raises(ValueError, match="公网"):
        jm.image_body(image_input(jm.IMAGE_MODEL, images=[ref]))
    assert jm.image_body(image_input(jm.IMAGE_MODEL))["force_single"] is True


@pytest.mark.parametrize("provider", ["unknown", "deepseek", "fal"])
def test_unknown_video_capability_never_uses_ark(provider):
    """Missing/only-edit adapters cannot borrow Ark generation defaults."""
    with pytest.raises(ValueError):
        resolve_video_capability(provider=provider, model="any")
    with pytest.raises(ValueError):
        register_video_model_capability(provider=provider, model_prefix="any", capability=VideoModelCapability())


@pytest.mark.parametrize("provider,base", [("zhipu", "https://open.bigmodel.cn/api/coding/paas/v4"),
    ("hunyuan", "https://api.hunyuan.cloud.tencent.com/v1"), ("minimax", "https://api.minimax.cn/v1.evil"),
    ("jimeng", "https://ark.cn-beijing.volces.com/api/plan/v3")])
def test_wrong_account_channel_rejected(provider, base):
    """Preserve the configured billing channel, never fallback to another paid endpoint."""
    cfg = ProviderConfig(provider=provider, api_key="test-ak", api_secret="test-sk", base_url=base)
    with pytest.raises(ValueError):
        if provider == "jimeng":
            jm.signed_request(cfg, "CVSync2AsyncSubmitTask", {})
        elif provider == "minimax":
            mv.api_base(cfg)
        else:
            dm.official_base(cfg)


def test_signing_scope_and_secret_hygiene():
    """Timestamp/body/action are authenticated; credentials stay out of runtime repr and body."""
    cfg = ProviderConfig(provider="jimeng", api_key="test-ak", api_secret="test-sk", base_url="https://visual.volcengineapi.com")
    now = datetime(2026, 9, 8, tzinfo=timezone.utc)
    url, headers, body = jm.signed_request(cfg, "CVSync2AsyncSubmitTask", {"prompt": "你好"}, now=now)
    assert "Action=CVSync2AsyncSubmitTask&Version=2022-08-31" in url
    assert "20260908/cn-north-1/cv/request" in headers["authorization"]
    assert json.loads(body) == {"prompt": "你好"}
    assert "test-sk" not in str(headers) and "test-ak" not in repr(cfg) and "test-sk" not in repr(cfg)
    other = jm.signed_request(cfg, "CVSync2AsyncSubmitTask", {"prompt": "改变"}, now=now)
    assert other[1]["authorization"] != headers["authorization"]


def speech_params():
    """Explicit official endpoint plus a test-only voice name."""
    return {"audio_endpoint": "https://api.minimax.cn/v1/t2a_v2", "voice": "test-voice"}


@pytest.mark.parametrize("override", [{"instruction": "更开心"}, {"language_type": "unsupported"}, {"text": "x" * 10000}])
def test_speech_invalid_input_rejected(override):
    """Unsupported controls must fail before submitting a paid request."""
    args = dict(model="speech-2.8-hd", params=speech_params(), text="你好")
    args.update(override)
    with pytest.raises(ValueError):
        ms.build_speech_request(**args)


@pytest.mark.parametrize("provider", ["minimax", "zhipu", "hunyuan", "jimeng"])
@pytest.mark.asyncio
async def test_catalog_is_offline_and_matches_exact_adapters(provider, monkeypatch):
    """Directory lookup must not consume inference or claim account availability."""
    def no_network(*args, **kwargs):
        raise AssertionError("unexpected network")
    monkeypatch.setattr(httpx, "AsyncClient", no_network)
    catalog = await discover_provider_models(cfg=ProviderConfig(provider=provider, api_key=""))
    assert catalog.source == "provider_catalog" and catalog.models


@pytest.mark.parametrize("provider,model", [("zhipu", "cogvideox-3"), ("hunyuan", "hy-video-v1.5")])
@pytest.mark.parametrize("empty", [False, True])
@pytest.mark.asyncio
async def test_native_video_submit_poll_and_empty_success(provider, model, empty, monkeypatch):
    """Mock transport verifies endpoint and result contracts without paid requests."""
    calls = []
    def handler(req):
        calls.append(req)
        if req.method == "POST":
            return httpx.Response(200, json={"id" if provider == "zhipu" else "task_id": "task-1"})
        return httpx.Response(200, json={"task_status" if provider == "zhipu" else "status": "SUCCESS" if provider == "zhipu" else "succeeded",
            "video_result" if provider == "zhipu" else "videos": [] if empty else [{"url": "https://example.invalid/video.mp4"}]})
    original = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: original(transport=httpx.MockTransport(handler), **kw))
    cfg = ProviderConfig(provider=provider, api_key="test", base_url="https://open.bigmodel.cn/api/paas/v4" if provider == "zhipu" else "https://tokenhub.tencentmaas.com/v1")
    if empty:
        with pytest.raises(ValueError, match="结果缺失"):
            await dm.DomesticVideoApiAdapter().generate(cfg=cfg, inp=video_input(model))
    else:
        result = await dm.DomesticVideoApiAdapter().generate(cfg=cfg, inp=video_input(model))
        assert result.provider_task_id == "task-1"
    assert len(calls) == 2 and sum(req.method == "POST" for req in calls) == 1


@pytest.mark.asyncio
async def test_speech_hex_result(monkeypatch):
    """Only a complete result becomes MP3 bytes for the shared audio publisher."""
    original = httpx.AsyncClient
    def handler(req):
        body = json.loads(req.content)
        assert body["language_boost"] == "Chinese" and body["voice_setting"]["voice_id"] == "test-voice"
        return httpx.Response(200, json={"base_resp": {"status_code": 0}, "data": {"status": 2, "audio": b"ID3test".hex()}})
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: original(transport=httpx.MockTransport(handler), **kw))
    data, mime, ext = await ms.generate_speech(model="speech-2.8-hd", params=speech_params(), api_key="test", text="你好")
    assert data == b"ID3test" and mime == "audio/mpeg" and ext == ".mp3"


def test_recommendations_filter_disabled_unknown_and_missing_voice():
    """All saved candidates are considered, but missing prerequisites remain noneligible."""
    from app.models.llm import Model, Provider
    rows = [(Model(id="m1", name="hy-image-v3", category="image", params={}),
        Provider(id="p1", name="我的混元", adapter_key="hunyuan", api_key="test", base_url="https://tokenhub.tencentmaas.com/v1", status="disabled")),
        (Model(id="m2", name="speech-2.8-hd", category="audio", params={}),
        Provider(id="p2", name="MiniMax", adapter_key="minimax", api_key="test", status="active")),
        (Model(id="m3", name="unknown", category="text", params={}),
        Provider(id="p3", name="Unknown", adapter_key="no-provider", api_key="test", status="active"))]
    result = recommend_for_models(rows)
    choices = [choice for scene in result for choice in scene.choices]
    assert choices and not any(choice.eligible for choice in choices)
    assert "m3" not in {choice.model_id for choice in choices}


@pytest.mark.parametrize("category", ["image", "video"])
def test_old_provider_unknown_model_is_not_recommended(category):
    """Legacy provider-wide default capabilities must not certify an invented exact model."""
    from app.models.llm import Model, Provider
    rows = [(Model(id="u1", name="invented-model", category=category, params={}),
        Provider(id="p1", name="火山引擎", adapter_key="volcengine", api_key="test", status="active"))]
    choices = [choice for scene in recommend_for_models(rows) for choice in scene.choices]
    assert choices and not any(choice.eligible for choice in choices)


@pytest.mark.parametrize("provider,model,modality,limit", [("minimax", "image-01", "image", 1500),
    ("minimax", "MiniMax-Hailuo-02", "video", 2000), ("zhipu", "cogvideox-3", "video", 512),
    ("hunyuan", "hy-image-v3", "image", 8192), ("jimeng", jm.VIDEO_MODEL, "video", 800)])
def test_final_prompt_budget_is_checked_before_billing(provider, model, modality, limit):
    """Final compiled rules count toward the limit; never silently truncate facts."""
    from fastapi import HTTPException
    from app.services.generation.prompt_budget import require_prompt_budget
    assert require_prompt_budget(provider=provider, model=model, modality=modality, prompt="字" * limit)["status"] == "within_limit"
    with pytest.raises(HTTPException):
        require_prompt_budget(provider=provider, model=model, modality=modality, prompt="字" * (limit + 1))


def test_reference_and_dual_frame_preflight():
    """Reject missing requirements at the submission gate, not after task creation."""
    from fastapi import HTTPException
    from app.core.contracts.generation import ImageGenerationOperationInput, VideoGenerationOperationInput
    from app.core.contracts.media import ImageMediaInput, MediaReference
    from app.services.generation.domestic_preflight import validate_domestic_submission
    media = ImageMediaInput(references=[MediaReference(file_id="f1", media_kind="image")])
    with pytest.raises(HTTPException):
        validate_domestic_submission(provider="zhipu", model="cogview-4", operation=ImageGenerationOperationInput(), media=media)
    with pytest.raises(HTTPException):
        validate_domestic_submission(provider="jimeng", model=jm.VIDEO_MODEL, operation=VideoGenerationOperationInput(ratio="16:9"), media=None)


@pytest.mark.asyncio
async def test_cancellation_stops_polling(monkeypatch):
    """Local cancellation propagates; no retries and no refund promises."""
    async def waiting(*args, **kwargs):
        raise asyncio.CancelledError()
    monkeypatch.setattr(dm, "request_json", waiting)
    with pytest.raises(asyncio.CancelledError):
        await dm.DomesticVideoApiAdapter().generate(cfg=ProviderConfig(provider="zhipu", api_key="test"), inp=video_input("cogvideox-3"))


@pytest.mark.asyncio
async def test_hailuo_submit_query_and_file_retrieval(monkeypatch):
    """Success requires both a completed task and a retrievable generated file."""
    calls = []
    def handler(req):
        calls.append(req)
        if req.url.path.endswith("/video_generation") and req.method == "POST":
            data = {"task_id": "task-2"}
        elif req.url.path.endswith("/query/video_generation"):
            data = {"status": "Success", "file_id": "file-2"}
        else:
            assert req.url.path == "/v1/files/retrieve" and req.url.params["file_id"] == "file-2"
            data = {"file": {"download_url": "https://example.invalid/video.mp4"}}
        return httpx.Response(200, json={"base_resp": {"status_code": 0}, **data})
    original = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: original(transport=httpx.MockTransport(handler), **kw))
    result = await mv.MinimaxVideoApiAdapter().generate(cfg=ProviderConfig(provider="minimax", api_key="test", base_url="https://api.minimax.cn/v1"), inp=video_input("MiniMax-Hailuo-2.3"))
    assert result.provider_task_id == "task-2" and len(calls) == 3
    assert sum(req.method == "POST" for req in calls) == 1


@pytest.mark.parametrize("kind", ["image", "video"])
@pytest.mark.asyncio
async def test_jimeng_signed_submit_poll_result(kind, monkeypatch):
    """Both Visual requests carry native signatures, not bearer tokens."""
    calls = []
    def handler(req):
        calls.append(req)
        assert req.headers["authorization"].startswith("HMAC-SHA256 ")
        body = json.loads(req.content)
        if req.url.params["Action"] == "CVSync2AsyncSubmitTask":
            if kind == "image":
                assert body["force_single"] is True
            else:
                assert len(body["binary_data_base64"]) == 2
            data = {"task_id": "jimeng-task"}
        else:
            assert body["task_id"] == "jimeng-task"
            data = {"status": "done", "image_urls": ["https://example.invalid/img.png"], "video_url": "https://example.invalid/video.mp4"}
        return httpx.Response(200, json={"code": 10000, "data": data})
    original = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: original(transport=httpx.MockTransport(handler), **kw))
    cfg = ProviderConfig(provider="jimeng", api_key="test-ak", api_secret="test-sk", base_url="https://visual.volcengineapi.com")
    if kind == "image":
        result = await jm.JimengImageApiAdapter().generate(cfg=cfg, inp=image_input(jm.IMAGE_MODEL), timeout_s=10)
    else:
        frame = png()
        result = await jm.JimengVideoApiAdapter().generate(cfg=cfg, inp=video_input(jm.VIDEO_MODEL,
            frame_references=NS(first_frame=frame, last_frame=frame, key_frames=[])), timeout_s=10)
    assert result.provider_task_id == "jimeng-task" and len(calls) == 2


@pytest.mark.parametrize("provider,model", [("minimax", "image-01"), ("zhipu", "cogview-4"), ("hunyuan", "hy-image-v3")])
@pytest.mark.asyncio
async def test_image_result_contract(provider, model, monkeypatch):
    """The native result enters the exact generic image publication DTO."""
    calls = []
    def handler(req):
        calls.append(req)
        assert json.loads(req.content)["model"] == model
        return httpx.Response(200, json={"base_resp": {"status_code": 0},
            "data": {"image_base64": [png().split(",", 1)[1]]} if provider == "minimax" else [{"url": "https://example.invalid/img.png"}]})
    original = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: original(transport=httpx.MockTransport(handler), **kw))
    cfg = ProviderConfig(provider=provider, api_key="test", base_url={"minimax": "https://api.minimax.cn/v1",
        "zhipu": "https://open.bigmodel.cn/api/paas/v4", "hunyuan": "https://tokenhub.tencentmaas.com/v1"}[provider])
    adapter = mi.MinimaxImageApiAdapter() if provider == "minimax" else dm.DomesticImageApiAdapter()
    result = await adapter.generate(cfg=cfg, inp=image_input(model), timeout_s=10)
    assert len(result.images) == 1 and result.status == "succeeded" and len(calls) == 1
