"""镜头视频与可选音轨的 FFmpeg 合成服务。"""

from __future__ import annotations

import asyncio
import hashlib
import shutil
import tempfile
import uuid
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core import storage
from app.models.studio import AudioAsset, FileItem, FileType, ShotAudioTrack


@dataclass(frozen=True, slots=True)
class CompositionResult:
    """非阻塞合成结果；warning 存在时调用方应继续使用原视频。"""

    file: FileItem
    applied_track_count: int
    warning: str = ""


def _audio_filter(track: ShotAudioTrack, input_index: int, output_label: str) -> str:
    """把持久化音轨参数转换为单路 FFmpeg filter。"""
    filters = [f"[{input_index}:a]"]
    duration_ms = (track.end_ms - track.start_ms) if track.end_ms is not None else None
    if duration_ms is not None and duration_ms > 0:
        filters.append(f"atrim=duration={duration_ms / 1000:.3f},")
    filters.append(f"volume={track.volume:.4f},")
    if track.fade_in_ms > 0:
        filters.append(f"afade=t=in:st=0:d={track.fade_in_ms / 1000:.3f},")
    if duration_ms is not None and track.fade_out_ms > 0:
        fade_start = max(0.0, (duration_ms - track.fade_out_ms) / 1000)
        filters.append(f"afade=t=out:st={fade_start:.3f}:d={track.fade_out_ms / 1000:.3f},")
    filters.append(f"adelay={track.start_ms}:all=1[{output_label}]")
    return "".join(filters)


async def _load_tracks(db: AsyncSession, *, shot_id: str) -> list[ShotAudioTrack]:
    """读取启用合成所需的音轨与底层文件。"""
    stmt = (
        select(ShotAudioTrack)
        .options(selectinload(ShotAudioTrack.audio_asset).selectinload(AudioAsset.file))
        .where(ShotAudioTrack.shot_id == shot_id)
        .order_by(ShotAudioTrack.sort_index, ShotAudioTrack.id)
    )
    return list((await db.execute(stmt)).scalars().all())


async def compose_shot_audio_if_present(
    db: AsyncSession,
    *,
    shot_id: str,
    source_video: FileItem,
) -> CompositionResult:
    """有音轨时合成新视频；任何合成故障均回退原视频，不阻断生成任务。"""
    tracks = await _load_tracks(db, shot_id=shot_id)
    if not tracks:
        return CompositionResult(file=source_video, applied_track_count=0)
    ffmpeg_path = shutil.which("ffmpeg")
    if not ffmpeg_path:
        return CompositionResult(
            file=source_video,
            applied_track_count=0,
            warning="检测到镜头音轨，但运行环境未安装 FFmpeg，已保留原始生成视频",
        )

    try:
        with tempfile.TemporaryDirectory(prefix="jellyfish-compose-") as temp_dir:
            workdir = Path(temp_dir)
            video_path = workdir / "source.mp4"
            video_path.write_bytes(await storage.download_file(key=source_video.storage_key))

            command = [ffmpeg_path, "-y", "-hide_banner", "-loglevel", "error", "-i", str(video_path)]
            valid_tracks: list[ShotAudioTrack] = []
            for track in tracks:
                file_item = track.audio_asset.file
                if not file_item or file_item.type != FileType.audio or not file_item.storage_key:
                    continue
                suffix = Path(file_item.original_name or file_item.storage_key).suffix or ".audio"
                audio_path = workdir / f"audio-{track.id}{suffix}"
                audio_path.write_bytes(await storage.download_file(key=file_item.storage_key))
                if track.loop:
                    command.extend(["-stream_loop", "-1"])
                command.extend(["-i", str(audio_path)])
                valid_tracks.append(track)

            if not valid_tracks:
                return CompositionResult(
                    file=source_video,
                    applied_track_count=0,
                    warning="镜头音轨没有可读取的音频文件，已保留原始生成视频",
                )

            labels: list[str] = []
            filters: list[str] = []
            for input_index, track in enumerate(valid_tracks, start=1):
                label = f"track{input_index}"
                labels.append(f"[{label}]")
                filters.append(_audio_filter(track, input_index, label))
            filters.append(
                f"{''.join(labels)}amix=inputs={len(labels)}:duration=longest:normalize=0,alimiter=limit=0.95[mix]"
            )

            output_path = workdir / "composed.mp4"
            command.extend(
                [
                    "-filter_complex",
                    ";".join(filters),
                    "-map",
                    "0:v:0",
                    "-map",
                    "[mix]",
                    "-c:v",
                    "copy",
                    "-c:a",
                    "aac",
                    "-b:a",
                    "192k",
                    "-movflags",
                    "+faststart",
                    "-shortest",
                    str(output_path),
                ]
            )
            process = await asyncio.create_subprocess_exec(
                *command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            _, stderr = await asyncio.wait_for(process.communicate(), timeout=600)
            if process.returncode != 0 or not output_path.exists():
                detail = stderr.decode("utf-8", errors="replace")[-1000:]
                raise RuntimeError(detail or f"FFmpeg exited with code {process.returncode}")

            content = output_path.read_bytes()
            object_key = f"generated-videos/shots/{shot_id}/composed-{uuid.uuid4().hex}.mp4"
            stored = await storage.upload_file(
                key=object_key,
                data=content,
                content_type="video/mp4",
                extra_args={"ACL": "public-read"},
            )
            result_file = FileItem(
                id=str(uuid.uuid4()),
                type=FileType.video,
                name=f"shot-{shot_id}-video-with-audio",
                thumbnail=stored.url,
                tags=["音轨合成"],
                storage_key=object_key,
                original_name=f"shot-{shot_id}-video-with-audio.mp4",
                mime_type="video/mp4",
                size_bytes=len(content),
                checksum=hashlib.sha256(content).hexdigest(),
            )
            db.add(result_file)
            await db.flush()
            return CompositionResult(
                file=result_file,
                applied_track_count=len(valid_tracks),
            )
    except Exception as exc:  # noqa: BLE001
        return CompositionResult(
            file=source_video,
            applied_track_count=0,
            warning=f"音轨合成失败，已保留原始生成视频：{exc}",
        )


__all__ = ["CompositionResult", "compose_shot_audio_if_present"]
