"""文件素材相关的 Pydantic Schemas。"""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, field_validator


class FileTypeEnum(str, Enum):
    image = "image"
    video = "video"
    audio = "audio"
    document = "document"


class FileBase(BaseModel):
    id: str = Field(..., description="文件 ID")
    type: FileTypeEnum = Field(..., description="文件类型")
    name: str = Field(..., description="文件名/标题")
    thumbnail: str = Field("", description="缩略图 URL/路径")
    tags: list[str] = Field(default_factory=list, description="标签")
    original_name: str = Field("", description="上传时原始文件名")
    mime_type: str = Field("", description="MIME 类型")
    size_bytes: int = Field(0, description="文件大小（字节）")
    duration_ms: int | None = Field(None, description="音视频时长（毫秒）")
    width: int | None = Field(None, description="图片/视频宽度")
    height: int | None = Field(None, description="图片/视频高度")
    checksum: str = Field("", description="SHA-256 校验值")

    @field_validator("original_name", "mime_type", "checksum", mode="before")
    @classmethod
    def normalize_legacy_text_metadata(cls, value: object) -> str:
        """兼容迁移前或未落库 ORM 对象中的空元数据。"""
        return str(value or "")

    @field_validator("size_bytes", mode="before")
    @classmethod
    def normalize_legacy_size_metadata(cls, value: object) -> int:
        """兼容迁移前或未落库 ORM 对象中的空文件大小。"""
        return int(value or 0)


class FileCreate(BaseModel):
    type: FileTypeEnum
    name: str
    thumbnail: str = ""
    tags: list[str] = Field(default_factory=list)


class FileUsageWrite(BaseModel):
    """写入 file_usages 的关联信息（与 FileItem 一并提交）。"""

    project_id: str = Field(..., description="项目 ID")
    chapter_id: str | None = Field(None, description="章节 ID")
    shot_id: str | None = Field(None, description="镜头 ID")
    usage_kind: str = Field(
        ...,
        description="用途：shot_frame / generated_video / character_image / asset_image / upload / api 等",
    )
    source_ref: str | None = Field(None, description="幂等键（可选）")


class FileUsageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    file_id: str
    project_id: str
    chapter_id: str | None
    shot_id: str | None
    usage_kind: str
    source_ref: str

class FileUpdate(BaseModel):
    name: str | None = None
    thumbnail: str | None = None
    tags: list[str] | None = None
    usage: FileUsageWrite | None = Field(None, description="若提供则 upsert 一条 file_usages")


class FileRead(FileBase):
    model_config = ConfigDict(from_attributes=True)


class FileDetailRead(FileRead):
    """含 file_usages 列表（详情接口）。"""

    model_config = ConfigDict(from_attributes=True)

    usages: list[FileUsageRead] = Field(default_factory=list)


class FileReferenceGroup(BaseModel):
    """某类业务引用的计数与可定位明细，不包含任务或配置原文。"""

    kind: str
    label: str
    count: int
    items: list[str] = Field(default_factory=list, description="最多20条关联定位信息")


class FileDeleteImpactRead(BaseModel):
    """删除前关联检查结果；删除请求仍需重新核对。"""

    file_id: str
    can_delete: bool
    reference_count: int
    groups: list[FileReferenceGroup] = Field(default_factory=list)
