"""项目时间线与本地成片导出契约。"""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.core.task_manager.types import TaskStatus


class ProjectTimelineClipRead(BaseModel):
    """按章节、镜头顺序投影出的一个可播放视频片段。"""

    id: str
    chapter_id: str
    chapter_index: int
    chapter_title: str
    shot_id: str
    shot_index: int
    label: str
    file_id: str
    start_seconds: float
    end_seconds: float
    duration_seconds: float


class ProjectTimelineRead(BaseModel):
    """项目当前可交付视频的只读时间线。"""

    project_id: str
    clips: list[ProjectTimelineClipRead] = Field(default_factory=list)
    total_shots: int
    ready_shots: int
    missing_shot_ids: list[str] = Field(default_factory=list)
    total_duration_seconds: float
    export_ready: bool
    latest_export_file_id: str | None = None


class ProjectVideoExportRequest(BaseModel):
    """成片导出选项；默认要求所有镜头已有视频。"""

    allow_partial: bool = Field(False, description="是否允许跳过尚无视频的镜头")
    include_subtitles: bool = Field(True, description="是否把镜头对白作为可开关字幕轨写入 MP4")


class ProjectVideoExportTaskRead(BaseModel):
    """项目成片异步任务创建结果。"""

    task_id: str
    status: TaskStatus
    reused: bool = False


__all__ = [
    "ProjectTimelineClipRead",
    "ProjectTimelineRead",
    "ProjectVideoExportRequest",
    "ProjectVideoExportTaskRead",
]
