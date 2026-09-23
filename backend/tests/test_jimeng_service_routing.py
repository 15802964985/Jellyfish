"""Official scene matrix regressions; no network inference or customer media."""
import json
from types import SimpleNamespace as NS
import httpx
import pytest
from app.core.contracts.provider import ProviderConfig
from app.core.contracts.generation import ImageGenerationOperationInput, VideoGenerationOperationInput
from app.core.contracts.media import ImageMediaInput, VideoMediaInput
from app.core.integrations import jimeng_media as jm
from app.core.integrations.model_catalog import builtin_provider_catalog
from app.services.generation.specifications import specification
from app.services.generation.domestic_preflight import validate_domestic_submission
from tests.test_domestic_provider_media import png, image_input, video_input


def revision(category, name):
    """Use an immutable configuration-shaped fixture rather than the production database."""
    return NS(provider_key="jimeng", model_name=name, category=category, model_id="model", id="revision",
        model_params={}, endpoint_config={"base_url":"https://visual.volcengineapi.com"})


def test_family_catalog_and_reference_tiers():
    """The selectable service differs from the request key and its tiers follow reference mode."""
    rows = builtin_provider_catalog("jimeng").models
    assert [m.name for m in rows if m.category == "image"] == [jm.IMAGE_V3, jm.IMAGE_V4]
    assert [m.name for m in rows if m.category == "video"] == [jm.VIDEO_V3]
    r = revision("image", jm.IMAGE_V3)
    assert len(specification(r, references=0)["options"]) == 2
    assert len(specification(r, references=1)["options"]) == 1
    assert specification(revision("video", jm.VIDEO_V3))["default"] == "720P"


@pytest.mark.asyncio
@pytest.mark.parametrize("mode,tier,key", [("text","720P","jimeng_t2v_v30"),
    ("first","720P","jimeng_i2v_first_v30"), ("first_last","720P","jimeng_i2v_first_tail_v30"),
    ("text","1080P","jimeng_t2v_v30_1080p"), ("first","1080P","jimeng_i2v_first_v30_1080"),
    ("first_last","1080P","jimeng_i2v_first_tail_v30_1080")])
async def test_scene_payload_and_polling_identity(mode,tier,key,monkeypatch):
    """Assert signed submission and polling both use the resolved scene, preserving frame order."""
    frames = NS(first_frame=png() if mode != "text" else None,
        last_frame=png() if mode == "first_last" else None,key_frames=[])
    inp = video_input(jm.VIDEO_V3, resolution=tier, frame_references=frames,seconds=10)
    calls=[]
    def handle(request):
        """Capture fake requests without sending them to a provider."""
        body=json.loads(request.content);calls.append(body)
        assert body["req_key"] == key
        if "SubmitTask" in str(request.url):
            assert body["frames"] == 241
            if mode == "text":
                assert body["aspect_ratio"] == "16:9" and "binary_data_base64" not in body
            else:
                assert len(body["binary_data_base64"]) == (2 if mode == "first_last" else 1)
                assert "aspect_ratio" not in body
            data={"task_id":"fake"}
        else:
            assert body["task_id"] == "fake"
            data={"status":"done","video_url":"https://example.com/test.mp4"}
        return httpx.Response(200,json={"code":10000,"data":data})
    monkeypatch.setattr(jm,"create_http_client",lambda **kwargs:httpx.AsyncClient(transport=httpx.MockTransport(handle)))
    cfg=ProviderConfig(provider="jimeng",api_key="test",api_secret="test",base_url="https://visual.volcengineapi.com")
    result=await jm.JimengVideoApiAdapter().generate(cfg=cfg,inp=inp,timeout_s=1)
    assert result.provider_task_id == "fake" and len(calls)==2


def test_image_v3_dynamic_body_and_no_upgrade():
    """Adding a local image selects i2i3.0 and never changes the selected service generation."""
    plain=jm.image_body(image_input(jm.IMAGE_V3))
    assert plain["req_key"]=="jimeng_t2i_v30" and plain["use_pre_llm"] is False
    ref=NS(image_url=png())
    body=jm.image_body(image_input(jm.IMAGE_V3,images=[ref]))
    assert body["req_key"]=="jimeng_i2i_v30" and len(body["binary_data_base64"])==1
    assert "force_single" not in body
    with pytest.raises(ValueError,match="1张"):
        jm.image_body(image_input(jm.IMAGE_V3,images=[ref,ref]))
    with pytest.raises(ValueError,match="档位"):
        jm.image_body(image_input(jm.IMAGE_V3,images=[ref],resolution_profile="high"))
    assert jm.image_body(image_input(jm.IMAGE_V4))["req_key"]=="jimeng_t2i_v40"
    assert jm.image_body(image_input(jm.IMAGE_MODEL))["req_key"]=="t2i_v40_jimeng"


def test_invalid_scene_does_not_submit():
    """Reject tail-only, unknown versions and unsupported resolutions before transport."""
    with pytest.raises(ValueError,match="仅尾帧"):
        jm.video_route(jm.VIDEO_V3,first=False,last=True)
    with pytest.raises(ValueError):
        jm.video_route(jm.VIDEO_V3,first=False,last=False,resolution="4K")
    with pytest.raises(ValueError):
        jm.video_route("unknown",first=False,last=False)
    validate_domestic_submission(provider="jimeng",model=jm.VIDEO_V3,
        operation=VideoGenerationOperationInput(ratio="16:9",resolution="1080P",seconds=5),media=VideoMediaInput())
