"""Persistence and atomic commit tests for script imports."""

from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.db import Base
from app.models.studio import (
    Chapter,
    Character,
    FileItem,
    Project,
    ProjectPropLink,
    ProjectSceneLink,
    Prop,
    Scene,
    ScriptImport,
    ShotDetail,
    ShotDialogLine,
)
from app.schemas.skills.script_import_analysis import ScriptImportAnalysisResult
from app.services.studio.script_imports import (
    commit_script_import,
    create_script_import,
    sanitize_script_import_analysis,
    _plan_duration_segments,
)


def test_analysis_sanitizer_rejects_hallucinated_evidence_and_validates_duration() -> None:
    parsed = {
        "blocks": [{"id": "b1", "clean_text": "小雨推开幼儿园大门。"}],
        "chapters": [{"index": 1, "target_duration_seconds": 5}],
    }
    analysis = ScriptImportAnalysisResult.model_validate({
        "entities": [
            {
                "candidate_id": "character-xiaoyu",
                "entity_type": "character",
                "name": "小雨",
                "evidence": [{"block_id": "b1", "quote": "小雨"}],
            },
            {
                "candidate_id": "prop-hallucinated",
                "entity_type": "prop",
                "name": "魔法棒",
                "evidence": [{"block_id": "missing", "quote": "魔法棒"}],
            },
        ],
        "shots": [
            {
                "candidate_id": "shot-1",
                "chapter_index": 1,
                "index": 1,
                "title": "入园",
                "duration_seconds": 3,
                "evidence": [{"block_id": "b1", "quote": "推开幼儿园大门"}],
            }
        ],
    })

    result = sanitize_script_import_analysis(analysis, parsed)

    assert [item.candidate_id for item in result.entities] == ["character-xiaoyu"]
    assert any("prop-hallucinated" in warning for warning in result.warnings)
    assert any(item.code == "shot_duration_mismatch" for item in result.validation)


def test_duration_planner_uses_only_model_legal_segments() -> None:
    segments, warnings = _plan_duration_segments(12, allowed={5, 10}, minimum=5, maximum=10)
    assert all(item in {5, 10} for item in segments)
    assert sum(segments) == 10
    assert warnings


@pytest.mark.asyncio
async def test_commit_materializes_reviewed_assets_shot_links_and_audio_plan() -> None:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async with session_factory() as db:
        db.add(Project(id="p2", name="P2", description="", style="drama", visual_style="live_action"))
        db.add(FileItem(id="f2", type="document", name="剧本", storage_key="f2.txt", original_name="f2.txt", mime_type="text/plain"))
        import_row = ScriptImport(
            id="i2",
            project_id="p2",
            file_id="f2",
            status="ready",
            source_format="txt",
            content_hash="hash-i2",
            parser_version="test",
            document_profile="screenplay",
            parse_result={"chapters": [{"index": 1, "title": "入园", "screenplay_text": "小雨推门。"}]},
            analysis_result={
                "entities": [
                    {"candidate_id": "c1", "entity_type": "character", "name": "小雨"},
                    {"candidate_id": "s1", "entity_type": "scene", "name": "幼儿园门口"},
                    {"candidate_id": "p1", "entity_type": "prop", "name": "小书包"},
                ],
                "shots": [{
                    "candidate_id": "shot1", "chapter_index": 1, "index": 1, "title": "推门",
                    "duration_seconds": 4, "scene": "幼儿园门口", "action": "小雨推门",
                    "character_names": ["小雨"], "prop_names": ["小书包"], "costume_names": [],
                    "evidence": [{"block_id": "b1", "quote": "小雨推门"}],
                }],
                "audio": [
                    {"candidate_id": "a1", "audio_type": "voiceover", "chapter_index": 1, "shot_index": 1, "text": "第一天。"},
                    {"candidate_id": "a2", "audio_type": "sfx", "chapter_index": 1, "shot_index": 1, "text": "开门声"},
                ],
            },
            review_state={},
            commit_result={},
        )
        db.add(import_row)
        await db.commit()

        result = await commit_script_import(
            db,
            import_id="i2",
            selected_chapter_indexes=[1],
            candidate_decisions={
                "c1": {"action": "create"},
                "s1": {"action": "create"},
                "p1": {"action": "create"},
            },
            include_shots=True,
            include_audio_dialogue=True,
        )
        await db.commit()

        assert len(result.shot_ids) == 1
        detail = await db.get(ShotDetail, result.shot_ids[0])
        assert detail is not None and detail.scene_id == result.entity_ids["s1"]
        assert [cue["audio_type"] for cue in detail.audio_cues] == ["voiceover", "sfx"]
        assert await db.get(Character, result.entity_ids["c1"]) is not None
        assert await db.get(Scene, result.entity_ids["s1"]) is not None
        assert await db.get(Prop, result.entity_ids["p1"]) is not None
        assert (await db.execute(select(ProjectSceneLink).where(ProjectSceneLink.shot_id == result.shot_ids[0]))).scalars().one()
        assert (await db.execute(select(ProjectPropLink).where(ProjectPropLink.shot_id == result.shot_ids[0]))).scalars().one()
        assert (await db.execute(select(ShotDialogLine).where(ShotDialogLine.shot_detail_id == result.shot_ids[0]))).scalars().one().text == "第一天。"

    await engine.dispose()


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
