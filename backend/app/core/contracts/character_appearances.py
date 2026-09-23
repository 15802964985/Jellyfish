"""造型版本的跨层契约，版本创建后不可改写，只能另存新版。"""
from pydantic import BaseModel, Field, ConfigDict
from typing import Literal
from app.core.contracts.creative_direction import CreativeFields

class AppearanceView(BaseModel):
    """版本中明确保存的图片与角度，文件保持不可变引用。"""
    file_id: str
    view_angle: Literal['FRONT','LEFT','RIGHT','BACK','THREE_QUARTER','TOP','DETAIL'] = 'FRONT'

class AppearanceCreate(BaseModel):
    """显式保存造型；省略图片时快照当前已采用角色图，空列表则不复制。"""
    model_config = ConfigDict(extra='forbid')
    name: str = Field(min_length=1,max_length=120)
    description: str = Field(default='',max_length=5000)
    costume_id: str | None = None
    creative_direction: CreativeFields = Field(default_factory=CreativeFields)
    views: list[AppearanceView] | None = Field(default=None,max_length=8)

class AppearanceRead(BaseModel):
    """只读造型快照，身份始终引用原角色ID。"""
    id: str
    character_id: str
    version: int
    name: str
    data: dict

class AppearanceSelection(BaseModel):
    """显式选择造型，null恢复当前定妆；旧选择校验防止并发覆盖。"""
    appearance_id: str | None = None
    expected_appearance_id: str | None = None
