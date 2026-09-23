"""Isolated persistence semantics: frame separation, explicit empty and invalid files."""
import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from app.models import Base, FileItem
from app.services.studio.frame_reference_selection import merge_frame_references


@pytest.mark.asyncio
async def test_order_empty_and_frame_isolation():
    """Changing one frame never replaces others; explicit zero references survives round trips."""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    async with async_sessionmaker(engine)() as db:
        db.add_all([FileItem(id=fid, type="image", name=fid, storage_key=fid) for fid in ["a", "b"]])
        await db.flush()
        saved = await merge_frame_references(db, {"first": ["a"], "last": ["b"]}, {"key": ["b", "a", "b"]})
        assert saved == {"first": ["a"], "last": ["b"], "key": ["b", "a"]}
        saved = await merge_frame_references(db, saved, {"key": []})
        assert saved["key"] == [] and saved["first"] == ["a"]
        with pytest.raises(HTTPException):
            await merge_frame_references(db, saved, {"first": ["missing"]})
        assert saved["first"] == ["a"]
        with pytest.raises(HTTPException):
            await merge_frame_references(db, saved, None)
    await engine.dispose()
