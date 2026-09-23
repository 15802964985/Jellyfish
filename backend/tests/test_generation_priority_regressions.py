"""Regression checks for model-aware specifications, official parsing and diagnostic wire records."""
import json
from types import SimpleNamespace
import httpx
import pytest
from app.core.contracts.generation import ImageGenerationOperationInput, VideoGenerationOperationInput
from app.core.contracts.video_generation import VideoGenerationInput
from app.core.integrations.volcengine.video_payload import build_create_task_body
from app.core.integrations.image_capabilities import resolve_image_size
from app.core.integrations.traced_http import TracedAsyncClient, call_sink
from app.services.generation.specifications import specification, freeze_specification
from app.services.llm.contract_rules import parse_contract_rule, ARK_VIDEO_API, ARK_IMAGE_API
from app.services.llm.documentation import extract_volc_document


def model(provider, name, category, defaults=None):
    """Create an isolated revision using a package endpoint, never actual credentials."""
    return SimpleNamespace(provider_key=provider, model_name=name, category=category,
        model_id="test", id="rev", model_params={"generation_defaults": defaults or {}},
        endpoint_config={"base_url": "https://ark.cn-beijing.volces.com/api/plan/v3"})


@pytest.mark.asyncio
async def test_seedance_low_cost_controls_reach_exact_wire_body():
    """Check resolution/audio defaults and preserve the actual selected model ID."""
    rev = model("volcengine", "doubao-seedance-1.5-pro", "video")
    operation, price = await freeze_specification(None, rev, VideoGenerationOperationInput(seconds=5, ratio="16:9"), references=0)
    body = build_create_task_body(VideoGenerationInput(model=rev.model_name, prompt="测试", ratio="16:9",
        seconds=5, resolution=operation.resolution, generate_audio=operation.generate_audio))
    assert body["resolution"] == "480p" and body["generate_audio"] is False
    assert body["model"] == rev.model_name and price["status"] == "unknown"
    assert "plan" not in body
    with pytest.raises(ValueError):
        build_create_task_body(VideoGenerationInput(model=rev.model_name, prompt="测试", resolution="4k"))


@pytest.mark.asyncio
async def test_wan_reference_mode_uses_pixel_area_and_keeps_frozen_size():
    """A wide 2K image is legal; references forbid 4K, while text-only supports it."""
    rev = model("aliyun_bailian", "wan2.7-image-pro", "image")
    plain = specification(rev, ratio="16:9", references=0)
    edited = specification(rev, ratio="16:9", references=1)
    assert [x["value"] for x in plain["options"]] == ["preview", "standard", "high"]
    assert [x["value"] for x in edited["options"]] == ["preview", "standard"]
    operation, _ = await freeze_specification(None, rev,
        ImageGenerationOperationInput(target_ratio="16:9", resolution_profile="standard"), references=1)
    assert int(operation.size.split("x")[0]) > 2048
    assert resolve_image_size(provider="aliyun_bailian", model=rev.model_name, purpose="video_reference",
        target_ratio="16:9", resolution_profile=operation.resolution_profile, requested_size=operation.size) == operation.size


def test_seedream_four_k_and_model_defaults_are_isolated():
    """Different model revisions expose their own supported tiers without a page-level standard override."""
    rev = model("volcengine", "doubao-seedream-5.0-lite", "image", {"resolution_profile": "ultra"})
    spec = specification(rev)
    assert spec["default"] == "ultra" and spec["options"][-1]["size"] == "4096x4096"
    assert specification(model("volcengine", "doubao-seedance-1.5-pro", "video"))["default"] == "480p"


def test_official_delta_and_bounded_ark_contract():
    """Parse text inserts only and refuse a changed endpoint or unsupported duration range."""
    assert extract_volc_document({"data": [{"ops": [{"insert": "正文", "attributes": {"href": "secret"}}, {"insert": {"image": "binary"}}]}]}) == "正文"
    text = "/api/v3/contents/generations/tasks first_frame last_frame\nresolution string\nSeedance 1.5 pro：可选值 480p、720p、1080p\nurl string\nduration integer\nSeedance 1.5 pro：取值范围 [4, 12]"
    assert parse_contract_rule(ARK_VIDEO_API, text)["resolutions"] == ["480p", "720p", "1080p"]
    assert parse_contract_rule(ARK_VIDEO_API, text.replace("[4, 12]", "[4, 30]")) is None
    assert parse_contract_rule(ARK_VIDEO_API, text.replace("/api/v3/", "/api/v4/")) is None
    image = "/api/v3/images/generations\nSeedream 5.0 lite\n*支持以下两种方式\n可选值：2K、3K、4K\n3686400 16777216"
    assert parse_contract_rule(ARK_IMAGE_API, image)["profiles"] == ["standard", "high", "ultra"]


@pytest.mark.asyncio
async def test_multipart_audit_preserves_fields_not_binary_or_auth():
    """Multipart text and safe version headers survive, including nested provider task IDs."""
    records = []
    async def sink(attempt, values):
        """Collect persisted events for assertions without a database."""
        records.append(values)
    def handler(request):
        """Return a credential-echoing failure to verify final error redaction."""
        return httpx.Response(400, json={"message": "oops PRIVATEKEY" if request.headers.get("authorization") else "form error", "data": {"task_id": "kling-task"}})
    token = call_sink.set(sink)
    try:
        async with TracedAsyncClient(transport=httpx.MockTransport(handler)) as client:
            await client.post("https://official.test/task", headers={"Authorization": "Key PRIVATEKEY",
                "X-Runway-Version": "2024-11-06", "Cookie": "secret-cookie"},
                data={"prompt": "完整提示词", "api_key": "another-secret"},
                files={"image": ("input.png", b"PRIVATEBINARY", "image/png")})
            await client.post("https://official.test/task", data={"prompt": "form prompt", "token": "private-token"})
    finally:
        call_sink.reset(token)
    dumped = json.dumps(records, ensure_ascii=False)
    for secret in ("PRIVATEKEY", "PRIVATEBINARY", "another-secret", "secret-cookie", "private-token"):
        assert secret not in dumped
    assert records[0]["request"]["headers"]["x-runway-version"] == "2024-11-06"
    assert "完整提示词" in dumped and "form prompt" in dumped and "kling-task" in dumped
