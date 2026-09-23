"""Regression coverage for provider/source/price identities; no vendor calls."""
import pytest
from app.services.llm.official_sources import model_sources
from app.services.llm.contract_rules import effective_rule
from app.services.llm.model_governance import parse_official_prices
from app.services.generation.specifications import WAN_PRICE, HAPPY_PRICE
from app.services.llm.contract_validation import validate_candidate
from app.core.integrations.vidu.video_capabilities import resolve_vidu_video_capability


def test_model_prices_never_leak_between_categories():
    """A provider-wide root or plan document cannot supply another model's price."""
    assert not any(s["kind"] == "price" for s in model_sources("aliyun_bailian", "text", "qwen3.8-max"))
    assert [s["url"] for s in model_sources("aliyun_bailian", "image", "wan2.7-image-pro") if s["kind"] == "price"] == [WAN_PRICE]
    assert len([s for s in model_sources("jimeng", "video", "即梦AI-视频生成3.0") if s["scope"] == "model"]) == 6


def test_stale_and_failed_evidence_cannot_apply_rules():
    """Hash changes, missing origin or failed reads invalidate automatic application; explicit pins are versioned."""
    data=dict(source=WAN_PRICE,sha256="new",fetch_status="fetched",price_rule=dict(source=WAN_PRICE,source_sha256="old"))
    assert effective_rule(data,"price_rule") is None
    data["price_rule"]["source_sha256"]="new"
    assert effective_rule(data,"price_rule")
    data["fetch_status"]="unavailable"
    assert effective_rule(data,"price_rule") is None
    data.update(rules_pinned=True,pinned_version="new")
    assert effective_rule(data,"price_rule")
    data["price_rule"]["source"]="https://example.test"
    assert effective_rule(data,"price_rule") is None


def test_currency_and_duplicate_price_rows_require_review():
    """Never infer CNY from a foreign-currency or ambiguous updated table."""
    text="wan2.7-image-pro 模型价格 华北2（北京） 价格（元） 图片生成 0.5 每张"
    assert parse_official_prices(WAN_PRICE,text)
    assert parse_official_prices(WAN_PRICE,text.replace("元","美元")) is None
    assert parse_official_prices(WAN_PRICE,text+" 图片生成 0.9 每张") is None
    assert validate_candidate(dict(model="unknown",source=WAN_PRICE,profiles=["standard"]),None)["status"] != "compatible"


@pytest.mark.parametrize("model,text,first,subject",[
    ("viduq2",True,False,True),("viduq2-pro",False,True,True),
    ("viduq2-turbo",False,True,False),("viduq1-classic",False,True,False),
    ("viduq3-pro",True,True,False)])
def test_vidu_exact_model_modes(model,text,first,subject):
    """Official model-map distinctions must reach the shared UI/runtime capability contract."""
    cap=resolve_vidu_video_capability(model)
    assert (cap.supports_text_to_video,cap.supports_first_frame,cap.supports_subject_image_reference)==(text,first,subject)


@pytest.mark.parametrize("provider,category,model", [
    ("hunyuan", "image", "hy-image-v3"),
    ("zhipu", "video", "cogvideox-3"),
    ("minimax", "video", "MiniMax-Hailuo-02"),
])
def test_attachment_exact_model_evidence_does_not_certify_unknown_model(provider, category, model):
    """Only API-documented model tokens receive model-scoped evidence."""
    assert any(s["scope"] == "model" for s in model_sources(provider, category, model))
    assert not any(s["scope"] == "model" for s in model_sources(provider, category, "unknown-next-version"))


def test_vidu_pro_short_generation_and_reference_total_limit():
    """Validate a documented short request and reject eight references spread over valid groups."""
    from app.core.contracts.video_generation import VideoGenerationInput, VideoSubjectReference
    from app.core.contracts.media import MediaReference
    from app.core.integrations.video_capabilities import validate_video_options
    validate_video_options(provider="vidu", model="viduq3-pro", input_=VideoGenerationInput(
        model="viduq3-pro", prompt="a shot", ratio="16:9", seconds=1, resolution="540p"))
    subjects = [VideoSubjectReference(name=str(i), media=[MediaReference(file_id=f"{i}-{j}",
        media_kind="image", ordinal=j) for j in range(count)]) for i, count in enumerate([3,3,2])]
    with pytest.raises(ValueError):
        validate_video_options(provider="vidu", model="viduq3-turbo", input_=VideoGenerationInput(
            model="viduq3-turbo", prompt="a shot", ratio="16:9", seconds=5, subject_references=subjects))
