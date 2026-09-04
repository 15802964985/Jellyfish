"""Structured output for evidence-grounded script import analysis."""

from typing import Literal

from pydantic import BaseModel, Field


class ScriptEvidence(BaseModel):
    block_id: str
    quote: str = Field(max_length=300)


class ScriptProjectBrief(BaseModel):
    title: str | None = None
    logline: str | None = None
    genre: str | None = None
    visual_style: str | None = None
    audience: str | None = None
    aspect_ratio: str | None = None
    target_duration_seconds: float | None = Field(default=None, ge=0)
    narrative_rules: list[str] = Field(default_factory=list)
    evidence: list[ScriptEvidence] = Field(default_factory=list)
    confidence: float = Field(default=0.5, ge=0, le=1)
    source_kind: Literal["explicit", "inferred", "suggested"] = "inferred"


class ScriptEntityCandidate(BaseModel):
    candidate_id: str
    entity_type: Literal["actor", "character", "scene", "prop", "costume"]
    name: str
    description: str = ""
    aliases: list[str] = Field(default_factory=list)
    chapter_indexes: list[int] = Field(default_factory=list)
    attributes: dict[str, str] = Field(default_factory=dict)
    evidence: list[ScriptEvidence] = Field(default_factory=list)
    confidence: float = Field(default=0.5, ge=0, le=1)
    source_kind: Literal["explicit", "inferred", "suggested"] = "inferred"


class ScriptShotCandidate(BaseModel):
    candidate_id: str
    chapter_index: int = Field(ge=1)
    index: int = Field(ge=1)
    title: str
    duration_seconds: float | None = Field(default=None, gt=0)
    scene: str = ""
    action: str = ""
    camera: str = ""
    visual_prompt_hint: str = ""
    character_names: list[str] = Field(default_factory=list)
    prop_names: list[str] = Field(default_factory=list)
    costume_names: list[str] = Field(default_factory=list)
    evidence: list[ScriptEvidence] = Field(default_factory=list)
    confidence: float = Field(default=0.5, ge=0, le=1)
    source_kind: Literal["explicit", "inferred", "suggested"] = "inferred"


class ScriptAudioCandidate(BaseModel):
    candidate_id: str
    audio_type: Literal["dialogue", "voiceover", "sfx", "bgm", "subtitle", "silence"]
    chapter_index: int | None = Field(default=None, ge=1)
    shot_index: int | None = Field(default=None, ge=1)
    speaker: str | None = None
    text: str
    start_seconds: float | None = Field(default=None, ge=0)
    end_seconds: float | None = Field(default=None, ge=0)
    evidence: list[ScriptEvidence] = Field(default_factory=list)
    confidence: float = Field(default=0.5, ge=0, le=1)
    source_kind: Literal["explicit", "inferred", "suggested"] = "inferred"


class ScriptImportValidation(BaseModel):
    code: str
    severity: Literal["info", "warning", "error"] = "warning"
    message: str
    candidate_ids: list[str] = Field(default_factory=list)


class ScriptImportAnalysisResult(BaseModel):
    project_brief: ScriptProjectBrief = Field(default_factory=ScriptProjectBrief)
    entities: list[ScriptEntityCandidate] = Field(default_factory=list)
    shots: list[ScriptShotCandidate] = Field(default_factory=list)
    audio: list[ScriptAudioCandidate] = Field(default_factory=list)
    validation: list[ScriptImportValidation] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
