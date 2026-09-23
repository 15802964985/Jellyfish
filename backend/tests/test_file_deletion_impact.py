"""文件删除保护使用真实隔离数据库；对象存储仅使用 Mock，不接触业务数据。"""
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.models import Base, FileItem, GenerationTask, TimelineClip
from app.services.studio.file_deletion import get_file_delete_impact, contains_file_reference
from app.services.studio.files import delete_file


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["timeline", "task_json", "direct_fk"])
async def test_references_block_storage_deletion(kind, monkeypatch):
    """逻辑引用、历史JSON、CASCADE文件使用关系均须先于存储删除阻断。"""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    storage_delete = AsyncMock()
    monkeypatch.setattr("app.services.studio.files.storage.delete_file", storage_delete)
    async with async_sessionmaker(engine, expire_on_commit=False)() as db:
        db.add(FileItem(id="protected", type="video", name="原片", storage_key="files/protected.mp4"))
        if kind == "timeline":
            db.add(TimelineClip(id="clip", type="video", source_id="protected", label="成片片段"))
        elif kind == "task_json":
            db.add(GenerationTask(id="task", mode="async_polling", payload={"media": {"source": {"file_id": "protected"}}}))
        else:
            from app.models import AssetFileLink
            db.add(AssetFileLink(entity_type="actor", entity_id="actor-id", file_id="protected"))
        await db.commit()
        impact = await get_file_delete_impact(db, file_id="protected")
        assert not impact.can_delete and impact.reference_count > 0
        assert impact.groups[0].items
        with pytest.raises(HTTPException) as exc:
            await delete_file(db, file_id="protected")
        assert exc.value.status_code == 409
        storage_delete.assert_not_called()
        assert await db.get(FileItem, "protected") is not None
    await engine.dispose()


@pytest.mark.asyncio
@pytest.mark.parametrize("fail_storage", [False, True])
async def test_unreferenced_delete_and_storage_failure(fail_storage, monkeypatch):
    """无引用文件可删；原对象删除失败时事务回滚保留文件记录。"""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    storage_delete = AsyncMock(side_effect=RuntimeError("unavailable") if fail_storage else None)
    monkeypatch.setattr("app.services.studio.files.storage.delete_file", storage_delete)
    async with async_sessionmaker(engine, expire_on_commit=False)() as db:
        db.add(FileItem(id="free", type="image", name="未关联", storage_key="files/free.png"))
        await db.commit()
        assert (await get_file_delete_impact(db, file_id="free")).can_delete
        if fail_storage:
            with pytest.raises(HTTPException) as exc:
                await delete_file(db, file_id="free")
            assert exc.value.status_code == 502
            await db.rollback()
        else:
            await delete_file(db, file_id="free")
            await db.commit()
        assert (await db.scalar(select(FileItem).where(FileItem.id == "free")) is not None) == fail_storage
        assert storage_delete.call_args_list[0].kwargs["key"] == "files/free.png"
    await engine.dispose()


def test_reference_match_is_exact():
    """同前缀ID不能误判，旧下载URL仍识别，文字中提及ID不算结构化引用。"""
    assert contains_file_reference({"files": ["target"]}, "target")
    assert contains_file_reference({"url": "/api/v1/studio/files/target/download?x=1"}, "target")
    assert not contains_file_reference({"file_id": "target-other"}, "target")
    assert not contains_file_reference({"prompt": "draw target please"}, "target")


@pytest.mark.asyncio
async def test_delete_rechecks_new_reference_after_preview(monkeypatch):
    """预览可删之后新增关联，实际删除必须拒绝；不会调用对象存储。"""
    from app.models import AssetFileLink
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    storage_delete = AsyncMock()
    monkeypatch.setattr("app.services.studio.files.storage.delete_file", storage_delete)
    async with async_sessionmaker(engine, expire_on_commit=False)() as db:
        db.add(FileItem(id="late", type="image", name="照片", storage_key="files/late.png"))
        await db.commit()
        assert (await get_file_delete_impact(db, file_id="late")).can_delete
        db.add(AssetFileLink(file_id="late", entity_type="actor", entity_id="actor"))
        await db.commit()
        with pytest.raises(HTTPException) as exc:
            await delete_file(db, file_id="late")
        assert exc.value.status_code == 409
        storage_delete.assert_not_called()
    await engine.dispose()


@pytest.mark.asyncio
async def test_shared_storage_and_bounded_reference_details():
    """共享存储对象也受保护；关联明细截断不影响真实计数。"""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    async with async_sessionmaker(engine, expire_on_commit=False)() as db:
        db.add_all([FileItem(id=value, type="video", name=value, storage_key="shared.mp4") for value in ("a", "b")])
        db.add_all([TimelineClip(id=f"clip-{i}", type="video", source_id="a", label=f"片段{i}") for i in range(25)])
        await db.commit()
        impact = await get_file_delete_impact(db, file_id="a")
        assert not impact.can_delete
        timeline = next(group for group in impact.groups if group.kind == "timeline_clips.source_id")
        assert timeline.count == 25 and len(timeline.items) == 20
        assert any(group.kind == "shared_storage" for group in impact.groups)
    await engine.dispose()
