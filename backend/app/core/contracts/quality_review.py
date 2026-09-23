"""预检复用及提示词调整契约；结果属于业务面板，不写入任务中心摘要。"""
from datetime import datetime
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.contracts.media import VideoSubjectMediaReference

ReviewScope = Literal['video', 'first', 'key', 'last']
ReviewHistoryScope = Literal['video', 'first', 'key', 'last', 'legacy']


class ReviewGenerationContext(BaseModel):
    """被检查的图片/视频输入版本；预检文本模型与目标生成模型严格分开。"""
    model_config = ConfigDict(extra='forbid')
    shot_id: str | None = None
    draft_prompt: str | None = None
    stage: Literal['before', 'after'] = 'before'
    output_file_id: str | None = None
    source_fingerprint: str | None = None
    model_revision_id: str | None = None
    reference_mode: str = 'text_only'
    subjects: list[VideoSubjectMediaReference] = Field(default_factory=list, max_length=9)
    image_file_ids: list[str] = Field(default_factory=list, max_length=50)
    ratio: str | None = None
    seconds: int | None = None
    resolution: str | None = None
    generate_audio: bool | None = None


class QualityReviewRequest(BaseModel):
    """显式提交一次预检或基于已保存建议调整，不因读取历史产生模型调用。"""
    model_config = ConfigDict(extra='forbid')
    model_id: str
    prompt: str = Field(min_length=1, max_length=100000)
    external_and_billing_confirmed: Literal[True]
    retry_request_id: str | None = Field(default=None, min_length=16, max_length=64, pattern=r'^[a-zA-Z0-9_-]+$')
    image_file_ids: list[str] = Field(default_factory=list, max_length=4)
    generation_context: ReviewGenerationContext | None = None
    scope: ReviewScope = 'video'
    action: Literal['review', 'revise', 'review_and_revise'] = 'review'
    source_task_id: str | None = None
    reference_report_task_id: str | None = None
    user_constraints: str = Field(default='', max_length=10000)

    @model_validator(mode='after')
    def require_source(self):
        """调整必须关联成功的已保存预检，不接收伪造的前端报告。"""
        if self.action == 'revise' and not self.source_task_id:
            raise ValueError('智能调整需要选择已有预检记录')
        if self.generation_context and self.generation_context.stage == 'after':
            if self.scope == 'video' or not self.generation_context.output_file_id:
                raise ValueError('生成后图片检查必须指定帧用途及具体图片版本')
            if self.generation_context.output_file_id not in self.image_file_ids:
                raise ValueError('生成后检查必须实际发送被检查图片')
        return self


class PromptRevisionResult(BaseModel):
    """可应用的完整提示词与变更解释；无法靠文本解决的问题单独保留。"""
    model_config = ConfigDict(extra='forbid')
    revised_prompt: str = Field(min_length=1, max_length=100000)
    changes: list[str] = Field(default_factory=list, max_length=50)
    unresolved: list[str] = Field(default_factory=list, max_length=50)


class ReviewApplication(BaseModel):
    """明确应用到生成草稿的持久记录；不等同已生成视频。"""
    prompt: str
    before_prompt: str
    image_file_ids: list[str]
    generation_context: ReviewGenerationContext | None = None
    applied_at: str
    active: bool = True


class ApplyReviewRevisionRequest(BaseModel):
    """记录用户应用的具体文本与参考上下文，不自动生成媒体。"""
    model_config = ConfigDict(extra='forbid')
    prompt: str = Field(min_length=1, max_length=100000)
    generation_context: ReviewGenerationContext
    before_prompt: str = Field(min_length=1, max_length=100000)
    image_file_ids: list[str] = Field(default_factory=list, max_length=50)


class QualityReviewRecord(BaseModel):
    """只返回业务所需字段，禁止直接外传凭据、内部端点或完整任务payload。"""
    task_id: str
    status: str
    created_at: datetime
    action: str
    scope: str
    generation_context: ReviewGenerationContext | None = None
    prompt: str
    image_file_ids: list[str]
    model_id: str | None = None
    model_name: str = ''
    generation_model_name: str = ''
    source_task_id: str | None = None
    reference_report_task_id: str | None = None
    text: str = ''
    error: str = ''
    revision: PromptRevisionResult | None = None
    application: ReviewApplication | None = None
    source_fingerprint: str | None = None
    optimization_status: str | None = None
    optimization_task_id: str | None = None


class QualityReviewHistory(BaseModel):
    """按镜头分页读取持久化记录，不调用外部模型。"""
    items: list[QualityReviewRecord]
    active_tasks: list[QualityReviewRecord] = Field(default_factory=list, description="同用途执行中任务，与可复用成功历史分开")
    total: int
    page: int
    page_size: int
    latest_applied: QualityReviewRecord | None = None


class FrameReviewCheckRequest(BaseModel):
    """免费本地检查仅接受当前帧输入，不创建任务或调用供应商。"""
    scope: Literal['first', 'key', 'last']
    prompt: str = ''
    generation_context: ReviewGenerationContext
