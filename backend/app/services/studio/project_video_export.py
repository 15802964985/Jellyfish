"""从项目镜头视频构建时间线，并通过 FFmpeg 导出可交付 MP4。"""

from __future__ import annotations

import asyncio
import hashlib
import json
import shutil
import tempfile
from pathlib import Path
from uuid import uuid4

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import storage
from app.core.db import async_session_maker
from app.core.task_manager import DeliveryMode, SqlAlchemyTaskStore, TaskManager
from app.core.task_manager.types import TaskStatus
from app.models.generation_artifacts import GenerationDispatchOutbox
from app.models.studio import Chapter, FileItem, FileType, FileUsage, Project, Shot, ShotDetail, ShotDialogLine
from app.models.task import GenerationTask, GenerationTaskStatus
from app.models.task_links import GenerationTaskLink
from app.schemas.studio.timeline import ProjectTimelineClipRead, ProjectTimelineRead, ProjectEditPlan, EditVideoClip
from app.models.studio_projects import ProjectEdit
from app.services.studio.project_editing import validate_edit_plan, pin_edit_files
from app.services.studio.file_usages import upsert_file_usage
from app.services.worker.async_task_support import cancel_if_requested_async
from app.services.worker.task_logging import log_task_event, log_task_failure

PROJECT_VIDEO_EXPORT_TASK_KIND = "project_video_export"
PROJECT_VIDEO_EXPORT_RELATION_TYPE = "project_video_export"
_ACTIVE_STATUSES = (
    GenerationTaskStatus.pending,
    GenerationTaskStatus.running,
    GenerationTaskStatus.streaming,
)


class _CreateOnlyTask:
    """仅为 TaskManager 提供任务类型名称，实际执行由 Celery registry 接管。"""

    async def run(self, *args: object, **kwargs: object):  # noqa: ANN001, ANN003
        return None

    async def status(self) -> dict[str, object]:
        return {}

    async def is_done(self) -> bool:
        return False

    async def get_result(self) -> object:
        return None


async def build_project_timeline(db: AsyncSession, *, project_id: str) -> ProjectTimelineRead:
    """以章节序号、镜头序号为唯一顺序，实时投影项目视频时间线。"""

    if await db.get(Project, project_id) is None:
        raise LookupError("project_not_found")
    rows = (
        await db.execute(
            select(Chapter, Shot, ShotDetail, FileItem)
            .join(Shot, Shot.chapter_id == Chapter.id)
            .outerjoin(ShotDetail, ShotDetail.id == Shot.id)
            .outerjoin(FileItem, FileItem.id == Shot.generated_video_file_id)
            .where(Chapter.project_id == project_id)
            .order_by(Chapter.index, Shot.index, Shot.id)
        )
    ).all()

    clips: list[ProjectTimelineClipRead] = []
    missing_shot_ids: list[str] = []
    cursor = 0.0
    for chapter, shot, detail, file_item in rows:
        if file_item is None or file_item.type != FileType.video or not file_item.storage_key:
            missing_shot_ids.append(shot.id)
            continue
        duration = float(file_item.duration_ms or 0) / 1000
        if duration <= 0:
            duration = float(detail.duration if detail is not None else 0)
        duration = max(0.001, duration)
        clip = ProjectTimelineClipRead(
            id=f"shot:{shot.id}",
            chapter_id=chapter.id,
            chapter_index=chapter.index,
            chapter_title=chapter.title,
            shot_id=shot.id,
            shot_index=shot.index,
            label=f"第{chapter.index}章 · 镜头{shot.index} · {shot.title}",
            file_id=file_item.id,
            start_seconds=round(cursor, 3),
            end_seconds=round(cursor + duration, 3),
            duration_seconds=round(duration, 3),
        )
        clips.append(clip)
        cursor += duration

    latest_export_file_id = (
        await db.execute(
            select(FileItem.id)
            .join(FileUsage, FileUsage.file_id == FileItem.id)
            .where(
                FileUsage.project_id == project_id,
                FileUsage.usage_kind == "project_export",
                FileItem.type == FileType.video,
            )
            .order_by(FileUsage.updated_at.desc(), FileUsage.id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()

    return ProjectTimelineRead(
        project_id=project_id,
        clips=clips,
        total_shots=len(rows),
        ready_shots=len(clips),
        missing_shot_ids=missing_shot_ids,
        total_duration_seconds=round(cursor, 3),
        export_ready=bool(rows) and not missing_shot_ids,
        latest_export_file_id=latest_export_file_id,
    )


async def create_project_video_export_task(
    db: AsyncSession,
    *,
    project_id: str,
    allow_partial: bool,
    include_subtitles: bool = True,
    edit_revision: int | None = None,
) -> tuple[str, TaskStatus, bool]:
    """幂等创建项目导出任务，并与任务中心和可靠 Outbox 关联。"""

    project = (await db.execute(select(Project).where(Project.id == project_id).with_for_update())).scalar_one_or_none()
    if project is None:
        raise LookupError("project_not_found")
    timeline = await build_project_timeline(db, project_id=project_id)
    if edit_revision is not None:
        row = await db.get(ProjectEdit, project_id, populate_existing=True)
        if row is None or row.revision != edit_revision:
            raise ValueError("工程版本已变化，请刷新核对后导出")
        plan = ProjectEditPlan.model_validate(row.plan)
        await validate_edit_plan(db, project_id, plan, plan)
        metadata = (await db.execute(select(Shot, Chapter).join(Chapter, Chapter.id == Shot.chapter_id)
            .where(Chapter.project_id == project_id))).all()
        by_shot = {shot.id: (shot, chapter) for shot, chapter in metadata}
        clips = []
        cursor = 0.0
        for index, clip in enumerate(plan.clips):
            if index and plan.clips[index - 1].transition != "cut":
                cursor -= plan.clips[index - 1].transition_seconds
            shot, chapter = by_shot[clip.shot_id]
            duration = clip.out_seconds - clip.in_seconds
            clips.append(ProjectTimelineClipRead(id=clip.id, chapter_id=chapter.id, chapter_index=chapter.index,
                chapter_title=chapter.title, shot_id=shot.id, shot_index=shot.index, label=clip.label,
                file_id=clip.file_id, start_seconds=cursor, end_seconds=cursor + duration, duration_seconds=duration))
            cursor += duration
        timeline.clips = clips
        timeline.missing_shot_ids = [shot.id for shot, _ in metadata if shot.id not in {c.shot_id for c in plan.clips}]
        timeline.total_duration_seconds = cursor
        timeline.ready_shots = len({c.shot_id for c in plan.clips})
        subtitle_content, subtitle_count = _edit_srt(plan)
    else:
        plan = ProjectEditPlan(clips=[EditVideoClip(id=c.shot_id, shot_id=c.shot_id, file_id=c.file_id,
            label=c.label, out_seconds=c.duration_seconds) for c in timeline.clips])
        subtitle_content, subtitle_count = await _build_project_srt(db, timeline=timeline)
    if not timeline.clips:
        raise ValueError("project_has_no_generated_videos")
    if timeline.missing_shot_ids and not allow_partial:
        raise ValueError("project_video_export_incomplete")
    media = {}
    for file_id in {c.file_id for c in plan.clips} | {a.file_id for a in plan.audio}:
        file = await db.get(FileItem, file_id)
        if not file or not file.storage_key:
            raise ValueError("导出引用的文件不存在")
        media[file_id] = {"storage_key": file.storage_key, "checksum": file.checksum}
    snapshot = {"timeline": timeline.model_dump(mode="json"), "plan": plan.model_dump(mode="json"),
        "ratio": project.default_video_ratio, "name": project.name, "media": media,
        "subtitle_text": subtitle_content.decode("utf-8-sig"), "subtitle_count": subtitle_count,
        "edit_revision": edit_revision, "include_subtitles": include_subtitles}
    # 最近成片不是本次编码输入，避免导出结束后改变同内容的摘要。
    snapshot["timeline"]["latest_export_file_id"] = None
    snapshot_hash = hashlib.sha256(json.dumps(snapshot, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    existing = (
        await db.execute(
            select(GenerationTask)
            .join(GenerationTaskLink, GenerationTaskLink.task_id == GenerationTask.id)
            .where(
                GenerationTaskLink.relation_type == PROJECT_VIDEO_EXPORT_RELATION_TYPE,
                GenerationTaskLink.relation_entity_id == project_id,
                GenerationTask.status.in_(_ACTIVE_STATUSES),
            )
            .limit(1)
        )
    ).scalars().first()
    if existing is not None:
        if (existing.payload or {}).get("run_args", {}).get("snapshot_hash") != snapshot_hash:
            raise ValueError("已有其他版本正在导出，请等待完成或取消后再导出当前工程")
        value = existing.status.value if hasattr(existing.status, "value") else str(existing.status)
        return existing.id, TaskStatus(value), True

    manager = TaskManager(store=SqlAlchemyTaskStore(db), strategies={})
    record = await manager.create(
        task=_CreateOnlyTask(),
        mode=DeliveryMode.async_polling,
        task_kind=PROJECT_VIDEO_EXPORT_TASK_KIND,
        run_args={
            "project_id": project_id,
            "allow_partial": allow_partial,
            "include_subtitles": include_subtitles,
            "snapshot": snapshot,
            "snapshot_hash": snapshot_hash,
        },
    )
    db.add(
        GenerationTaskLink(
            task_id=record.id,
            resource_type="video",
            relation_type=PROJECT_VIDEO_EXPORT_RELATION_TYPE,
            relation_entity_id=project_id,
        )
    )
    await pin_edit_files(db, project_id, plan, f"export:{record.id}")
    db.add(GenerationDispatchOutbox(task_id=record.id, payload={"task_id": record.id}))
    await db.flush()
    return record.id, record.status, False


def _output_size(ratio: str | None) -> tuple[int, int]:
    """把项目比例映射为兼容性较好的偶数 720p 画布。"""

    return {
        "9:16": (720, 1280),
        "1:1": (720, 720),
        "4:3": (960, 720),
        "3:4": (720, 960),
    }.get(str(ratio or "16:9"), (1280, 720))


async def _run_process(command: list[str], *, timeout: float = 1800.0) -> None:
    """执行 FFmpeg/FFprobe，并将有限长度 stderr 转成可诊断错误。"""

    process = await asyncio.create_subprocess_exec(
        *command,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        _, stderr = await asyncio.wait_for(process.communicate(), timeout=timeout)
    except TimeoutError:
        process.kill()
        await process.communicate()
        raise RuntimeError("FFmpeg export timed out") from None
    if process.returncode != 0:
        detail = stderr.decode("utf-8", errors="replace")[-2000:]
        raise RuntimeError(detail or f"media process exited with code {process.returncode}")


async def _has_audio_stream(ffprobe: str, source: Path) -> bool:
    """探测视频是否带音轨，以便为无声视频补齐静音轨。"""

    process = await asyncio.create_subprocess_exec(
        ffprobe,
        "-v",
        "error",
        "-select_streams",
        "a:0",
        "-show_entries",
        "stream=index",
        "-of",
        "json",
        str(source),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, _ = await asyncio.wait_for(process.communicate(), timeout=60)
    if process.returncode != 0:
        return False
    try:
        return bool(json.loads(stdout.decode("utf-8")).get("streams"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return False


async def _normalize_clip(
    *,
    ffmpeg: str,
    ffprobe: str,
    source: Path,
    target: Path,
    width: int,
    height: int,
    in_seconds: float = 0,
    duration_seconds: float | None = None,
    volume: float = 1,
) -> None:
    """统一编码、画布、帧率和音频参数，保证后续无损顺序拼接。"""

    video_filter = (
        f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
        f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:black,fps=25,format=yuv420p,setsar=1"
    )
    command = [ffmpeg, "-y", "-hide_banner", "-loglevel", "error", "-i", str(source)]
    if await _has_audio_stream(ffprobe, source):
        command.extend(["-map", "0:v:0", "-map", "0:a:0"])
    else:
        command.extend(
            [
                "-f",
                "lavfi",
                "-i",
                "anullsrc=channel_layout=stereo:sample_rate=48000",
                "-map",
                "0:v:0",
                "-map",
                "1:a:0",
                "-shortest",
            ]
        )
    command.extend(["-ss", str(in_seconds)])
    if duration_seconds is not None:
        command.extend(["-t", str(duration_seconds)])
    command.extend(["-af", f"volume={volume},apad"])
    command.extend(
        [
            "-shortest",
            "-vf",
            video_filter,
            "-c:v",
            "libx264",
            "-preset",
            "medium",
            "-crf",
            "20",
            "-c:a",
            "aac",
            "-ar",
            "48000",
            "-ac",
            "2",
            "-b:a",
            "192k",
            "-movflags",
            "+faststart",
            str(target),
        ]
    )
    await _run_process(command)


def _srt_timestamp(seconds: float) -> str:
    """把非负秒数转换成标准 SRT 时间戳。"""
    milliseconds = max(0, round(seconds * 1000))
    hours, remainder = divmod(milliseconds, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    secs, millis = divmod(remainder, 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"


async def _build_project_srt(db: AsyncSession, *, timeline: ProjectTimelineRead) -> tuple[bytes, int]:
    """按每个镜头时段分配对白行，生成不会跨越镜头边界的 UTF-8 SRT。"""
    shot_ids = [clip.shot_id for clip in timeline.clips]
    if not shot_ids:
        return b"", 0
    lines = list(
        (
            await db.execute(
                select(ShotDialogLine)
                .where(ShotDialogLine.shot_detail_id.in_(shot_ids))
                .order_by(ShotDialogLine.shot_detail_id, ShotDialogLine.index, ShotDialogLine.id)
            )
        ).scalars().all()
    )
    grouped: dict[str, list[ShotDialogLine]] = {}
    for line in lines:
        if line.text and line.text.strip():
            grouped.setdefault(line.shot_detail_id, []).append(line)

    cues: list[str] = []
    cue_index = 1
    for clip in timeline.clips:
        clip_lines = grouped.get(clip.shot_id, [])
        if not clip_lines:
            continue
        weights = [max(1, len(line.text.strip())) for line in clip_lines]
        total_weight = sum(weights)
        cursor = clip.start_seconds
        for index, (line, weight) in enumerate(zip(clip_lines, weights)):
            duration = clip.duration_seconds * weight / total_weight
            end = clip.end_seconds if index == len(clip_lines) - 1 else min(clip.end_seconds, cursor + duration)
            speaker = (line.speaker_name or "").strip()
            text = line.text.strip().replace("\r", "").replace("\n", " ")
            visible_text = f"{speaker}：{text}" if speaker else text
            cues.append(
                f"{cue_index}\n{_srt_timestamp(cursor)} --> {_srt_timestamp(end)}\n{visible_text}\n"
            )
            cue_index += 1
            cursor = end
    return ("\n".join(cues).encode("utf-8-sig"), cue_index - 1)


async def _attach_subtitle_track(*, ffmpeg: str, video: Path, subtitle: Path, target: Path) -> None:
    """以 mov_text 软字幕写入 MP4，保留视频音频编码避免二次损耗。"""
    await _run_process(
        [
            ffmpeg,
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            str(video),
            "-i",
            str(subtitle),
            "-map",
            "0:v:0",
            "-map",
            "0:a:0",
            "-map",
            "1:0",
            "-c:v",
            "copy",
            "-c:a",
            "copy",
            "-c:s",
            "mov_text",
            "-metadata:s:s:0",
            "language=zho",
            "-movflags",
            "+faststart",
            str(target),
        ]
    )


async def _export_project_video(
    db: AsyncSession,
    *,
    task_id: str,
    project_id: str,
    allow_partial: bool,
    include_subtitles: bool,
    store: SqlAlchemyTaskStore,
    snapshot: dict | None = None,
    snapshot_hash: str | None = None,
) -> dict[str, object]:
    """下载镜头、规范化后顺序拼接，并把成片登记回项目文件资产。"""

    timeline = ProjectTimelineRead.model_validate(snapshot["timeline"]) if snapshot else await build_project_timeline(db, project_id=project_id)
    plan = ProjectEditPlan.model_validate(snapshot["plan"]) if snapshot else None
    if not timeline.clips:
        raise RuntimeError("项目没有可导出的镜头视频")
    if timeline.missing_shot_ids and not allow_partial:
        raise RuntimeError(f"仍有 {len(timeline.missing_shot_ids)} 个镜头缺少视频，未执行不完整导出")
    project = await db.get(Project, project_id)
    if project is None:
        raise RuntimeError("项目不存在")
    ffmpeg = shutil.which("ffmpeg")
    ffprobe = shutil.which("ffprobe")
    if not ffmpeg or not ffprobe:
        raise RuntimeError("运行环境缺少 FFmpeg/FFprobe，无法导出成片")
    width, height = _output_size(snapshot.get("ratio") if snapshot else project.default_video_ratio)
    if plan and plan.resolution == 1080:
        width, height = width * 3 // 2, height * 3 // 2

    with tempfile.TemporaryDirectory(prefix="jellyfish-project-export-") as temp_dir:
        workdir = Path(temp_dir)
        normalized_paths: list[Path] = []
        for index, clip in enumerate(timeline.clips):
            if await cancel_if_requested_async(store=store, task_id=task_id, session=db):
                return {}
            file_item = await db.get(FileItem, clip.file_id)
            if file_item is None:
                raise RuntimeError(f"镜头视频文件不存在：{clip.shot_id}")
            source = workdir / f"source-{index:04d}.bin"
            target = workdir / f"clip-{index:04d}.mp4"
            key = snapshot["media"][clip.file_id]["storage_key"] if snapshot else file_item.storage_key
            source.write_bytes(await storage.download_file(key=key))
            edit = plan.clips[index] if plan else None
            await _normalize_clip(
                ffmpeg=ffmpeg,
                ffprobe=ffprobe,
                source=source,
                target=target,
                width=width,
                height=height,
                in_seconds=edit.in_seconds if edit else 0,
                duration_seconds=clip.duration_seconds,
                volume=edit.volume if edit else 1,
            )
            normalized_paths.append(target)
            await store.set_progress(task_id, 10 + int(70 * (index + 1) / len(timeline.clips)))
            await db.commit()

        concat_file = workdir / "concat.txt"
        concat_file.write_text(
            "".join(f"file '{path.as_posix()}'\n" for path in normalized_paths),
            encoding="utf-8",
        )
        concat_output = workdir / "project-concat.mp4"
        if plan and any(c.transition != "cut" for c in plan.clips[:-1]):
            await _run_process(build_transition_command(ffmpeg=ffmpeg, sources=normalized_paths, target=concat_output, plan=plan))
        else:
            await _run_process(
                [
                    ffmpeg,
                    "-y",
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-f",
                    "concat",
                    "-safe",
                    "0",
                    "-i",
                    str(concat_file),
                    "-c",
                    "copy",
                    "-movflags",
                    "+faststart",
                    str(concat_output),
                ]
            )
        if plan and plan.audio:
            audio_paths = []
            for index, audio in enumerate(plan.audio):
                if await cancel_if_requested_async(store=store, task_id=task_id, session=db):
                    return {}
                path = workdir / f"audio-{index}.bin"
                path.write_bytes(await storage.download_file(key=snapshot["media"][audio.file_id]["storage_key"]))
                audio_paths.append(path)
            mixed = workdir / "project-mixed.mp4"
            await _mix_edit_audio(ffmpeg=ffmpeg, video=concat_output, target=mixed, plan=plan, sources=audio_paths)
            concat_output = mixed
        if snapshot:
            subtitle_content = snapshot["subtitle_text"].encode("utf-8-sig") if snapshot["subtitle_text"] else b""
            subtitle_count = snapshot["subtitle_count"]
        else:
            subtitle_content, subtitle_count = await _build_project_srt(db, timeline=timeline)
        output = concat_output
        if include_subtitles and subtitle_content:
            subtitle_path = workdir / "project-subtitles.srt"
            subtitle_path.write_bytes(subtitle_content)
            output = workdir / "project-final.mp4"
            await _attach_subtitle_track(
                ffmpeg=ffmpeg,
                video=concat_output,
                subtitle=subtitle_path,
                target=output,
            )
        content = output.read_bytes()

    if await cancel_if_requested_async(store=store, task_id=task_id, session=db):
        return {}
    file_id = uuid4().hex
    object_key = f"project-exports/{project_id}/{file_id}.mp4"
    stored = await storage.upload_file(
        key=object_key,
        data=content,
        content_type="video/mp4",
        extra_args={"ACL": "public-read"},
    )
    file_item = FileItem(
        id=file_id,
        type=FileType.video,
        name=f"{project.name}-成片",
        thumbnail=stored.url,
        tags=["成片", "项目导出"],
        storage_key=object_key,
        original_name=f"{project.name}-成片.mp4",
        mime_type="video/mp4",
        size_bytes=len(content),
        duration_ms=int(timeline.total_duration_seconds * 1000),
        width=width,
        height=height,
        checksum=hashlib.sha256(content).hexdigest(),
    )
    db.add(file_item)
    await db.flush()
    await upsert_file_usage(
        db,
        file_id=file_id,
        project_id=project_id,
        chapter_id=None,
        shot_id=None,
        usage_kind="project_export",
        source_ref=f"project:{project_id}:export:{task_id}",
    )
    subtitle_file_id: str | None = None
    if include_subtitles and subtitle_content:
        subtitle_file_id = uuid4().hex
        subtitle_key = f"project-exports/{project_id}/{subtitle_file_id}.srt"
        await storage.upload_file(
            key=subtitle_key,
            data=subtitle_content,
            content_type="application/x-subrip; charset=utf-8",
        )
        db.add(
            FileItem(
                id=subtitle_file_id,
                type=FileType.document,
                name=f"{project.name}-字幕",
                thumbnail="",
                tags=["字幕", "项目导出"],
                storage_key=subtitle_key,
                original_name=f"{project.name}-字幕.srt",
                mime_type="application/x-subrip",
                size_bytes=len(subtitle_content),
                checksum=hashlib.sha256(subtitle_content).hexdigest(),
            )
        )
        await db.flush()
        await upsert_file_usage(
            db,
            file_id=subtitle_file_id,
            project_id=project_id,
            chapter_id=None,
            shot_id=None,
            usage_kind="project_subtitles",
            source_ref=f"project:{project_id}:subtitles:{task_id}",
        )
    await db.execute(
        update(GenerationTaskLink)
        .where(GenerationTaskLink.task_id == task_id)
        .values(file_id=file_id)
    )
    return {
        "file_id": file_id,
        "preview_path": f"/api/v1/studio/files/{file_id}/preview",
        "download_path": f"/api/v1/studio/files/{file_id}/download",
        "clip_count": len(timeline.clips),
        "skipped_shot_count": len(timeline.missing_shot_ids),
        "duration_seconds": timeline.total_duration_seconds,
        "width": width,
        "height": height,
        "subtitle_count": subtitle_count if include_subtitles else 0,
        "subtitle_file_id": subtitle_file_id,
        "edit_revision": snapshot.get("edit_revision") if snapshot else None,
        "snapshot_hash": snapshot_hash,
    }


async def run_project_video_export_task(task_id: str, run_args: dict) -> None:
    """执行项目成片异步任务，并把全部终态持久化到任务中心。"""

    async with async_session_maker() as db:
        store = SqlAlchemyTaskStore(db)
        try:
            await store.set_status(task_id, TaskStatus.running)
            await store.set_progress(task_id, 5)
            await db.commit()
            if await cancel_if_requested_async(store=store, task_id=task_id, session=db):
                return
            project_id = str(run_args.get("project_id") or "").strip()
            if not project_id:
                raise RuntimeError("project_id is required")
            result = await _export_project_video(
                db,
                task_id=task_id,
                project_id=project_id,
                allow_partial=bool(run_args.get("allow_partial")),
                include_subtitles=bool(run_args.get("include_subtitles", True)),
                store=store,
                snapshot=run_args.get("snapshot"),
                snapshot_hash=run_args.get("snapshot_hash"),
            )
            if not result:
                return
            if await cancel_if_requested_async(store=store, task_id=task_id, session=db):
                return
            await store.set_result(task_id, result)
            await store.set_progress(task_id, 100)
            await store.set_status(task_id, TaskStatus.succeeded)
            await db.commit()
            log_task_event(PROJECT_VIDEO_EXPORT_TASK_KIND, task_id, "succeeded")
        except Exception as exc:  # noqa: BLE001
            await db.rollback()
            await store.set_error(task_id, str(exc))
            await store.set_status(task_id, TaskStatus.failed)
            await db.commit()
            log_task_failure(PROJECT_VIDEO_EXPORT_TASK_KIND, task_id, str(exc))


__all__ = [
    "PROJECT_VIDEO_EXPORT_RELATION_TYPE",
    "PROJECT_VIDEO_EXPORT_TASK_KIND",
    "build_project_timeline",
    "create_project_video_export_task",
    "run_project_video_export_task",
]


def _edit_srt(plan: ProjectEditPlan) -> tuple[bytes, int]:
    """按人工确定的成片绝对时间生成字幕，不重新按对白字数估算。"""
    cues = [f"{i}\n{_srt_timestamp(c.start_seconds)} --> {_srt_timestamp(c.end_seconds)}\n{c.text.replace(chr(13), '').strip()}\n"
        for i, c in enumerate(sorted(plan.subtitles, key=lambda c: c.start_seconds), 1)]
    return ("\n".join(cues).encode("utf-8-sig") if cues else b"", len(cues))


def build_edit_mix_command(*, ffmpeg: str, video: Path, target: Path, plan: ProjectEditPlan, sources: list[Path]) -> list[str]:
    """编译多轨时间偏移、裁剪和增益；主轨决定长度，限幅避免叠音削波。"""
    command = [ffmpeg, "-y", "-hide_banner", "-loglevel", "error", "-i", str(video)]
    filters = ["[0:a:0]aresample=48000,asetpts=PTS-STARTPTS[base]"]
    labels = ["[base]"]
    for index, (audio, source) in enumerate(zip(plan.audio, sources), 1):
        command.extend(["-i", str(source)])
        filters.append(f"[{index}:a:0]atrim=start={audio.in_seconds}:duration={audio.duration_seconds},"
            f"asetpts=PTS-STARTPTS,aresample=48000,volume={audio.volume},"
            f"adelay={round(audio.start_seconds * 1000)}:all=1[a{index}]")
        labels.append(f"[a{index}]")
    filters.append("".join(labels) + f"amix=inputs={len(labels)}:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.95:level=0:latency=1[mix]")
    command.extend(["-filter_complex", ";".join(filters), "-map", "0:v:0", "-map", "[mix]",
        "-c:v", "copy", "-c:a", "aac", "-ar", "48000", "-ac", "2", "-b:a", "192k", "-movflags", "+faststart", str(target)])
    return command


async def _mix_edit_audio(*, ffmpeg: str, video: Path, target: Path, plan: ProjectEditPlan, sources: list[Path]) -> None:
    """调用统一混音编译器，离线验证与生产导出使用同一命令。"""
    await _run_process(build_edit_mix_command(ffmpeg=ffmpeg, video=video, target=target, plan=plan, sources=sources))


def build_transition_command(*, ffmpeg: str, sources: list[Path], target: Path, plan: ProjectEditPlan) -> list[str]:
    """一次滤镜图完成转场及原声音轨交叉淡化，避免中间版本反复有损编码。"""
    command = [ffmpeg, "-y", "-hide_banner", "-loglevel", "error", "-filter_complex_threads", "1"]
    filters = []
    for index, source in enumerate(sources):
        command.extend(["-i", str(source)])
        filters.extend([f"[{index}:v]settb=AVTB,setpts=PTS-STARTPTS,fps=25[v{index}]",
            f"[{index}:a]aresample=48000,asetpts=PTS-STARTPTS[a{index}]"])
    video, audio = "v0", "a0"
    cursor = plan.clips[0].out_seconds - plan.clips[0].in_seconds
    for index in range(1, len(sources)):
        previous = plan.clips[index - 1]
        next_video, next_audio = f"joinv{index}", f"joina{index}"
        if previous.transition == "cut":
            filters.append(f"[{video}][{audio}][v{index}][a{index}]concat=n=2:v=1:a=1[{next_video}][{next_audio}]")
        else:
            duration = previous.transition_seconds
            cursor -= duration
            filters.extend([f"[{video}][v{index}]xfade=transition={previous.transition}:duration={duration}:offset={cursor}[{next_video}]",
                f"[{audio}][a{index}]acrossfade=d={duration}:c1=tri:c2=tri[{next_audio}]"])
        # concat changes timebase and frame-rate metadata; normalize before any following xfade.
        filters.append(f"[{next_video}]fps=25[clockv{index}]")
        video, audio = f"clockv{index}", next_audio
        cursor += plan.clips[index].out_seconds - plan.clips[index].in_seconds
    command.extend(["-filter_complex", ";".join(filters), "-map", f"[{video}]", "-map", f"[{audio}]",
        "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-r", "25", "-c:a", "aac",
        "-b:a", "192k", "-movflags", "+faststart", str(target)])
    return command
