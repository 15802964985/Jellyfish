"""No paid calls: validate field-level candidates, exact price units and default persistence."""
from types import SimpleNamespace
import pytest
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from app.models import Base
from app.models.llm import Model, Provider, ModelConfigRevision
from app.core.contracts.model_governance import GenerationDefaultsUpdate
from app.services.generation.specifications import save_generation_default, get_specification
from app.services.generation.seedance_pricing import seedance_price
from app.services.llm.contract_rules import parse_contract_rule, WAN_API
from app.services.llm.contract_validation import validate_candidate

WAN = """/services/aigc/multimodal-generation/generation
size string 模型：wan2.7-image-pro
文生图（无图片输入，非组图生成）：支持 1K、2K、4K。
其他场景：支持 1K、2K。
文生图：总像素在 [768 768, 4096 4096]
其他场景：总像素在 [768 768, 2048 2048]
模型：wan2.7-image 关闭组图模式时取值范围 1-4"""


def test_wan_requires_model_scoped_fields_and_candidate_matrix():
    """Other models' tier mentions cannot establish a compatible Wan contract."""
    rule = parse_contract_rule(WAN_API, WAN)
    assert rule["max_outputs"] == 4
    assert validate_candidate(rule, None)["status"] == "compatible"
    narrowed = parse_contract_rule(WAN_API, WAN.replace("支持 1K、2K。", "支持 1K。"))
    report = validate_candidate(narrowed, rule)
    assert report["status"] == "compatible" and len(report["checks"]) == 10
    assert report["field_changes"][0]["field"] == "reference_profiles"
    assert parse_contract_rule(WAN_API, WAN.replace("支持 1K、2K、4K", "支持 1K、2K、8K")) is None
    assert parse_contract_rule(WAN_API, WAN.replace("2048 2048", "4096 4096")) is None
    assert parse_contract_rule(WAN_API, "wan2.7-image-pro 1K 2K 4K 2048 4096 size enable_sequential") is None
    assert validate_candidate({**rule,"reference_profiles":["high"]}, rule)["status"] == "requires_adapter_review"


def test_seedance_pricing_preserves_audio_and_currency():
    """Five seconds at official 864x496/24fps is 50,220 estimated tokens; AFP is never added to CNY."""
    from decimal import Decimal
    cny = seedance_price("16:9")
    afp = seedance_price("16:9", afp=True)
    assert Decimal(cny["rates"]["480p"]) * 5 == Decimal("0.40176")
    assert Decimal(cny["audio_rates"]["480p"]) * 5 == Decimal("0.80352")
    assert Decimal(afp["rates"]["480p"]) * 5 == Decimal("180.792")
    assert afp["currency"] == "AFP" and cny["currency"] == "CNY"
    assert seedance_price("adaptive") is None


@pytest.mark.asyncio
async def test_audio_default_survives_session_reopen_without_provider_call():
    """Saving audio and resolution issues one revision, preserves unrelated params and persists across sessions."""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as db:
        db.add(Provider(id="p",name="Volc",adapter_key="volcengine",base_url="https://ark.cn-beijing.volces.com/api/plan/v3"))
        await db.flush()
        db.add(Model(id="m",name="doubao-seedance-1.5-pro",category="video",provider_id="p",params={"keep":42}))
        await db.flush()
        db.add(ModelConfigRevision(id="r",model_id="m",version_id=1,model_name="doubao-seedance-1.5-pro",
            category="video",provider_key="volcengine",model_params={"keep":42},endpoint_config={}))
        await db.flush()
        (await db.get(Model,"m")).current_revision_id="r"
        await db.commit()
        saved = await save_generation_default(db,"m",GenerationDefaultsUpdate(
            expected_revision_id="r",field="resolution",value="720p",generate_audio=True))
    async with maker() as db:
        spec = await get_specification(db,model_id="m",category="video",ratio="16:9",references=0)
        assert spec["revision_id"] == saved["revision_id"] != "r"
        assert spec["default"] == "720p" and spec["generate_audio"]["default"] is True
        assert (await db.get(Model,"m")).params["keep"] == 42
    await engine.dispose()


@pytest.mark.asyncio
async def test_frame_save_reopens_from_database_and_preserves_other_frames():
    """Use the production update service and a new DB session; explicit empty is not a missing preference."""
    from app.models import FileItem
    from app.models.studio_shots import ShotDetail
    from app.schemas.studio.shots import ShotDetailUpdate
    from app.services.studio.shot_details import update
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as db:
        db.add_all([FileItem(id=fid,type="image",name=fid,storage_key=fid) for fid in ("a","b")])
        db.add(ShotDetail(id="shot",camera_shot="MS",angle="EYE_LEVEL",movement="STATIC",
            frame_reference_selections={"first":["a"],"key":["a"],"last":[]}))
        await db.commit()
        await update(db,shot_id="shot",body=ShotDetailUpdate(frame_reference_selections={"key":["b","a"]}))
        await db.commit()
    async with maker() as db:
        row = await db.get(ShotDetail,"shot")
        assert row.frame_reference_selections == {"first":["a"],"key":["b","a"],"last":[]}
        await update(db,shot_id="shot",body=ShotDetailUpdate(frame_reference_selections={"key":[]}))
        await db.commit()
    async with maker() as db:
        assert (await db.get(ShotDetail,"shot")).frame_reference_selections == {"first":["a"],"key":[],"last":[]}
    await engine.dispose()

@pytest.mark.asyncio
async def test_price_only_rule_can_resume_without_api_contract():
    """Pricing pages have no wire contract and must not be blocked by the protocol candidate gate."""
    from app.models.model_governance import ModelGovernanceRecord
    from app.core.contracts.model_governance import ModelRuleAction
    from app.services.llm.model_governance import change_rule_version
    from app.services.generation.specifications import WAN_PRICE
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with async_sessionmaker(engine,expire_on_commit=False)() as db:
        db.add(ModelGovernanceRecord(id="price",data={"source":WAN_PRICE,"sha256":"a"*64,"last_check":"2026-09-09",
            "rules_pinned":True,"text":"wan2.7-image-pro 模型价格 华北2（北京） 价格（元） 图片生成 0.5 每张"}))
        await db.commit()
        result = await change_rule_version(db,"price",ModelRuleAction(action="resume",expected_sha256="a"*64))
        assert result["rules_pinned"] is False
        assert (await db.get(ModelGovernanceRecord,"price")).data["price_rule"]["rates"]["standard"] == "0.5"
    await engine.dispose()
