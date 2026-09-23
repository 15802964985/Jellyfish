"""Read-only business scenario recommendations; never a billing authorization."""
from pydantic import BaseModel, Field
from typing import Literal


class ScenarioModelChoice(BaseModel):
    """A saved model matched against the actual backend capability and configuration."""
    model_id: str
    model_name: str
    provider_name: str
    provider_key: str
    eligible: bool
    reasons: list[str] = Field(default_factory=list)
    official_documentation: str | None = None
    quota_status: str = "unknown"
    verification: str = "代码能力判断，非真实账户验收"


class ModelScenarioRead(BaseModel):
    """Scenario requirements, explanatory guidance and current account candidates."""
    key: str
    title: str
    requirement: str
    guidance: str
    choices: list[ScenarioModelChoice] = Field(default_factory=list)


class ModelOverviewConfiguration(BaseModel):
    """One saved configuration; multiple accounts never masquerade as a single verified model."""
    model_id: str
    provider_id: str
    provider_name: str
    status: Literal["configured", "needs_attention"]
    reasons: list[str] = Field(default_factory=list)
    verification: str = "未提供当前配置的真实生成验收证据"


class ModelModeContract(BaseModel):
    """Separate local execution support from official source coverage for one operation."""
    key: str
    title: str
    implementation: Literal["integrated", "unverified"]
    requirement: str
    reason: str
    parameters: dict = Field(default_factory=dict)
    evidence_status: Literal["model_source_bound", "protocol_only", "missing"]
    source_url: str | None = None
    verification: str = "来源绑定不代表文档所有参数已核验；账户调用与质量需另行验收"


class ModelOverviewItem(BaseModel):
    """A catalogue or saved model, separating execution support from account setup."""
    key: str
    provider_key: str
    provider_name: str
    model_name: str
    category: Literal["text", "image", "video", "audio"]
    integration: Literal["integrated", "unverified"]
    configuration_status: Literal["configured", "needs_attention", "not_configured"]
    mode_contracts: list[ModelModeContract] = Field(default_factory=list)
    scenario_keys: list[str] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    configurations: list[ModelOverviewConfiguration] = Field(default_factory=list)
    provider_ids: list[str] = Field(default_factory=list)
    official_documentation: str | None = None
    verification: str = "代码接入核对，不代表账户权限、额度或出片质量验收"


class ModelOverviewRead(BaseModel):
    """Read-only catalogue and scenario definitions for the selection drawer."""
    models: list[ModelOverviewItem] = Field(default_factory=list)
    scenarios: list[ModelScenarioRead] = Field(default_factory=list)
    notices: list[str] = Field(default_factory=list)
