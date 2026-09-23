"""跨层创作设定契约：分类与叙事分离，稀疏字段表示显式覆盖。"""
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator, field_validator

CreativeScope = Literal['global', 'project', 'chapter', 'shot', 'actor', 'character', 'scene', 'prop', 'costume', 'lab']
TREATMENTS = {
    '真人写实': ['影视写实', '复古胶片', '风格化写实'],
    '动漫': ['2D动画', '3D动画', '2D国漫', '3D国漫', '水墨动画', '漫画插画', 'Q版卡通'],
}
GENRES = ['都市生活', '古装历史', '武侠江湖', '仙侠', '玄幻修真', '东方神话', '科幻未来', '末世生存', '悬疑探案', '年代生活']
TAGS = ['穿越', '重生', '逆袭', '成长', '爱情', '喜剧', '悬疑']
FIELD_LABELS = {'presentation': '表现形式', 'treatment': '画面风格', 'primary_genre': '主题材',
    'secondary_genres': '辅助题材', 'narrative_tags': '叙事标签', 'era': '时代', 'geography': '地域',
    'world_rules': '世界规则', 'art_constraints': '美术约束', 'reference_file_ids': '设定参考文件', 'general_rules': '通用质量规则'}

class CreativeFields(BaseModel):
    """省略=继承；显式null/空列表=清空，不把空值重新回填成父级。"""
    model_config = ConfigDict(extra='forbid')
    presentation: Literal['真人写实', '动漫'] | None = None
    treatment: str | None = Field(default=None, max_length=40)
    primary_genre: str | None = Field(default=None, max_length=40)
    secondary_genres: list[str] | None = Field(default=None, max_length=4)
    narrative_tags: list[str] | None = Field(default=None, max_length=10)
    era: str | None = Field(default=None, max_length=200)
    geography: str | None = Field(default=None, max_length=200)
    world_rules: str | None = Field(default=None, max_length=3000)
    art_constraints: str | None = Field(default=None, max_length=3000)
    reference_file_ids: list[str] | None = Field(default=None, max_length=12)
    general_rules: str | None = Field(default=None, max_length=3000)

    @field_validator('treatment','primary_genre','era','geography','world_rules','art_constraints','general_rules',mode='before')
    @classmethod
    def trim_text(cls, value):
        """空白不冒充有效填写，保留null作为显式清空。"""
        return value.strip() or None if isinstance(value,str) else value

    @field_validator('secondary_genres','narrative_tags',mode='before')
    @classmethod
    def trim_choices(cls, value):
        """拒绝空标签与重复项，不让重复内容放大提示词权重。"""
        if value is None or not isinstance(value,list) or not all(isinstance(item,str) for item in value): return value
        result=[item.strip() if isinstance(item,str) else item for item in value]
        if any(not item for item in result) or len(result)!=len(set(result)):
            raise ValueError('多选项不能重复或为空')
        return result

    @model_validator(mode='after')
    def validate_catalog(self):
        """拒绝未知画风/题材及不兼容组合，自定义仅用于标签和描述。"""
        if self.treatment and self.treatment not in sum(TREATMENTS.values(), []):
            raise ValueError('未知画面风格')
        if self.presentation and self.treatment and self.treatment not in TREATMENTS[self.presentation]:
            raise ValueError('画面风格与表现形式不匹配')
        if self.primary_genre and self.primary_genre not in GENRES:
            raise ValueError('未知主题材')
        if any(x not in GENRES for x in self.secondary_genres or []):
            raise ValueError('未知辅助题材')
        if any(not x.strip() or len(x) > 40 for x in self.narrative_tags or []):
            raise ValueError('叙事标签需为1至40字')
        if self.primary_genre and self.primary_genre in (self.secondary_genres or []):
            raise ValueError('辅助题材不能重复主题材')
        return self

class CreativeWrite(BaseModel):
    """整份替换本层覆盖，版本检查防止另一页面的旧值覆盖新值。"""
    model_config = ConfigDict(extra='forbid')
    expected_revision: int = Field(ge=0)
    overrides: CreativeFields = Field(default_factory=CreativeFields)
    project_id: str | None = Field(default=None, max_length=64)

class CreativeRead(BaseModel):
    """返回本层和实际生效值、逐字段来源及差异警告。"""
    scope: CreativeScope
    entity_id: str
    revision: int
    overrides: dict
    inherited: dict = Field(default_factory=dict)
    effective: dict
    sources: dict
    appearances: dict = Field(default_factory=dict)
    fingerprint: str
    warnings: list[str] = Field(default_factory=list)
    provenance: dict = Field(default_factory=dict)
    project_id: str | None = None

class CreativeCatalog(BaseModel):
    """前后端共享目录，不由模型名称推断题材能力。"""
    treatments: dict[str, list[str]]
    genres: list[str]
    narrative_tags: list[str]
    field_labels: dict[str, str]
    presets: dict[str, dict]


class CreativePromptInput(BaseModel):
    """免费预览本次最终创作上下文，不保存、不发起模型任务。"""
    prompt: str = Field(default='', max_length=200000)
    purpose: Literal['asset','frame','video','script']

class CreativePromptRead(BaseModel):
    """绑定设定版本的最终提示词及本地警告。"""
    prompt: str
    direction: CreativeRead

class TemplateContextInput(BaseModel):
    """免费试渲染已保存模板，显式区分上下文与手工试填变量。"""
    template_id: str
    scope: CreativeScope
    entity_id: str
    variables: dict[str, str] = Field(default_factory=dict)

class TemplateContextRead(CreativePromptRead):
    """返回实际模板版本、变量和缺项，不冒充已经提交的生成任务。"""
    template_version: int
    variables: dict[str, str]
    missing: list[str]

class CreativeContextOption(BaseModel):
    """选择具体业务对象，避免用户填写内部ID。"""
    value: str
    label: str
