"""Versioned, non-billable quality evidence shared by frame and video rendering."""
from typing import Literal
from pydantic import BaseModel, Field


class QualityFact(BaseModel):
    """A supplied fact with its source; never an invented measurement or visual finding."""
    source: str
    text: str


class QualityRule(BaseModel):
    """An applicable generation instruction, distinct from factual evidence."""
    id: str
    instruction: str
    sources: list[str] = Field(default_factory=list)


class GenerationQualityReport(BaseModel):
    """Deterministic checks are explicitly not AI/visual verification."""
    version: str = 'shot-quality-v1'
    mode: Literal['deterministic'] = 'deterministic'
    facts: list[QualityFact] = Field(default_factory=list)
    rules: list[QualityRule] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    visual_verified: bool = False


class ExecutionQualityTrace(BaseModel):
    """Record rules actually present at submission, not an unverified preview report."""
    version: str = 'shot-quality-v1'
    execution_prompt_sha256: str
    rules: list[QualityRule] = Field(default_factory=list)
    visual_verified: Literal[False] = False
    evidence_scope: Literal['final_execution_prompt'] = 'final_execution_prompt'


class QualitySourceSnapshot(BaseModel):
    """Typed local source identity and content version; offsets use Python character indices."""
    kind: str
    entity_id: str
    field: str
    text: str | None = None
    content_sha256: str
    literal_in_prompt: bool | None = None
    excerpt_start: int | None = None
    excerpt_end: int | None = None


class QualitySourceBundle(BaseModel):
    """Submission-time evidence, explicitly not a verified preview or semantic audit."""
    version: str = 'local-sources-v1'
    sources: list[QualitySourceSnapshot] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
