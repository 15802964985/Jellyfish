"""Persistence and atomic commit tests for script imports."""

from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.db import Base
from app.models.studio import Chapter, FileItem, Project, ScriptImport
from app.services.studio.script_imports import commit_script_import, create_script_import


@pytest.mark.asyncio
async def test_import_is_idempotent_and_commits_selected_chapters_once() -> None:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(
            lambda sync_connection: Base.metadata.create_all(
                sync_connection,
                tables=[Project.__table__, FileItem.__table__, ScriptImport.__table__, Chapter.__table__],
            )
        )
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    script = "第一章 起点（0-5秒）\n场景：旧车站\n\n第二章 回家（5-12秒）\n场景：厨房"

    async with session_factory() as db:
        db.add(Project(id="p1", name="P", description="", style="drama", visual_style="live_action"))
        db.add(
            FileItem(
                id="f1",
                type="document",
                name="剧本",
                storage_key="files/f1/script.txt",
                original_name="script.txt",
                mime_type="text/plain",
                size_bytes=len(script.encode()),
                checksum="same-hash",
            )
        )
        await db.commit()

        with patch("app.services.studio.script_imports.storage.download_file", new=AsyncMock(return_value=script.encode())):
            first = await create_script_import(db, project_id="p1", file_id="f1")
            await db.commit()
            second = await create_script_import(db, project_id="p1", file_id="f1")
        assert first.id == second.id

        committed = await commit_script_import(
            db,
            import_id=first.id,
            selected_chapter_indexes=[2],
            chapter_overrides={"2": {"title": "修订后的回家", "screenplay_text": "厨房里亮起灯。"}},
        )
        await db.commit()
        repeated = await commit_script_import(db, import_id=first.id, selected_chapter_indexes=[1])
        assert committed.created_count == 1
        assert repeated.reused is True
        assert repeated.chapter_ids == committed.chapter_ids
        chapter = await db.get(Chapter, committed.chapter_ids[0])
        assert chapter is not None
        assert chapter.title == "修订后的回家"
        assert chapter.raw_text == "厨房里亮起灯。"

    await engine.dispose()
