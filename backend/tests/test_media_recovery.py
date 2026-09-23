"""Recovery tests use isolated SQLite, in-memory storage and HTTP mocks, never paid calls."""
import json
import pytest
import pytest_asyncio
import httpx
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from app.models import Base
from app.models.task import GenerationTask
from app.services.generation import recovery as module
from app.core.integrations.traced_http import create_http_client
from app.core.contracts.generation_recovery import media_recovery

@pytest_asyncio.fixture
async def environment(monkeypatch):
    """Keep private response objects outside SQL and isolate all task state."""
    engine=create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn: await conn.run_sync(Base.metadata.create_all)
    maker=async_sessionmaker(engine,expire_on_commit=False)
    monkeypatch.setattr(module,"async_session_maker",maker)
    blobs={}
    async def upload(*,key,data,**kwargs):
        """Store test response bytes without a real object service."""
        blobs[key]=data
        from types import SimpleNamespace
        return SimpleNamespace(url="https://storage.example/"+key)
    async def download(*,key):
        """Return exactly the staged provider result."""
        return blobs[key]
    async def delete(*,key):
        """Delete only owned temporary test keys."""
        del blobs[key]
    monkeypatch.setattr(module.storage,"upload_file",upload)
    monkeypatch.setattr(module.storage,"download_file",download)
    monkeypatch.setattr(module.storage,"delete_file",delete)
    async with maker() as db:
        db.add(GenerationTask(id="task",mode="async_polling",task_kind="video_generation",status="running",payload={}))
        await db.commit()
    yield maker,blobs
    await engine.dispose()

@pytest.mark.asyncio
async def test_resume_replays_receipt_without_second_post(environment):
    """A restart reuses the original task ID while GET polling still reaches the provider."""
    calls=[]
    def respond(request):
        """Count actual network operations independently of locally replayed replies."""
        calls.append(request.method)
        return httpx.Response(200,json={"task_id":"remote-1"})
    for _ in range(2):
        async with module.recovery_execution("task") as owned:
            assert owned
            async with create_http_client(transport=httpx.MockTransport(respond)) as client:
                assert (await client.post("https://api.example/v1/video_generation",json={"prompt":"same"})).json()["task_id"]=="remote-1"
                await client.get("https://api.example/v1/query")
    assert calls==["POST","GET","GET"]

@pytest.mark.asyncio
async def test_unknown_submit_blocks_repeated_charge(environment):
    """Connection loss after send is not evidence that the provider rejected the request."""
    calls=[]
    def fail(request):
        """Simulate an ambiguous transport outcome."""
        calls.append(request.method)
        raise httpx.ReadTimeout("lost reply")
    async with module.recovery_execution("task"):
        async with create_http_client(transport=httpx.MockTransport(fail)) as client:
            with pytest.raises(httpx.ReadTimeout): await client.post("https://api.example/generate",json={})
    async with module.recovery_execution("task"):
        async with create_http_client(transport=httpx.MockTransport(fail)) as client:
            with pytest.raises(RuntimeError,match="不确定"): await client.post("https://api.example/generate",json={})
    assert calls==["POST"]

@pytest.mark.asyncio
async def test_archive_retry_preserves_result_and_cleans_after_success(environment):
    """Base64 results survive a failed archive; committed success removes only temporary copies."""
    maker,blobs=environment
    async with module.recovery_execution("task"):
        await media_recovery.get().save_result({"images":[{"b64_json":"test"}]})
    assert blobs
    async with module.recovery_execution("task"):
        assert (await media_recovery.get().load_result())["images"][0]["b64_json"]=="test"
        async with maker() as db:
            task=await db.get(GenerationTask,"task");task.status="succeeded";await db.commit()
    assert not blobs
    async with module.recovery_execution("task") as owned: assert not owned

@pytest.mark.asyncio
async def test_active_lease_rejects_duplicate_worker(environment):
    """Concurrent queue deliveries cannot submit the same generation twice."""
    async with module.recovery_execution("task") as first:
        assert first
        async with module.recovery_execution("task") as duplicate: assert not duplicate


@pytest.mark.asyncio
async def test_legacy_attempt_never_becomes_new_submission(environment):
    """Old audit rows without raw receipts block new network submissions after upgrade."""
    maker, _ = environment
    async with maker() as db:
        db.add(module.GenerationCall(id="old", task_id="task", method="POST", endpoint="https://example/generate", request={}))
        await db.commit()
    with pytest.raises(RuntimeError, match="历史任务"):
        async with module.recovery_execution("task"):
            pytest.fail("Unrecoverable legacy task must not execute")


@pytest.mark.asyncio
async def test_changed_input_never_resubmits(environment):
    """Changing a prompt cannot convert recovery into another generation purchase."""
    calls=[]
    def respond(request):
        """Return a durable successful receipt."""
        calls.append(request.method)
        return httpx.Response(200,json={"task_id":"original"})
    for prompt in ["original", "changed"]:
        async with module.recovery_execution("task"):
            async with create_http_client(transport=httpx.MockTransport(respond)) as client:
                if prompt == "original":
                    await client.post("https://example/generate", json={"prompt":prompt})
                else:
                    with pytest.raises(RuntimeError, match="不一致"):
                        await client.post("https://example/generate", json={"prompt":prompt})
    assert calls == ["POST"]


@pytest.mark.asyncio
async def test_jimeng_polling_posts_are_not_replayed(environment):
    """Visual API query actions must return fresh progress despite using POST."""
    calls=[]
    def respond(request):
        """Observe every polling operation."""
        calls.append(request.url.params["Action"])
        return httpx.Response(200,json={"data":{"task_id":"original"}})
    for _ in range(2):
        async with module.recovery_execution("task"):
            async with create_http_client(transport=httpx.MockTransport(respond)) as client:
                await client.post("https://visual.volcengineapi.com?Action=CVSync2AsyncSubmitTask",json={})
                await client.post("https://visual.volcengineapi.com?Action=CVSync2AsyncGetResult",json={"task_id":"original"})
    assert calls == ["CVSync2AsyncSubmitTask", "CVSync2AsyncGetResult", "CVSync2AsyncGetResult"]


@pytest.mark.asyncio
async def test_archive_rollback_reuses_bytes_and_file_identity(environment):
    """A successful object upload survives SQL rollback and an expired original download URL."""
    maker, blobs = environment
    from app.utils.files import create_file_from_url_or_b64
    async with module.recovery_execution("task"):
        async with maker() as db:
            file = await create_file_from_url_or_b64(db,b64_data="YWJj",recovery_ordinal=0)
            original_id, original_key = file.id, file.storage_key
            await db.rollback()
    assert blobs[original_key] == b"abc"
    async with module.recovery_execution("task"):
        async with maker() as db:
            # No network is reachable at this URL; a cached archive must bypass download entirely.
            restored = await create_file_from_url_or_b64(db,url="https://expired.invalid/image",recovery_ordinal=0)
            assert restored.id == original_id and restored.storage_key == original_key
            await db.commit()
    assert list(blobs) == [original_key]


@pytest.mark.asyncio
async def test_only_validated_receipts_enable_recovery(environment):
    """HTTP 200 is insufficient; adapter validation must precede query recovery."""
    from app.core.contracts.generation_recovery import confirm_media_receipt
    maker, _ = environment
    async with module.recovery_execution("task"):
        async with create_http_client(transport=httpx.MockTransport(
            lambda request: httpx.Response(200, json={"task_id": "remote"}))) as client:
            await client.post("https://example/generate", json={})
    async with maker() as db:
        assert not (await module.recovery_status(db, "task"))["can_resume"]
    async with module.recovery_execution("task"):
        async with create_http_client(transport=httpx.MockTransport(
            lambda request: pytest.fail("Must replay original receipt"))) as client:
            await client.post("https://example/generate", json={})
            await confirm_media_receipt("remote")
    async with maker() as db:
        assert (await module.recovery_status(db, "task"))["can_resume"]


@pytest.mark.asyncio
async def test_finalization_failure_does_not_overwrite_success(environment, monkeypatch):
    """A checkpoint cleanup error must not escape into executor failure handling."""
    maker, _ = environment
    async def fail(self):
        """Simulate unavailable SQL during finalization after committed business success."""
        raise RuntimeError("temporary database outage")
    monkeypatch.setattr(module.MediaRecovery, "finish", fail)
    async with module.recovery_execution("task"):
        async with maker() as db:
            task = await db.get(GenerationTask, "task")
            task.status = "succeeded"
            await db.commit()
    async with maker() as db:
        assert (await db.get(GenerationTask, "task")).status == "succeeded"
