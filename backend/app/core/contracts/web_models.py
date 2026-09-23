"""Website model policy and readiness; editing policy never attests a browser capability."""
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class WebModelPolicy(BaseModel):
    """Maintain a visible name and optional account exclusions, without invented balances."""
    model_config = ConfigDict(extra='forbid')
    name: str = Field(min_length=1, max_length=100)
    enabled: bool = True
    is_default: bool = False
    note: str = Field(default='', max_length=500)
    excluded_account_ids: list[str] = Field(default_factory=list, max_length=200)

    @field_validator('name')
    @classmethod
    def nonblank(cls, value):
        """Canonicalize outer whitespace so duplicate names cannot evade policy."""
        if not value.strip(): raise ValueError('官网模型名称不能为空')
        return value.strip()

    @model_validator(mode='after')
    def valid_default(self):
        """A disabled model cannot remain a default selection."""
        if self.is_default and not self.enabled: raise ValueError('停用模型不能设为默认')
        if len(set(self.excluded_account_ids)) != len(self.excluded_account_ids): raise ValueError('账号不能重复')
        return self


class WebCatalogWrite(BaseModel):
    """Compare-and-swap catalog edits avoid silently overwriting another settings page."""
    expected_revision: int = Field(ge=0)
    models: list[WebModelPolicy] = Field(max_length=200)

    @model_validator(mode='after')
    def unique_names(self):
        """One exact website name and at most one default per platform/modality."""
        if len({m.name.casefold() for m in self.models}) != len(self.models): raise ValueError('模型名称不能重复')
        if sum(m.is_default for m in self.models)>1: raise ValueError('只能设置一个默认模型')
        return self


class WebModelEvidence(WebModelPolicy):
    """Policy, evidence and adapter readiness are deliberately independent."""
    source: str = 'maintained'
    observed_at: str | None = None
    automatic_supported: bool = False


class WebCatalogRead(BaseModel):
    """Read-only merged directory; old successes never re-enable a disabled entry."""
    revision: int = 0
    models: list[WebModelEvidence]
    capabilities_verified: bool = False
    allow_manual_name: bool = True


class WebExecutionRead(BaseModel):
    """Explain each missing prerequisite without locking unrelated work."""
    available: bool
    reasons: list[str]
    eligible_account_ids: list[str] = Field(default_factory=list)
    notices: list[str] = Field(default_factory=list)
    cost_notice: str = '网页权益未实时核实；模型可用不代表免费，不会自动升级会员或切换收费模型。'
