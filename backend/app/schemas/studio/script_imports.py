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


class ScriptImportCommitRequest(BaseModel):
    selected_chapter_indexes: list[int] = Field(default_factory=list)
    chapter_overrides: dict[str, "ScriptImportChapterOverride"] = Field(default_factory=dict)


class ScriptImportChapterOverride(BaseModel):
    title: str | None = Field(default=None, max_length=255)
    theme: str | None = None
    screenplay_text: str | None = None


class ScriptImportCommitResult(BaseModel):
    import_id: str
    chapter_ids: list[str] = Field(default_factory=list)
    created_count: int = 0
    reused: bool = False


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
