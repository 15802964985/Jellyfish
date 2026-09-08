from __future__ import annotations

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.db import Base
from app.models.studio import (
    CameraAngle,
    CameraMovement,
    CameraShotType,
    Chapter,
    Project,
    ProjectStyle,
    ProjectVisualStyle,
    Shot,
    ShotDetail,
    VFXType,
)
from app.schemas.skills.script_processing import ScriptDivisionResult, ShotDivision
from app.services.studio.script_division import (
    normalize_generated_division_result,
    write_division_result_to_chapter,
)


async def _build_session() -> tuple[AsyncSession, object]:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", future=True)
    session_local = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    return session_local(), engine


def _division_result() -> ScriptDivisionResult:
    return ScriptDivisionResult(
        shots=[
            ShotDivision(
                index=1,
                start_line=1,
                end_line=3,
                script_excerpt="主角走进房间。",
                shot_name="进入房间",
            ),
            ShotDivision(
                index=2,
                start_line=4,
                end_line=6,
                script_excerpt="镜头切到窗边。",
                shot_name="窗边对话",
            ),
        ],
        total_shots=2,
        notes="test",
    )


def test_normalize_single_shot_result_recovers_omitted_shots() -> None:
    result = ScriptDivisionResult(shots=[], total_shots=1, notes="单一连贯场景")
    script_text = "主题：出发前\n【镜头】低机位特写，缓慢横移\n【画面】女孩在玄关穿鞋。"

    normalized = normalize_generated_division_result(result, script_text=script_text)

    assert normalized.total_shots == 1
    assert len(normalized.shots) == 1
    assert normalized.shots[0].shot_name == "低机位特写，缓慢横移"
    assert normalized.shots[0].script_excerpt == script_text
    assert normalized.shots[0].start_line == 1
    assert normalized.shots[0].end_line == 3


def test_normalize_empty_multi_shot_result_fails_instead_of_false_success() -> None:
    result = ScriptDivisionResult(shots=[], total_shots=3, notes="应有多个镜头")

    with pytest.raises(ValueError, match="returned no shot items"):
        normalize_generated_division_result(result, script_text="第一场\n第二场\n第三场")


@pytest.mark.asyncio
async def test_write_division_result_rejects_empty_result() -> None:
    db, engine = await _build_session()
    async with db:
        project = Project(
            id="p1",
            name="项目一",
            description="",
            style=ProjectStyle.real_people_city,
            visual_style=ProjectVisualStyle.live_action,
        )
        chapter = Chapter(id="c1", project_id="p1", index=1, title="第一章")
        db.add_all([project, chapter])
        await db.commit()

        with pytest.raises(ValueError, match="contains no shots"):
            await write_division_result_to_chapter(
                db,
                chapter_id="c1",
                result=ScriptDivisionResult(shots=[], total_shots=0),
            )
    await engine.dispose()


@pytest.mark.asyncio
async def test_write_division_result_to_empty_chapter_creates_shots_and_details() -> None:
    db, engine = await _build_session()
    async with db:
        project = Project(
            id="p1",
            name="项目一",
            description="",
            style=ProjectStyle.real_people_city,
            visual_style=ProjectVisualStyle.live_action,
        )
        chapter = Chapter(id="c1", project_id="p1", index=1, title="第一章")
        db.add_all([project, chapter])
        await db.commit()

        await write_division_result_to_chapter(db, chapter_id="c1", result=_division_result())

        shots = (await db.execute(select(Shot).order_by(Shot.index.asc()))).scalars().all()
        details = (await db.execute(select(ShotDetail).order_by(ShotDetail.id.asc()))).scalars().all()

        assert [shot.title for shot in shots] == ["进入房间", "窗边对话"]
        assert [shot.index for shot in shots] == [1, 2]
        assert len(details) == 2
        assert all(detail.camera_shot == CameraShotType.ms for detail in details)
        assert all(detail.angle == CameraAngle.eye_level for detail in details)
        assert all(detail.movement == CameraMovement.static for detail in details)
        assert all(detail.duration == 4 for detail in details)
        assert all(detail.vfx_type == VFXType.none for detail in details)
    await engine.dispose()


@pytest.mark.asyncio
async def test_write_division_result_refuses_when_chapter_already_has_shots() -> None:
    db, engine = await _build_session()
    async with db:
        project = Project(
            id="p1",
            name="项目一",
            description="",
            style=ProjectStyle.real_people_city,
            visual_style=ProjectVisualStyle.live_action,
        )
        chapter = Chapter(id="c1", project_id="p1", index=1, title="第一章")
        existing_shot = Shot(id="s1", chapter_id="c1", index=1, title="已有镜头")
        db.add_all([project, chapter, existing_shot])
        await db.commit()

        with pytest.raises(HTTPException) as exc_info:
            await write_division_result_to_chapter(db, chapter_id="c1", result=_division_result())

        assert exc_info.value.status_code == 400
        assert "already has shots" in exc_info.value.detail
    await engine.dispose()
