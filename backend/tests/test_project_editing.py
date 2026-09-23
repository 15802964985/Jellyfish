"""剪辑工程的实际数据库契约：不触及业务数据或付费模型。"""
import pytest
from sqlalchemy import select
from app.models.studio import FileItem, FileUsage, Shot
from app.models.task import GenerationTask
from app.schemas.studio.timeline import ProjectEditSave, EditAudioClip
from app.services.studio.project_editing import load_project_edit, save_project_edit
from app.services.studio.project_video_export import create_project_video_export_task, _edit_srt
from tests.test_project_video_export import _build_session, _seed_project


@pytest.mark.asyncio
async def test_edit_persists_pinned_sources_and_conflicts():
    """保存后刷新仍引用旧视频；陈旧修订不能覆盖工程。"""
    db, engine = await _build_session()
    async with db:
        await _seed_project(db)
        initial = await load_project_edit(db, "project-1")
        assert initial.revision == 0 and initial.plan.subtitles
        saved = await save_project_edit(db, "project-1", ProjectEditSave(expected_revision=0, plan=initial.plan))
        await db.commit()
        assert saved.revision == 1
        with pytest.raises(ValueError, match="其他页面"):
            await save_project_edit(db, "project-1", ProjectEditSave(expected_revision=0, plan=initial.plan))
        shot = await db.get(Shot, "shot-1")
        shot.generated_video_file_id = None
        await db.commit()
        read = await load_project_edit(db, "project-1")
        assert read.plan.clips[0].file_id == "video-1"
        assert any("原版本" in w for w in read.warnings)
        usages = (await db.execute(select(FileUsage).where(FileUsage.usage_kind == "project_edit"))).scalars().all()
        assert len(usages) == 2
    await engine.dispose()


@pytest.mark.asyncio
async def test_invalid_cross_shot_trim_audio_and_review_invalidation():
    """跨镜头文件、越界音频拒绝，已审片内容变化后回到待复核。"""
    db, engine = await _build_session()
    async with db:
        await _seed_project(db)
        plan = (await load_project_edit(db, "project-1")).plan
        wrong = plan.model_copy(deep=True)
        wrong.clips[0].file_id = "video-2"
        with pytest.raises(ValueError, match="分镜工作室"):
            await save_project_edit(db, "project-1", ProjectEditSave(expected_revision=0, plan=wrong))
        await db.rollback()
        saved = await save_project_edit(db, "project-1", ProjectEditSave(expected_revision=0, plan=plan))
        await db.commit()
        approved = saved.plan.model_copy(deep=True)
        approved.clips[0].review = "approved"
        saved = await save_project_edit(db, "project-1", ProjectEditSave(expected_revision=1, plan=approved))
        await db.commit()
        assert saved.plan.clips[0].review == "approved"
        saved.plan.clips[0].volume = 0
        saved = await save_project_edit(db, "project-1", ProjectEditSave(expected_revision=2, plan=saved.plan))
        await db.commit()
        assert saved.plan.clips[0].review == "unchecked"
        db.add(FileItem(id="music", type="audio", name="music", storage_key="music.wav", duration_ms=1000))
        await db.commit()
        saved.plan.audio = [EditAudioClip(id="audio", file_id="music", label="music", duration_seconds=2)]
        with pytest.raises(ValueError, match="音频裁剪"):
            await save_project_edit(db, "project-1", ProjectEditSave(expected_revision=3, plan=saved.plan))
    await engine.dispose()


@pytest.mark.asyncio
async def test_export_freezes_saved_revision_media_subtitles_and_mixing():
    """任务保存不可漂移的工程、存储键和字幕；不同版本不能误复用旧任务。"""
    db, engine = await _build_session()
    async with db:
        await _seed_project(db)
        plan = (await load_project_edit(db, "project-1")).plan
        plan.clips.reverse()
        plan.subtitles = []
        saved = await save_project_edit(db, "project-1", ProjectEditSave(expected_revision=0, plan=plan))
        await db.commit()
        task_id, _, _ = await create_project_video_export_task(db, project_id="project-1", allow_partial=True, edit_revision=1)
        await db.commit()
        task = await db.get(GenerationTask, task_id)
        snapshot = task.payload["run_args"]["snapshot"]
        assert snapshot["timeline"]["clips"][0]["file_id"] == "video-2"
        assert snapshot["subtitle_text"] == ""
        assert snapshot["edit_revision"] == 1
        assert snapshot["media"]["video-1"]["storage_key"] == "videos/one.mp4"
        same_id, _, reused = await create_project_video_export_task(db, project_id="project-1", allow_partial=True, edit_revision=1)
        assert reused and same_id == task_id
        with pytest.raises(ValueError, match="其他版本"):
            await create_project_video_export_task(db, project_id="project-1", allow_partial=True, edit_revision=1, include_subtitles=False)
        saved.plan.clips[0].volume = 0.2
        await save_project_edit(db, "project-1", ProjectEditSave(expected_revision=1, plan=saved.plan))
        await db.commit()
        assert snapshot["plan"]["clips"][0]["volume"] == 1
        with pytest.raises(ValueError, match="版本已变化"):
            await create_project_video_export_task(db, project_id="project-1", allow_partial=True, edit_revision=1)
    await engine.dispose()
