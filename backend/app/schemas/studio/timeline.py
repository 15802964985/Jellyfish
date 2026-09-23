"""项目时间线与本地成片导出契约。"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.core.task_manager.types import TaskStatus


class EditVideoClip(BaseModel):
    """固定源文件的非破坏性视频裁剪，审片标记绑定本片段。"""

    id: str = Field(min_length=1, max_length=64)
    shot_id: str
    file_id: str
    label: str = Field(max_length=255)
    in_seconds: float = Field(0, ge=0, allow_inf_nan=False)
    out_seconds: float = Field(gt=0, le=86400, allow_inf_nan=False)
    volume: float = Field(1, ge=0, le=2, allow_inf_nan=False)
    review: Literal["unchecked", "approved", "rework"] = "unchecked"
    review_note: str = Field("", max_length=2000)
    reference_signature: str = Field("", max_length=64)
    transition: Literal["cut", "fade", "dissolve", "wipeleft", "slideright", "fadeblack"] = "cut"
    transition_seconds: float = Field(0.4, ge=0.04, le=3, allow_inf_nan=False)

    @model_validator(mode="after")
    def valid_range(self):
        """拒绝反向与零长度裁剪。"""
        if self.out_seconds - self.in_seconds < 0.04:
            raise ValueError("片段至少保留 0.04 秒")
        return self


class EditAudioClip(BaseModel):
    """带独立起点的配音、音乐或音效片段，可跨镜头重叠混音。"""

    id: str = Field(min_length=1, max_length=64)
    file_id: str
    label: str = Field(max_length=255)
    track: Literal["voice", "music", "effect"] = "music"
    start_seconds: float = Field(0, ge=0, le=86400, allow_inf_nan=False)
    in_seconds: float = Field(0, ge=0, le=86400, allow_inf_nan=False)
    duration_seconds: float = Field(gt=0, le=86400, allow_inf_nan=False)
    volume: float = Field(0.3, ge=0, le=2, allow_inf_nan=False)


class EditSubtitle(BaseModel):
    """人工校时后的成片字幕，时间为成片绝对秒数。"""

    id: str = Field(min_length=1, max_length=64)
    start_seconds: float = Field(ge=0, le=86400, allow_inf_nan=False)
    end_seconds: float = Field(gt=0, le=86400, allow_inf_nan=False)
    text: str = Field(min_length=1, max_length=2000)

    @model_validator(mode="after")
    def valid_range(self):
        """字幕出点必须晚于入点。"""
        if self.end_seconds <= self.start_seconds:
            raise ValueError("字幕结束时间必须晚于开始时间")
        return self


class ProjectEditPlan(BaseModel):
    """完整剪辑工程快照，服务端保存且直接用于本地编码。"""

    clips: list[EditVideoClip] = Field(default_factory=list, max_length=500)
    audio: list[EditAudioClip] = Field(default_factory=list, max_length=100)
    subtitles: list[EditSubtitle] = Field(default_factory=list, max_length=2000)
    resolution: Literal[720, 1080] = 720


class ProjectEditSave(BaseModel):
    """保存必须提供所编辑的修订号，防止不同页面相互覆盖。"""

    expected_revision: int = Field(ge=0)
    plan: ProjectEditPlan


class EditCharacterReference(BaseModel):
    """当前镜头关联的人物基准，仅作人工对照，不代表视频像素检测。"""

    shot_id: str
    character_id: str
    name: str
    description: str
    actor_name: str | None = None
    costume_name: str | None = None
    image_file_id: str | None = None


class ProjectEditRead(BaseModel):
    """服务端工程与当前素材目录分开返回。"""

    revision: int
    plan: ProjectEditPlan
    warnings: list[str] = Field(default_factory=list)
    character_references: list[EditCharacterReference] = Field(default_factory=list)


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

    edit_revision: int | None = Field(None, ge=1, description="导出已保存工程的精确修订号")
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


class EditVisualPrepare(BaseModel):
    """只对已保存工程抽帧，调用模型之前先预览外发材料。"""
    expected_revision: int = Field(ge=1)
    clip_id: str = Field(min_length=1, max_length=64)
    baseline_file_ids: list[str] | None = Field(None, max_length=3)
    sample_mode: Literal["start", "bounds", "continuity"] = "continuity"


class EditVisualImage(BaseModel):
    """图片在审片证据中的身份与原视频采样时间。"""
    file_id: str
    label: str
    source_file_id: str | None = None
    shot_id: str | None = None
    clip_id: str | None = None
    seconds: float | None = None


class EditVisualEvidence(BaseModel):
    """服务端冻结的审片材料，不接收客户端自行编造的图文映射。"""
    evidence_id: str
    shot_contexts: dict = Field(default_factory=dict)
    revision: int
    clip_id: str
    fingerprint: str
    images: list[EditVisualImage]
    limitations: list[str]
    baseline_file_ids: list[str] = Field(default_factory=list)
    sample_mode: Literal["start", "bounds", "continuity"] = "continuity"


class EditVisualSubmit(BaseModel):
    """明确确认外发与费用后提交一次检查，重复同一请求可幂等复用。"""
    evidence_id: str = Field(min_length=1, max_length=64)
    model_id: str
    model_revision_id: str
    request_id: str = Field(min_length=1, max_length=64)
    external_and_billing_confirmed: Literal[True]


class EditVisualModel(BaseModel):
    """经过现有视觉能力白名单核验的已配置模型。"""
    id: str
    revision_id: str
    name: str


class EditVisualReport(BaseModel):
    """仅成功且有正文的历史报告，保留准确的来源与适用状态。"""
    task_id: str
    created_at: str
    model_name: str
    revision: int
    clip_id: str
    matches_current: bool
    text: str
    evidence: EditVisualEvidence


class CharacterAngleView(BaseModel):
    """当前角色或所关联演员的有效角度图片，不混入历史生成候选。"""
    file_id: str
    image_id: int
    source_type: Literal['character', 'actor']
    source_id: str
    view_angle: str
    label: str


class CharacterAngleGroup(BaseModel):
    """按镜头关联的角色组织定妆图与演员基准，来源明确且由用户选用。"""
    character_id: str
    name: str
    actor_name: str | None = None
    appearance_id: str | None = None
    appearance_name: str | None = None
    views: list[CharacterAngleView] = Field(default_factory=list)
