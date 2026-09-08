"""统一附件、音频资产与镜头音轨 API 契约。"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.task_manager.types import TaskStatus
from app.models.types import AudioAssetCategory, ShotAudioTrackType
from app.schemas.studio.files import FileRead


class AssetFileLinkCreate(BaseModel):
    """将已有文件关联为业务资产的可选参考。"""

    file_id: str
    resource_role: str = "attachment"
    sort_index: int = 0
    is_primary: bool = False
    enabled: bool = True
    note: str = ""


class AssetFileLinkUpdate(BaseModel):
    """更新参考素材的角色、排序和启用状态。"""

    resource_role: str | None = None
    sort_index: int | None = None
    is_primary: bool | None = None
    enabled: bool | None = None
    note: str | None = None


class AssetFileLinkRead(BaseModel):
    """包含文件元数据的资产附件读取结果。"""

    model_config = ConfigDict(from_attributes=True)

    id: int
    entity_type: str
    entity_id: str
    file_id: str
    resource_role: str
    sort_index: int
    is_primary: bool
    enabled: bool
    note: str
    file: FileRead


class AudioAssetCreate(BaseModel):
    """使用已上传音频创建可复用音频资产。"""

    name: str
    category: AudioAssetCategory
    file_id: str
    description: str = ""
    transcript: str = ""
    tags: list[str] = Field(default_factory=list)
    actor_id: str | None = None
    character_id: str | None = None
    language: str = "zh-CN"
    duration_ms: int | None = Field(None, ge=0)
    project_id: str | None = Field(None, description="可选：同步记录项目素材使用关系")


class AudioAssetUpdate(BaseModel):
    """更新音频资产业务元信息；文件本身保持不可变。"""

    name: str | None = None
    category: AudioAssetCategory | None = None
    description: str | None = None
    transcript: str | None = None
    tags: list[str] | None = None
    actor_id: str | None = None
    character_id: str | None = None
    language: str | None = None
    duration_ms: int | None = Field(None, ge=0)


class AudioAssetRead(BaseModel):
    """音频资产及其底层文件。"""

    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    category: AudioAssetCategory
    file_id: str
    description: str
    transcript: str
    tags: list[str]
    actor_id: str | None
    character_id: str | None
    language: str
    duration_ms: int | None
    file: FileRead
    usage_count: int = 0


class ShotAudioTrackCreate(BaseModel):
    """把音频资产作为可选音轨加入镜头。"""

    audio_asset_id: str
    dialog_line_id: int | None = None
    track_type: ShotAudioTrackType
    start_ms: int = Field(0, ge=0)
    end_ms: int | None = Field(None, ge=0)
    volume: float = Field(1.0, ge=0, le=2)
    fade_in_ms: int = Field(0, ge=0)
    fade_out_ms: int = Field(0, ge=0)
    loop: bool = False
    sort_index: int = 0

    @model_validator(mode="after")
    def validate_range(self):
        """结束时间若存在必须晚于开始时间。"""
        if self.end_ms is not None and self.end_ms <= self.start_ms:
            raise ValueError("end_ms must be greater than start_ms")
        return self


class ShotAudioTrackUpdate(BaseModel):
    """调整镜头音轨的位置、音量与淡入淡出。"""

    dialog_line_id: int | None = None
    track_type: ShotAudioTrackType | None = None
    start_ms: int | None = Field(None, ge=0)
    end_ms: int | None = Field(None, ge=0)
    volume: float | None = Field(None, ge=0, le=2)
    fade_in_ms: int | None = Field(None, ge=0)
    fade_out_ms: int | None = Field(None, ge=0)
    loop: bool | None = None
    sort_index: int | None = None


class ShotAudioTrackRead(BaseModel):
    """镜头音轨及可直接试听的音频资产。"""

    model_config = ConfigDict(from_attributes=True)

    id: int
    shot_id: str
    audio_asset_id: str
    dialog_line_id: int | None
    track_type: ShotAudioTrackType
    start_ms: int
    end_ms: int | None
    volume: float
    fade_in_ms: int
    fade_out_ms: int
    loop: bool
    sort_index: int
    audio_asset: AudioAssetRead


class ShotTtsTaskCreate(BaseModel):
    """从镜头对白创建可追踪的 AI 配音任务。"""

    model_id: str | None = Field(None, description="语音模型 ID；为空时使用默认语音模型")
    text: str | None = Field(None, max_length=5000, description="可选覆盖文本；为空时按顺序合并镜头对白")
    voice: str | None = Field(None, max_length=128, description="音色；为空时使用模型参数 voice")
    instruction: str | None = Field(None, max_length=500, description="可选语气、语速或情绪指令")
    language_type: str = Field("Chinese", max_length=64)


class ShotTtsTaskRead(BaseModel):
    """AI 配音异步任务创建结果。"""

    task_id: str
    status: TaskStatus
    reused: bool = False
