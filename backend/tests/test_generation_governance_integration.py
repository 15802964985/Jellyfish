"""Isolated cross-service tests for model switching, audit durability, synchronization and rollback."""
from hashlib import sha256
from types import SimpleNamespace
import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from app.models import Base
from app.models.llm import Model, Provider, ModelConfigRevision, ModelSettings
from app.models.task import GenerationTask
from app.models.generation_calls import GenerationCall
from app.models.model_governance import ModelGovernanceRecord
from app.core.contracts.model_governance import GenerationDefaultsUpdate, ModelRuleAction
from app.services.generation.specifications import get_specification, save_generation_default
from app.services.llm.contract_rules import parse_contract_rule, HAPPY_API
from app.services.llm import model_governance as governance
from app.services.generation import call_audit

CONTRACT_TEXT = """happyhorse-1.1-i2v /api/v1/services/aigc/video-generation/video-synthesis
first_frame X-DashScope-Async task_status resolution string 480P 720P 1080P duration integer [3, 15]"""


def test_contract_parser_rejects_unimplemented_protocol_and_range():
    """Accept only explicit parameter blocks within the tested request protocol and range."""
    assert parse_contract_rule(HAPPY_API, CONTRACT_TEXT)["resolutions"] == ["480P", "720P", "1080P"]
    assert parse_contract_rule(HAPPY_API, CONTRACT_TEXT.replace("1080P", "2160P")) is None
    assert parse_contract_rule(HAPPY_API, CONTRACT_TEXT.replace("[3, 15]", "[2, 30]")) is None
    assert parse_contract_rule(HAPPY_API, CONTRACT_TEXT.replace("first_frame", "input_clip")) is None


@pytest.mark.asyncio
async def test_default_model_switch_and_saved_default_issue_new_revision():
    """Resolve the current model every time; changing one model default preserves other parameters."""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as db:
        db.add_all([Provider(id="ali", name="Aliyun", adapter_key="aliyun_bailian", base_url="https://dashscope.aliyuncs.com"),
            Provider(id="mini", name="MiniMax", adapter_key="minimax", base_url="https://api.minimaxi.com")])
        await db.flush()
        for mid, pid, name, key in [("a", "ali", "happyhorse-1.1-i2v", "aliyun_bailian"), ("b", "mini", "MiniMax-Hailuo-02", "minimax")]:
            model = Model(id=mid, name=name, category="video", provider_id=pid, params={"preserve": "yes"})
            db.add(model)
            await db.flush()
            db.add(ModelConfigRevision(id=mid+"-rev", model_id=mid, version_id=1, model_name=name,
                category="video", provider_key=key, model_params=model.params, endpoint_config={"base_url":"https://dashscope.aliyuncs.com"}))
            await db.flush()
            model.current_revision_id = mid+"-rev"
        settings = ModelSettings(id=1, default_video_model_id="a")
        db.add(settings)
        await db.commit()
        args = dict(model_id=None, category="video", ratio="16:9", references=1)
        first = await get_specification(db, **args)
        assert first["model_id"] == "a" and first["default"] == "480P"
        settings.default_video_model_id = "b"
        await db.flush()
        switched = await get_specification(db, **args)
        assert switched["model_id"] == "b" and [item["value"] for item in switched["options"]] == ["768P"]
        saved = await save_generation_default(db, "a", GenerationDefaultsUpdate(expected_revision_id="a-rev", field="resolution", value="720P"))
        assert saved["revision_id"] != "a-rev"
        assert (await db.get(Model, "a")).params["preserve"] == "yes"
        assert (await get_specification(db, **{**args, "model_id":"a"}))["default"] == "720P"
        with pytest.raises(HTTPException) as error:
            await save_generation_default(db, "a", GenerationDefaultsUpdate(expected_revision_id="a-rev", field="resolution", value="480P"))
        assert error.value.status_code == 409
    await engine.dispose()


@pytest.mark.asyncio
async def test_audit_writes_survive_unrelated_task_transaction_rollback(monkeypatch):
    """Provider evidence is committed independently and historical tasks remain explicitly unrecorded."""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    monkeypatch.setattr(call_audit, "async_session_maker", maker)
    async with maker() as db:
        db.add(GenerationTask(id="t", mode="async_polling", payload={"call_identity":{"model_name":"kept","provider_name":"Provider"}}, task_kind="video_generation"))
        await db.commit()
    sink = call_audit.make_call_sink("t")
    await sink("attempt", {"method":"POST", "endpoint":"https://example.test/generate", "request":{"prompt":"frozen"}})
    async with maker() as db:
        await db.rollback()
        assert (await db.get(GenerationCall, "attempt")).state == "sending"
        details = await call_audit.get_call_details(db, "t")
        assert details["identity"]["model_name"] == "kept"
        assert details["calls"][0]["request"]["prompt"] == "frozen"
    await sink("attempt", {"state":"received", "status_code":200, "response":{"request_id":"request"}})
    await engine.dispose()


@pytest.mark.asyncio
async def test_sync_retains_evidence_and_rollback_pins_rules(monkeypatch):
    """Offline source changes produce versions; failures and later scans cannot undo a pinned rollback."""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    monkeypatch.setattr(governance, "async_session_maker", maker)
    async def scope(_db):
        """Restrict this test to one exact model and one official source."""
        return [{"provider":"test", "category":"video", "model":"happyhorse-1.1-i2v", "configured_ids":["a"], "priority":"configured"}]
    monkeypatch.setattr(governance, "detection_scope", scope)
    monkeypatch.setattr(governance, "list_registered_providers", lambda:[SimpleNamespace(key="test", official_documentation=HAPPY_API)])
    current = {"text":CONTRACT_TEXT, "status":"fetched"}
    async def fetch(_url):
        """Return controlled official evidence without a network connection."""
        return SimpleNamespace(status=current["status"], text=current["text"], content_sha256=sha256(current["text"].encode()).hexdigest(),
            fetched_at="2026-09-09T00:00:00+00:00", message="test")
    monkeypatch.setattr(governance, "fetch_official_document", fetch)
    await governance.sync_official_sources(force=True)
    first_hash = sha256(CONTRACT_TEXT.encode()).hexdigest()
    current["text"] = CONTRACT_TEXT.replace("480P ", "")
    await governance.sync_official_sources(force=True)
    source_id = sha256(HAPPY_API.encode()).hexdigest()
    async with maker() as db:
        row = await db.get(ModelGovernanceRecord, source_id)
        assert row.data["contract_rule"]["resolutions"] == ["720P","1080P"]
        assert len(row.data["history"]) == 1
        await governance.change_rule_version(db, source_id, ModelRuleAction(action="rollback", expected_sha256=row.data["sha256"], target_sha256=first_hash))
    await governance.sync_official_sources(force=True)
    current["status"] = "unavailable"
    await governance.sync_official_sources(force=True)
    async with maker() as db:
        row = await db.get(ModelGovernanceRecord, source_id)
        assert row.data["rules_pinned"] and row.data["contract_rule"]["resolutions"][0] == "480P"
        assert row.data["fetch_status"] == "unavailable" and row.data["text"] == current["text"]
    await engine.dispose()
