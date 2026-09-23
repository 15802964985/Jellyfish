"""统一生成编排的外部请求、内部命令与冻结快照契约。"""

from __future__ import annotations

from enum import Enum
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.contracts.media import ImageMediaInput, VideoMediaInput, VideoEditMediaInput
from app.core.contracts.generation_quality import ExecutionQualityTrace, QualitySourceBundle
from app.core.contracts.text_generation import ScriptOperationInput, TextChatInput


class GenerationModality(str, Enum):
    """生成结果的模态。"""

    text = "text"
    image = "image"
    video = "video"


class GenerationDelivery(str, Enum):
    """调用方接收生成结果的固定交付协议。"""

    inline = "inline"
    streaming = "streaming"
    async_polling = "async_polling"


class GenerationTargetKind(str, Enum):
    """受信任业务目标的封闭集合。"""

    experiment_session = "experiment_session"
    asset_image_slot = "asset_image_slot"
    shot_frame_slot = "shot_frame_slot"
    shot_video = "shot_video"
    shot_video_edit = "shot_video_edit"
    shot_detail = "shot_detail"
    script_processing = "script_processing"


class GenerationOperation(str, Enum):
    """由路由 Binder 派生的生成 operation。"""

    text_chat = "text_chat"
    text_agent = "text_agent"
    image_generation = "image_generation"
    video_generation = "video_generation"
    video_edit = "video_edit"
    quality_preflight = 'quality_preflight'


class GenerationTarget(BaseModel):
    """仅内部命令使用的可信业务目标。"""

    model_config = ConfigDict(extra="forbid")

    kind: GenerationTargetKind
    entity_id: str = Field(min_length=1)
    slot_id: str | None = None


class ImageEditRegion(BaseModel):
    """Normalized rectangle on the original image; output outside it is locally preserved."""
    model_config = ConfigDict(extra="forbid")
    x: float = Field(ge=0, lt=1, allow_inf_nan=False)
    y: float = Field(ge=0, lt=1, allow_inf_nan=False)
    width: float = Field(gt=0, le=1, allow_inf_nan=False)
    height: float = Field(gt=0, le=1, allow_inf_nan=False)

    @model_validator(mode="after")
    def within_image(self):
        """Reject rectangles extending beyond the source instead of silently clipping."""
        if self.x + self.width > 1.000001 or self.y + self.height > 1.000001:
            raise ValueError("局部修正范围超出原图")
        return self


class ImageGenerationOperationInput(BaseModel):
    """图片 operation 的可执行参数，不承载媒体 URL 或业务目标。"""

    model_config = ConfigDict(extra="forbid")

    kind: Literal["image_generation"] = "image_generation"
    target_ratio: str | None = None
    size: str | None = Field(default=None, max_length=32)
    resolution_profile: str | None = None
    count: int = Field(default=1, ge=1, le=10)
    edit_region: ImageEditRegion | None = None


class VideoGenerationOperationInput(BaseModel):
    """视频 operation 的可执行参数，不承载媒体 URL 或业务目标。"""

    model_config = ConfigDict(extra="forbid")

    kind: Literal["video_generation"] = "video_generation"
    ratio: str
    resolution: str | None = Field(default=None, max_length=32)
    generate_audio: bool | None = Field(default=None, description="仅支持原生有声生成的模型可配置")
    seconds: int | None = Field(default=None, ge=1)
    seed: int | None = None


class VideoEditOperationInput(BaseModel):
    """Explicit editing consent and preserve instructions; no automatic crop or adoption."""
    model_config = ConfigDict(extra='forbid')
    kind: Literal['video_edit'] = 'video_edit'
    client_request_id: str = Field(min_length=16, max_length=64, pattern=r'^[a-zA-Z0-9_-]+$')
    preserve_instructions: str = ''
    keep_audio: bool = True
    resolution: str | None = None
    seconds: int | None = Field(default=None, ge=1, le=30)
    reference_positions: list[Annotated[float, Field(ge=0, allow_inf_nan=False)]] = Field(default_factory=list, max_length=5)
    external_transfer_confirmed: Literal[True]
    billing_confirmed: Literal[True]


TypedOperationInput = Annotated[
    TextChatInput | ScriptOperationInput | ImageGenerationOperationInput | VideoGenerationOperationInput | VideoEditOperationInput,
    Field(discriminator="kind"),
]


class GenerationSubmitRequest(BaseModel):
    """业务路由接收的请求；目标、模态、operation 与 delivery 由路径决定。"""

    model_config = ConfigDict(extra="forbid")

    model_id: str | None = None
    expected_model_revision_id: str | None = None
    execution_prompt: str | None = None
    media: ImageMediaInput | VideoMediaInput | VideoEditMediaInput | None = None
    render_id: str | None = None
    quality_review_task_id: str | None = None
    quality_revision_task_id: str | None = None
    quality_source_fingerprint: str | None = Field(default=None, pattern=r'^[a-f0-9]{64}$')
    quality_review_retry_id: str | None = Field(default=None, min_length=16, max_length=64, pattern=r'^[a-zA-Z0-9_-]+$')
    operation_input: TypedOperationInput

    @model_validator(mode="after")
    def require_prompt_for_prompt_operations(self) -> "GenerationSubmitRequest":
        """单提示词 operation 必须显式冻结最终提示词，聊天与 Agent 不使用伪 prompt。"""
        if isinstance(self.operation_input, (ImageGenerationOperationInput, VideoGenerationOperationInput, VideoEditOperationInput)):
            if not self.execution_prompt or not self.execution_prompt.strip():
                raise ValueError("execution_prompt is required for image and video generation")
        return self


class GenerationCommand(BaseModel):
    """Binder 交给 Submitter 的完整内部命令。"""

    model_config = ConfigDict(extra="forbid")

    modality: GenerationModality
    operation: GenerationOperation
    delivery: GenerationDelivery
    target: GenerationTarget
    request: GenerationSubmitRequest


class ResolvedGenerationSnapshot(BaseModel):
    """Entity Gate 冻结的可序列化执行快照，绝不保存凭据值。"""

    model_config = ConfigDict(extra="forbid")

    model_id: str
    model_revision_id: str
    canonical_target: GenerationTarget
    expected_version_id: int | None = Field(default=None, ge=1)
    media: ImageMediaInput | VideoMediaInput | VideoEditMediaInput | None = None
    operation_input: TypedOperationInput
    execution_prompt: str | None = None
    prompt_profile_rules: list[str] = Field(
        default_factory=list,
        description="提交时实际应用的供应商提示词适配规则，仅保存规则名，不保存凭据",
    )
    credential_ref: str | None = None
    quality_trace: ExecutionQualityTrace | None = None
    quality_sources: QualitySourceBundle | None = None
    prompt_budget: dict | None = None
    cost_estimate: dict | None = None
    creative_direction: dict | None = None
