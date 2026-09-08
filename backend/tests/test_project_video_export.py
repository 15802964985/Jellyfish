"""项目真实时间线与成片任务创建测试。"""

from __future__ import annotations

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.db import Base
from app.models.studio import (
    CameraAngle,
    CameraMovement,
    CameraShotType,
    Chapter,
    FileItem,
    FileType,
    Project,
    ProjectStyle,
    ProjectVisualStyle,
    Shot,
    ShotDetail,
    ShotDialogLine,
)
from app.models.types import DialogueLineMode
from app.services.studio.project_video_export import (
    _build_project_srt,
    _output_size,
    _srt_timestamp,
    build_project_timeline,
    create_project_video_export_task,
)


async def _build_session() -> tuple[AsyncSession, object]:
    """创建包含完整 ORM 元数据的内存数据库。"""

    engine = create_async_engine("sqlite+aiosqlite:///:memory:", future=True)
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    return maker(), engine


async def _seed_project(db: AsyncSession) -> None:
    """写入顺序打乱的章节和镜头，便于验证时间线排序。"""

    db.add(
        Project(
            id="project-1",
            name="测试项目",
            description="",
            style=ProjectStyle.real_people_city,
            visual_style=ProjectVisualStyle.live_action,
            default_video_ratio="9:16",
        )
    )
    db.add_all(
        [
            Chapter(id="chapter-2", project_id="project-1", index=2, title="第二章"),
            Chapter(id="chapter-1", project_id="project-1", index=1, title="第一章"),
        ]
    )
    db.add_all(
        [
            ShotDialogLine(
                shot_detail_id="shot-1",
                index=1,
                text="你好，幼儿园。",
                speaker_name="小月亮",
                line_mode=DialogueLineMode.dialogue,
            ),
            ShotDialogLine(
                shot_detail_id="shot-1",
                index=2,
                text="我准备好了。",
                speaker_name="小月亮",
                line_mode=DialogueLineMode.dialogue,
            ),
        ]
    )
    db.add_all(
        [
            FileItem(
                id="video-1",
                type=FileType.video,
                name="镜头一视频",
                thumbnail="",
                tags=[],
                storage_key="videos/one.mp4",
                duration_ms=2500,
            ),
            FileItem(
                id="video-2",
                type=FileType.video,
                name="镜头二视频",
                thumbnail="",
                tags=[],
                storage_key="videos/two.mp4",
                duration_ms=None,
            ),
        ]
    )
    db.add_all(
        [
            Shot(id="shot-2", chapter_id="chapter-2", index=1, title="后镜头", generated_video_file_id="video-2"),
            Shot(id="shot-1", chapter_id="chapter-1", index=2, title="前镜头", generated_video_file_id="video-1"),
            Shot(id="shot-missing", chapter_id="chapter-1", index=3, title="缺片镜头"),
            ShotDetail(
                id="shot-2",
                camera_shot=CameraShotType.ms,
                angle=CameraAngle.eye_level,
                movement=CameraMovement.static,
                duration=4,
            ),
            ShotDetail(
                id="shot-1",
                camera_shot=CameraShotType.ms,
                angle=CameraAngle.eye_level,
                movement=CameraMovement.static,
                duration=6,
            ),
            ShotDetail(
                id="shot-missing",
                camera_shot=CameraShotType.ms,
                angle=CameraAngle.eye_level,
                movement=CameraMovement.static,
                duration=3,
            ),
        ]
    )
    await db.commit()


@pytest.mark.asyncio
async def test_timeline_uses_business_order_and_real_media_duration() -> None:
    """时间线按章节/镜头排序，优先使用文件探测时长。"""

    db, engine = await _build_session()
    async with db:
        await _seed_project(db)
        timeline = await build_project_timeline(db, project_id="project-1")
        assert [clip.shot_id for clip in timeline.clips] == ["shot-1", "shot-2"]
        assert timeline.clips[0].duration_seconds == 2.5
        assert timeline.clips[1].start_seconds == 2.5
        assert timeline.total_duration_seconds == 6.5
        assert timeline.total_shots == 3
        assert timeline.missing_shot_ids == ["shot-missing"]
        assert timeline.export_ready is False
    await engine.dispose()


@pytest.mark.asyncio
async def test_export_task_requires_explicit_partial_permission_and_reuses_active_task() -> None:
    """缺片默认阻断；显式允许后创建可追踪任务，重复提交复用活动任务。"""

    db, engine = await _build_session()
    async with db:
        await _seed_project(db)
        with pytest.raises(ValueError, match="project_video_export_incomplete"):
            await create_project_video_export_task(db, project_id="project-1", allow_partial=False)

        first_id, first_status, first_reused = await create_project_video_export_task(
            db,
            project_id="project-1",
            allow_partial=True,
        )
        await db.commit()
        second_id, second_status, second_reused = await create_project_video_export_task(
            db,
            project_id="project-1",
            allow_partial=True,
        )
        assert first_id == second_id
        assert first_status.value == "pending"
        assert second_status.value == "pending"
        assert first_reused is False
        assert second_reused is True
    await engine.dispose()


def test_output_size_respects_portrait_and_defaults_to_landscape() -> None:
    """项目比例映射保证输出尺寸为偶数且控制在 720p 级别。"""

    assert _output_size("9:16") == (720, 1280)
    assert _output_size(None) == (1280, 720)
    assert _srt_timestamp(62.345) == "00:01:02,345"


@pytest.mark.asyncio
async def test_project_subtitles_follow_ready_clip_boundaries() -> None:
    """字幕来自真实对白，包含说话人且不会超过对应镜头结束时间。"""

    db, engine = await _build_session()
    async with db:
        await _seed_project(db)
        timeline = await build_project_timeline(db, project_id="project-1")
        content, count = await _build_project_srt(db, timeline=timeline)
        text = content.decode("utf-8-sig")
        assert count == 2
        assert "小月亮：你好，幼儿园。" in text
        assert "00:00:02,500" in text
    await engine.dispose()
