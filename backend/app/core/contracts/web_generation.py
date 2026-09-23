"""网页生成的受控输入；不借用官方API模型标识或凭据。"""
from typing import Literal
from app.core.contracts.media import MediaReference
from app.core.contracts.generation import ImageEditRegion
from app.core.contracts.web_platforms import WebPlatform
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

class WebGenerationRequest(BaseModel):
    """冻结单个图片槽位和有序参考，客户端请求号保证重传不重复提交。"""
    model_config = ConfigDict(extra='forbid')
    account_id: str | None = Field(default=None,min_length=1,max_length=64,pattern=r'^[a-zA-Z0-9_-]+$')
    platform: WebPlatform = 'doubao'
    execution_mode: Literal['browser','manual'] = 'browser'
    requested_model: str = Field(default='Seedream 4.5',min_length=1,max_length=100)
    request_id: str = Field(pattern=r'^[a-zA-Z0-9_-]{16,64}$')
    prompt: str = Field(min_length=1,max_length=12000)
    reference_file_ids: list[str] = Field(default_factory=list,max_length=10)
    external_transfer_confirmed: Literal[True]

    @field_validator('requested_model')
    @classmethod
    def model_nonblank(cls,value):
        """Freeze the visible website model name without accepting whitespace."""
        if not value.strip(): raise ValueError('请选择网页实际模型')
        return value.strip()

    @field_validator('prompt')
    @classmethod
    def nonblank(cls,value):
        """Reject whitespace without rewriting the user's final prompt."""
        if not value.strip(): raise ValueError('提示词不能为空')
        return value

    @field_validator('reference_file_ids')
    @classmethod
    def distinct(cls,value):
        """Preserve order while rejecting duplicate or empty references."""
        if len(set(value))!=len(value) or any(not item.strip() for item in value):
            raise ValueError('参考图片不能重复或为空')
        return value

class WebImageRequest(WebGenerationRequest):
    """Freeze an image slot independently from shot video versions."""
    target_type: Literal['actor','character','scene','prop','costume','frame','lab_image']
    entity_id: str = Field(min_length=1,max_length=64)
    edit_region: ImageEditRegion | None = None
    slot_id: int | None = Field(default=None,ge=1)
    expected_version: int = Field(ge=1)

    @model_validator(mode='after')
    def image_target_slot(self):
        """Lab results append to a session; asset and frame results require an actual slot."""
        if self.edit_region and (self.execution_mode!='manual' or len(self.reference_file_ids)!=1):raise ValueError('网页局部修正需人工交接并指定唯一原图')
        if self.target_type!='lab_image' and self.slot_id is None:raise ValueError('资产和关键帧必须指定图片槽位')
        return self


class WebSubjectGroup(BaseModel):
    """Keep multiple views/media explicitly assigned to one subject during manual handoff."""
    model_config=ConfigDict(extra='forbid')
    name: str = Field(min_length=1,max_length=100)
    media: list[MediaReference] = Field(min_length=1,max_length=10)

    @model_validator(mode='after')
    def require_files(self):
        """Subject handoff only accepts library files, never arbitrary URLs or blank names."""
        if not self.name.strip() or any(not item.file_id for item in self.media):raise ValueError('主体必须有名称和有效文件')
        return self


class WebVideoRequest(WebGenerationRequest):
    """Web video input carries explicit reference roles and actual chosen specifications."""
    requested_model: str = Field(min_length=1,max_length=100)
    target_type: Literal['shot','lab_video','shot_edit'] = 'shot'
    entity_id: str = Field(min_length=1,max_length=64)
    expected_version: int = Field(ge=1)
    duration_seconds: int = Field(ge=1,le=120)
    aspect_ratio: str = Field(pattern=r'^[0-9]{1,2}:[0-9]{1,2}$')
    resolution: str | None = Field(default=None,min_length=1,max_length=40)
    subject_groups: list[WebSubjectGroup] = Field(default_factory=list,max_length=5)
    source_video_file_id: str | None = Field(default=None,min_length=1,max_length=64)
    preserve_instructions: str = Field(default='',max_length=4000)
    keep_audio: bool = True
    reference_mode: Literal['text','first_frame','first_last_frames','reference_images','subjects']

    @model_validator(mode='after')
    def reference_roles(self):
        """Frame roles must agree with the frozen image count; never infer extra frames."""
        if any(int(part)==0 for part in self.aspect_ratio.split(':')): raise ValueError('画幅比例必须大于零')
        if (self.target_type=='shot_edit') != bool(self.source_video_file_id): raise ValueError('视频编辑必须携带原视频，其他入口不能携带编辑原片')
        if bool(self.subject_groups)!=(self.reference_mode=='subjects'):raise ValueError('主体参考模式与分组内容不一致')
        if len({group.name.strip() for group in self.subject_groups})!=len(self.subject_groups):raise ValueError('不同主体必须使用不同名称')
        count=len(self.reference_file_ids)
        expected={'text':0,'first_frame':1,'first_last_frames':2}.get(self.reference_mode)
        if expected is not None and count!=expected: raise ValueError('Reference mode and image count do not match')
        if self.reference_mode=='reference_images' and not count: raise ValueError('Reference images are required')
        return self


class WebTaskRead(BaseModel):
    """轻量后台任务与业务回填状态；不包含浏览器Cookie或租约密钥。"""
    task_id: str
    status: str
    stage: str
    error: str = ''
    result: dict | None = None

class WebRunnerUpdate(BaseModel):
    """执行器报告已核对的网页阶段，不能据此伪造成功产物。"""
    binding_version: Literal[1,2] = 1
    user_message_id: str | None = Field(default=None,max_length=128)
    stage: Literal['preparing','submitting','submitted','needs_user','submission_unknown','downloading','awaiting_user']
    conversation_url: str | None = Field(default=None,max_length=2000)
    message_id: str | None = Field(default=None,max_length=200)
    reason: str = Field(default='',max_length=500)
    paused: bool = False
    recovery_epoch: int = Field(default=0,ge=0)


class WebRecoveryRequest(BaseModel):
    """Compare the pause version so a delayed recovery click cannot restart another pause."""
    expected_recovery_epoch: int = Field(ge=0)


class WebAccountReadiness(BaseModel):
    """Typed explanation shared by account and generation views; no credentials or business payload."""
    code: str
    reason: str
    action: str
    blocking: bool


class WebAccountWrite(BaseModel):
    """Maintain a local account alias; browser login credentials never enter this DTO."""
    model_config = ConfigDict(extra='forbid')
    display_name: str = Field(min_length=1,max_length=120)
    platform: WebPlatform = 'doubao'
    enabled: bool = True


class WebAccountRead(BaseModel):
    """Show actual pairing/availability without exposing the local profile identity."""
    id: str
    display_name: str
    platform: str
    enabled: bool
    session_state: str
    supported_models: list[str]
    supported_video_models: list[str] = Field(default_factory=list)
    online: bool
    observed_at: str | None = None
    active_task_id: str | None = None
    readiness: WebAccountReadiness | None = None


class WebAccountHeartbeat(BaseModel):
    """Only the authenticated local executor can attest observed session capabilities."""
    profile_key: str = Field(pattern=r'^[a-zA-Z0-9_-]{16,64}$')
    session_state: Literal['ready','signed_in','needs_login','needs_verification','limited','offline']
    supported_models: list[str] = Field(default_factory=list,max_length=20)


class WebHandoffReceipt(BaseModel):
    """Explicit human attestation binds a platform original to one frozen task."""
    model_config=ConfigDict(extra='forbid')
    input_fingerprint: str = Field(pattern=r'^[a-f0-9]{64}$')
    conversation_url: str = Field(min_length=1,max_length=2000)
    message_id: str = Field(min_length=1,max_length=200)
    observed_model: str = Field(min_length=1,max_length=100)
    account_and_input_confirmed: Literal[True]
    original_download_confirmed: Literal[True]
    watermark: Literal['unknown','visible','official_clean'] = 'unknown'
    export_evidence: str = Field(default='',max_length=1000)

    @model_validator(mode='after')
    def clean_requires_evidence(self):
        """Do not turn an unchecked original into a claimed watermark-free export."""
        if self.watermark=='official_clean' and not self.export_evidence.strip():
            raise ValueError('请注明官网无水印导出的依据，例如页面下载选项；不代表公开发布授权')
        return self


class WebOfficialExportRequest(BaseModel):
    """Import a new official download for the same result without regenerating media."""
    request_id: str = Field(pattern=r'^[a-zA-Z0-9_-]{16,64}$')
    source_file_id: str = Field(min_length=1,max_length=64)
    conversation_url: str = Field(min_length=1,max_length=2000)
    message_id: str = Field(min_length=1,max_length=200)
    export_evidence: str = Field(min_length=1,max_length=1000)
    same_result_confirmed: Literal[True]


class WebHandoffProgress(BaseModel):
    """Persist that the user has submitted on the platform, without inventing a result."""
    input_fingerprint: str = Field(pattern=r'^[a-f0-9]{64}$')
    stage: Literal['submitted','submission_unknown']

class WebUnsentRelease(BaseModel):
    """Account release is allowed only after explicit confirmation of no remote submission."""
    not_submitted_confirmed: Literal[True]


class WebExportAdoption(BaseModel):
    """Adopt a verified candidate using the user's observed current version/file as a CAS guard."""
    expected_version: int = Field(ge=1)
    expected_current_file_id: str | None = Field(default=None,max_length=128)


class WebBatchRequest(BaseModel):
    """Freeze independently identifiable business tasks in one atomic handoff batch."""
    model_config=ConfigDict(extra='forbid')
    items: list[WebImageRequest|WebVideoRequest] = Field(min_length=1,max_length=50)


class WebDesktopLaunch(BaseModel):
    """Request a fixed local account operation, never a command line or arbitrary URL."""
    model_config=ConfigDict(extra='forbid')
    action: Literal['login','runner']
    request_id: str = Field(pattern=r'^[a-zA-Z0-9_-]{16,64}$')

class WebDesktopCommand(BaseModel):
    """Account-specific launch state is separate from platform login and model capabilities."""
    command_id: str
    account_id: str
    platform: WebPlatform
    action: Literal['login','runner']
    state: Literal['queued','starting','opened','closed','failed']
    message: str = ''

class WebDesktopStatus(BaseModel):
    """Report local helper availability without exposing its authentication secret."""
    online: bool
    observed_at: str | None = None
    commands: list[WebDesktopCommand] = Field(default_factory=list)

class WebDesktopReport(BaseModel):
    """A paired host reports only operations previously claimed by that host."""
    command_id: str = Field(pattern=r'^[a-f0-9]{32}$')
    state: Literal['opened','closed','failed']
    message: str = Field(default='',max_length=300)

class WebDesktopPoll(BaseModel):
    """Outbound-only helper heartbeat and bounded command acknowledgements."""
    model_config=ConfigDict(extra='forbid')
    host_id: str = Field(pattern=r'^[a-f0-9]{32}$')
    reports: list[WebDesktopReport] = Field(default_factory=list,max_length=100)
