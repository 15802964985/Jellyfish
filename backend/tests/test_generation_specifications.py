"""Validate estimates against selected parameters and the actual provider request without paid HTTP."""
from types import SimpleNamespace
import pytest
from fastapi import HTTPException
from app.core.contracts.generation import VideoGenerationOperationInput
from app.core.contracts.video_generation import VideoGenerationInput
from app.core.integrations.aliyun.video import _build_video_body
from app.services.generation.specifications import freeze_specification, specification


def revision(endpoint="https://dashscope.aliyuncs.com/compatible-mode/v1", defaults=None):
    """Build a frozen model configuration with a known official billing origin."""
    return SimpleNamespace(provider_key="aliyun_bailian", model_name="happyhorse-1.1-i2v",
        category="video", model_id="m", id="revision", model_params={"generation_defaults": defaults or {}},
        endpoint_config={"base_url": endpoint})


@pytest.mark.asyncio
async def test_low_cost_default_and_explicit_resolution_reach_request():
    """A missing setting chooses 480P and its estimate; explicit 1080P is preserved."""
    operation, estimate = await freeze_specification(None, revision(), VideoGenerationOperationInput(ratio="16:9", seconds=10), references=1)
    assert operation.resolution == "480P" and estimate["amount"] == "4.50"
    request = _build_video_body(VideoGenerationInput.model_construct(model="happyhorse-1.1-i2v", prompt="test",
        ratio="16:9", seconds=10, resolution=operation.resolution,
        frame_references=SimpleNamespace(first_frame="https://example.test/frame.png", last_frame=None, key_frames=[])))
    assert request["parameters"]["resolution"] == "480P" and request["parameters"]["duration"] == 10
    high, estimate = await freeze_specification(None, revision(), VideoGenerationOperationInput(ratio="16:9", seconds=10, resolution="1080P"), references=1)
    assert high.resolution == "1080P" and estimate["amount"] == "12.0"


def test_unknown_gateway_never_inherits_official_account_price():
    """A custom gateway or package endpoint cannot be quoted as official on-demand billing."""
    assert specification(revision("https://gateway.example/v1"))["price"] is None
    assert specification(revision("https://dashscope.aliyuncs.com/api/plan/v3"))["price"] is None
    assert specification(revision(defaults={"resolution": "720P"}))["default"] == "720P"


@pytest.mark.asyncio
async def test_unsupported_resolution_is_rejected_instead_of_ignored():
    """An invalid explicit tier cannot silently degrade or start a paid request."""
    with pytest.raises(HTTPException):
        await freeze_specification(None, revision(), VideoGenerationOperationInput(ratio="16:9", resolution="4K"), references=1)
