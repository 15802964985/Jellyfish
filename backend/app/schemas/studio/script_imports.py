"""Schemas for the deterministic script-import parsing pipeline."""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


ScriptDocumentProfile = Literal[
    "screenplay",
    "shot_list",
    "story_outline",
    "novel_text",
    "prompt_pack",
    "asset_bible",
    "audio_script",
    "mixed",
    "unknown",
]
ScriptBlockKind = Literal[
    "heading", "paragraph", "table", "blockquote", "list", "separator"
]
ScriptSemanticKind = Literal[
    "document_title",
    "overview",
    "chapter",
    "theme",
    "scene_description",
    "camera",
    "duration",
    "voiceover",
    "subtitle",
    "prompt_hint_zh",
    "prompt_hint_en",
    "prompt_summary",
    "voiceover_summary",
    "audio_plan",
    "production_note",
    "asset_bible",
    "unknown",
]


class ScriptSourceSpan(BaseModel):
    start_line: int = Field(ge=1)
    end_line: int = Field(ge=1)


class ScriptDocumentBlock(BaseModel):
    id: str
    kind: ScriptBlockKind
    semantic_kind: ScriptSemanticKind = "unknown"
    level: int | None = None
    raw_text: str
    clean_text: str
    span: ScriptSourceSpan
    confidence: float = Field(default=0.5, ge=0, le=1)
    duplicate_of: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class ParsedScriptChapter(BaseModel):
    index: int = Field(ge=1)
    title: str
    start_seconds: float | None = Field(default=None, ge=0)
    end_seconds: float | None = Field(default=None, ge=0)
    target_duration_seconds: float | None = Field(default=None, ge=0)
    theme: str | None = None
    screenplay_text: str
    block_ids: list[str] = Field(default_factory=list)
    section_block_ids: dict[str, list[str]] = Field(default_factory=dict)
    author_prompt_hints: dict[str, list[str]] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)


class ScriptDocumentParseResult(BaseModel):
    source_format: str
    encoding: str
    parser_version: str
    document_profile: ScriptDocumentProfile
    title: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    blocks: list[ScriptDocumentBlock] = Field(default_factory=list)
    project_block_ids: list[str] = Field(default_factory=list)
    auxiliary_block_ids: list[str] = Field(default_factory=list)
    chapters: list[ParsedScriptChapter] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class ScriptImportCreate(BaseModel):
    project_id: str
    file_id: str


class ScriptImportReviewUpdate(BaseModel):
    review_state: dict[str, Any]


class ScriptImportAnalyzeRequest(BaseModel):
    model_id: str = Field(min_length=1, max_length=64)


class ScriptImportMediaPlanRequest(BaseModel):
    model_id: str = Field(min_length=1, max_length=64)


class ScriptImportMediaPlanItem(BaseModel):
    candidate_id: str
    chapter_index: int
    shot_index: int
    requested_seconds: float | None = None
    segment_seconds: list[int] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class ScriptImportMediaPlanRead(BaseModel):
    model_id: str
    model_name: str
    provider_key: str
    allowed_ratios: list[str] = Field(default_factory=list)
    default_ratio: str | None = None
    supports_text_to_video: bool
    supports_first_frame: bool
    supports_last_frame: bool
    supports_subject_references: bool
    items: list[ScriptImportMediaPlanItem] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class ScriptImportCommitRequest(BaseModel):
    selected_chapter_indexes: list[int] = Field(default_factory=list)
    chapter_overrides: dict[str, "ScriptImportChapterOverride"] = Field(default_factory=dict)
    candidate_decisions: dict[str, "ScriptImportCandidateDecision"] = Field(default_factory=dict)
    include_shots: bool = False
    include_audio_dialogue: bool = False
    media_plan_model_id: str | None = Field(default=None, max_length=64)


class ScriptImportChapterOverride(BaseModel):
    title: str | None = Field(default=None, max_length=255)
    theme: str | None = None
    screenplay_text: str | None = None


class ScriptImportCandidateDecision(BaseModel):
    action: Literal["create", "link", "detail", "ignore"] = "ignore"
    existing_entity_id: str | None = None
    edited_name: str | None = Field(default=None, max_length=255)
    edited_description: str | None = None


class ScriptImportCommitResult(BaseModel):
    import_id: str
    chapter_ids: list[str] = Field(default_factory=list)
    created_count: int = 0
    entity_ids: dict[str, str] = Field(default_factory=dict)
    shot_ids: list[str] = Field(default_factory=list)
    dialogue_line_ids: list[int] = Field(default_factory=list)
    reused: bool = False


class ScriptImportEntityMatch(BaseModel):
    entity_id: str
    entity_type: Literal["actor", "character", "scene", "prop", "costume"]
    name: str
    score: float = Field(ge=0, le=1)


class ScriptImportMatchesRead(BaseModel):
    matches: dict[str, list[ScriptImportEntityMatch]] = Field(default_factory=dict)


class ScriptImportRead(BaseModel):
    id: str
    project_id: str
    file_id: str
    status: str
    source_format: str
    content_hash: str
    parser_version: str
    document_profile: ScriptDocumentProfile
    parse_result: ScriptDocumentParseResult
    analysis_result: dict[str, Any] = Field(default_factory=dict)
    review_state: dict[str, Any] = Field(default_factory=dict)
    commit_result: dict[str, Any] = Field(default_factory=dict)
    error_message: str = ""
    created_at: datetime
    updated_at: datetime
