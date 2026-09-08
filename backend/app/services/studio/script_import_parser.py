"""Lossless, deterministic first-pass parser for imported scripts.

This module intentionally does not call an AI model or write business data.  It
turns supported documents into traceable blocks which later stages can analyse
and present for review.
"""

from __future__ import annotations

import hashlib
import re
import zipfile
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from collections.abc import Callable
from xml.etree import ElementTree

from app.schemas.studio.script_imports import (
    ParsedScriptChapter,
    ScriptDocumentBlock,
    ScriptDocumentParseResult,
    ScriptSourceSpan,
)


PARSER_VERSION = "1.1.0"
_NUM = r"(?:\d+|[一二三四五六七八九十百零〇两]+)"
_CHAPTER = re.compile(
    rf"^(?:(?:第\s*{_NUM}\s*[集章节幕回])|(?:(?:章节?|集|episode|chapter|ep\.?)\s*{_NUM}))"
    r"(?=$|[\s｜|:：._—-])",
    re.IGNORECASE,
)
_TIME_RANGE = re.compile(
    r"(?P<start>\d+(?:\.\d+)?)\s*(?:s|秒)?\s*[-—~～至]\s*"
    r"(?P<end>\d+(?:\.\d+)?)\s*(?:s|秒)",
    re.IGNORECASE,
)
_KEY_VALUE = re.compile(r"^\s*([^：:]{1,24})\s*[：:]\s*(.+?)\s*$")
_BRACKET_LABEL = re.compile(r"^\s*[【\[](?P<label>[^】\]]{1,40})[】\]]\s*(?P<value>.*?)\s*$")
_MD_HEADING = re.compile(r"^(#{1,6})\s+(.+?)\s*#*\s*$")
_SEPARATOR = re.compile(r"^\s*(?:(?:[-*_=]\s*){3,})$")

_ALIASES: dict[str, set[str]] = {
    "overview": {"项目概述", "作品概述", "故事概述", "整体概述", "概述", "简介"},
    "theme": {"主题", "本章主题", "情绪主题"},
    "scene_description": {"画面", "场景", "场景描述", "画面描述", "视觉内容"},
    "camera": {"镜头", "运镜", "摄影", "镜头设计"},
    "duration": {"时长", "时间", "时间段", "时间码"},
    "voiceover": {"配音", "旁白", "台词", "对白", "解说"},
    "subtitle": {"字幕", "字幕文案"},
    "prompt_hint_zh": {"画面提示词 中文", "中文提示词", "提示词 中文"},
    "prompt_hint_en": {"画面提示词 英文", "英文提示词", "提示词 英文"},
    "prompt_summary": {"完整提示词汇总", "完整提示词清单", "提示词汇总", "完整提示词", "提示词合集"},
    "voiceover_summary": {"完整配音文案", "完整配音脚本", "配音文案汇总", "完整旁白", "完整台词"},
    "audio_plan": {"背景音乐与音效", "配乐与音效", "配乐 音效建议", "音效", "音频方案", "声音设计"},
    "production_note": {"制作备注", "拍摄 生成备注", "备注", "制作说明", "注意事项"},
    "asset_bible": {"角色设定", "人物设定", "资产设定", "场景设定", "道具设定", "服装设定"},
}
_AUXILIARY = {
    "prompt_summary", "voiceover_summary", "audio_plan", "production_note", "asset_bible"
}
_CANONICAL_LABELS: dict[str, str] = {
    "theme": "主题",
    "scene_description": "画面",
    "camera": "镜头",
    "duration": "时长",
    "voiceover": "配音",
    "subtitle": "字幕",
    "prompt_hint_zh": "画面提示词 · 中文",
    "prompt_hint_en": "画面提示词 · 英文",
}


@dataclass(slots=True)
class _RawBlock:
    kind: str
    raw: str
    clean: str
    start: int
    end: int
    level: int | None = None


def _normalize_label(value: str) -> str:
    value = re.sub(r"[`*_#\[\]【】()（）]", " ", value)
    value = re.sub(r"[·•/\\|｜:：_—-]+", " ", value)
    return re.sub(r"\s+", " ", value).strip().lower()


def _semantic_kind(text: str, *, is_heading: bool = False) -> tuple[str, float]:
    clean = text.strip().strip("[]【】")
    if _CHAPTER.search(clean):
        return "chapter", 0.99
    bracket_match = _BRACKET_LABEL.match(text.strip())
    key_match = _KEY_VALUE.match(clean)
    candidate = bracket_match.group("label") if bracket_match else key_match.group(1) if key_match else clean
    normalized = _normalize_label(candidate)
    for kind, aliases in _ALIASES.items():
        if normalized in {_normalize_label(alias) for alias in aliases}:
            return kind, 0.96 if is_heading else 0.9
    return "unknown", 0.35


def _is_table_separator(line: str) -> bool:
    cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
    return bool(cells) and all(re.fullmatch(r":?-{3,}:?", cell) for cell in cells)


def _table_row_value(line: str) -> str:
    cells = [re.sub(r"\s+", " ", cell.strip()) for cell in line.strip().strip("|").split("|")]
    if len(cells) >= 2:
        return f"{cells[0]}：{' | '.join(cells[1:])}"
    return cells[0] if cells else ""


def _tokenize_markdown(text: str) -> list[_RawBlock]:
    lines = text.splitlines()
    blocks: list[_RawBlock] = []
    paragraph: list[str] = []
    paragraph_start = 0

    def flush(end_line: int) -> None:
        nonlocal paragraph, paragraph_start
        if paragraph:
            raw = "\n".join(paragraph)
            clean = re.sub(r"[*_`]", "", raw).strip()
            blocks.append(_RawBlock("paragraph", raw, clean, paragraph_start, end_line))
            paragraph = []

    index = 0
    while index < len(lines):
        line_no = index + 1
        line = lines[index]
        stripped = line.strip()
        heading = _MD_HEADING.match(stripped)
        if heading:
            flush(line_no - 1)
            blocks.append(_RawBlock("heading", line, heading.group(2).strip(), line_no, line_no, len(heading.group(1))))
        elif _SEPARATOR.match(stripped):
            flush(line_no - 1)
            blocks.append(_RawBlock("separator", line, "", line_no, line_no))
        elif stripped.startswith("|") and stripped.endswith("|"):
            flush(line_no - 1)
            # Emit every meaningful table row as an independent semantic block.
            next_is_separator = index + 1 < len(lines) and _is_table_separator(lines[index + 1].strip())
            if not _is_table_separator(stripped) and not next_is_separator:
                clean = _table_row_value(stripped)
                if clean:
                    blocks.append(_RawBlock("table", line, clean, line_no, line_no))
        elif stripped.startswith(">"):
            flush(line_no - 1)
            blocks.append(_RawBlock("blockquote", line, stripped.lstrip("> ").strip(), line_no, line_no))
        elif re.match(r"^(?:[-+*]|\d+[.)])\s+", stripped):
            flush(line_no - 1)
            clean = re.sub(r"^(?:[-+*]|\d+[.)])\s+", "", stripped)
            blocks.append(_RawBlock("list", line, clean, line_no, line_no))
        elif not stripped:
            flush(line_no - 1)
        else:
            if not paragraph:
                paragraph_start = line_no
            paragraph.append(line)
        index += 1
    flush(len(lines))
    return blocks


def _looks_like_txt_heading(line: str) -> bool:
    clean = line.strip().strip("[]【】")
    if _CHAPTER.search(clean):
        return True
    normalized = _normalize_label(clean.rstrip("：:"))
    return any(normalized in {_normalize_label(alias) for alias in aliases} for aliases in _ALIASES.values())


def _tokenize_text(text: str) -> list[_RawBlock]:
    lines = text.splitlines()
    blocks: list[_RawBlock] = []
    paragraph: list[str] = []
    paragraph_start = 0

    def flush(end_line: int) -> None:
        nonlocal paragraph, paragraph_start
        if paragraph:
            raw = "\n".join(paragraph)
            blocks.append(_RawBlock("paragraph", raw, raw.strip(), paragraph_start, end_line))
            paragraph = []

    for index, line in enumerate(lines, start=1):
        stripped = line.strip()
        bracket_match = _BRACKET_LABEL.match(stripped)
        if _SEPARATOR.match(stripped):
            flush(index - 1)
            blocks.append(_RawBlock("separator", line, "", index, index))
        elif bracket_match or _KEY_VALUE.match(stripped):
            flush(index - 1)
            is_empty_bracket_heading = bool(bracket_match and not bracket_match.group("value").strip())
            blocks.append(
                _RawBlock(
                    "heading" if is_empty_bracket_heading else "paragraph",
                    line,
                    stripped,
                    index,
                    index,
                    1 if is_empty_bracket_heading else None,
                )
            )
        elif _looks_like_txt_heading(stripped) and not _KEY_VALUE.match(stripped):
            flush(index - 1)
            blocks.append(_RawBlock("heading", line, stripped.strip("[]【】 "), index, index, 1))
        elif not stripped:
            flush(index - 1)
        else:
            if not paragraph:
                paragraph_start = index
            paragraph.append(line)
    flush(len(lines))
    return blocks


def _decode(content: bytes) -> tuple[str, str]:
    for encoding in ("utf-8-sig", "gb18030"):
        try:
            return content.decode(encoding), encoding
        except UnicodeDecodeError:
            continue
    return content.decode("utf-8", errors="replace"), "utf-8-replacement"


def _extract_docx(content: bytes) -> str:
    try:
        with zipfile.ZipFile(BytesIO(content)) as archive:
            xml = archive.read("word/document.xml")
    except (KeyError, zipfile.BadZipFile) as exc:
        raise ValueError("Invalid DOCX document") from exc
    root = ElementTree.fromstring(xml)
    paragraphs: list[str] = []
    namespace = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
    for paragraph in root.iter(f"{namespace}p"):
        text = "".join(node.text or "" for node in paragraph.iter(f"{namespace}t")).strip()
        if text:
            paragraphs.append(text)
    return "\n\n".join(paragraphs)


def _extract_pdf(content: bytes) -> str:
    try:
        from pypdf import PdfReader

        reader = PdfReader(BytesIO(content))
        text = "\n\n".join((page.extract_text() or "").strip() for page in reader.pages).strip()
    except Exception as exc:  # pypdf exposes several backend-specific errors
        raise ValueError("Invalid or encrypted PDF document") from exc
    if not text:
        raise ValueError("PDF has no extractable text; OCR is required")
    return text


ScriptFormatAdapter = Callable[[bytes], tuple[list[_RawBlock], str]]
_ADAPTERS: dict[str, ScriptFormatAdapter] = {}


def register_script_adapter(extension: str, adapter: ScriptFormatAdapter) -> None:
    """Register an ingestion adapter without changing downstream semantics."""

    normalized = extension.lower()
    if not normalized.startswith("."):
        normalized = f".{normalized}"
    _ADAPTERS[normalized] = adapter


def _plain_text_adapter(content: bytes) -> tuple[list[_RawBlock], str]:
    text, encoding = _decode(content)
    return _tokenize_text(text), encoding


def _markdown_adapter(content: bytes) -> tuple[list[_RawBlock], str]:
    text, encoding = _decode(content)
    return _tokenize_markdown(text), encoding


def _docx_adapter(content: bytes) -> tuple[list[_RawBlock], str]:
    return _tokenize_text(_extract_docx(content)), "docx-xml"


def _pdf_adapter(content: bytes) -> tuple[list[_RawBlock], str]:
    return _tokenize_text(_extract_pdf(content)), "pdf-text-layer"


for _extension, _adapter in {
    ".txt": _plain_text_adapter,
    ".md": _markdown_adapter,
    ".markdown": _markdown_adapter,
    ".docx": _docx_adapter,
    ".pdf": _pdf_adapter,
}.items():
    register_script_adapter(_extension, _adapter)


def _extract_labeled_value(text: str) -> str:
    bracket_match = _BRACKET_LABEL.match(text.strip())
    if bracket_match:
        return bracket_match.group("value").strip()
    match = _KEY_VALUE.match(text.strip())
    return match.group(2).strip() if match else text.strip()


def _chapter_title(text: str) -> str:
    """移除章节编号和时间范围，避免预览标题残留半个括号。"""

    match = _TIME_RANGE.search(text)
    if match:
        title = f"{text[:match.start()]}{text[match.end():]}"
        title = re.sub(r"[（(]\s*[）)]", "", title)
    else:
        title = text
    title = title.strip(" （）()｜|:：._—-")
    return title or text.strip()


def _canonical_section_text(semantic: str, value: str, *, include_label: bool) -> str:
    """把多种文档格式统一成保留业务语义的标准剧本段落。"""

    clean_value = value.strip()
    label = _CANONICAL_LABELS.get(semantic)
    if not include_label or not label:
        return clean_value
    return f"【{label}】\n{clean_value}" if clean_value else f"【{label}】"


def _chapter_structure_warnings(
    section_block_ids: dict[str, list[str]],
    *,
    target_duration_seconds: float | None,
) -> list[str]:
    """按通用生产字段评估章节解析质量，只提示、不阻断自由格式剧本。"""

    recognized = {kind for kind, block_ids in section_block_ids.items() if block_ids}
    warnings: list[str] = []
    if "scene_description" not in recognized:
        warnings.append("未明确识别画面/场景描述；请核对正文，或补充【画面】标签。")
    if "camera" not in recognized:
        warnings.append("未明确识别镜头/运镜信息；可继续导入，但后续需由 AI 推断或人工补充。")
    if "duration" not in recognized and target_duration_seconds is None:
        warnings.append("未识别章节时间范围或【时长】；视频分段前需要补充目标时长。")
    if not ({"voiceover", "subtitle"} & recognized):
        warnings.append("未识别配音、对白或字幕；如果本章是无对白镜头可忽略此提示。")

    production_signals = sum(
        1
        for present in (
            "scene_description" in recognized,
            "camera" in recognized,
            "duration" in recognized or target_duration_seconds is not None,
        )
        if present
    )
    if production_signals < 2:
        warnings.insert(0, "本章与推荐剧本结构差异较大，请先核对标题、正文和字段归类。")
    return warnings


def _build_blocks(raw_blocks: list[_RawBlock]) -> list[ScriptDocumentBlock]:
    blocks: list[ScriptDocumentBlock] = []
    seen: dict[str, str] = {}
    for index, raw in enumerate(raw_blocks, start=1):
        semantic, confidence = _semantic_kind(raw.clean, is_heading=raw.kind == "heading")
        normalized = re.sub(r"\s+", "", raw.clean).lower()
        digest = hashlib.sha256(normalized.encode("utf-8")).hexdigest() if normalized else ""
        duplicate_of = seen.get(digest) if digest else None
        block_id = f"b{index:04d}"
        if digest and duplicate_of is None:
            seen[digest] = block_id
        blocks.append(
            ScriptDocumentBlock(
                id=block_id,
                kind=raw.kind,
                semantic_kind=semantic,
                level=raw.level,
                raw_text=raw.raw,
                clean_text=raw.clean,
                span=ScriptSourceSpan(start_line=raw.start, end_line=raw.end),
                confidence=confidence,
                duplicate_of=duplicate_of,
            )
        )
    return blocks


def _profile(blocks: list[ScriptDocumentBlock], chapter_count: int) -> str:
    kinds = {block.semantic_kind for block in blocks}
    if chapter_count and ({"camera", "duration"} & kinds):
        return "shot_list"
    if chapter_count:
        return "screenplay"
    if {"prompt_hint_zh", "prompt_hint_en", "prompt_summary"} & kinds:
        return "prompt_pack"
    if "asset_bible" in kinds:
        return "asset_bible"
    if {"voiceover", "audio_plan"} & kinds:
        return "audio_script"
    if sum(len(block.clean_text) for block in blocks) > 120:
        return "novel_text"
    return "unknown"


def _metadata(blocks: list[ScriptDocumentBlock], project_ids: list[str]) -> dict[str, object]:
    result: dict[str, object] = {}
    project = {block.id for block in blocks if block.id in project_ids}
    for block in blocks:
        if block.id not in project:
            continue
        for line in block.clean_text.splitlines():
            match = _KEY_VALUE.match(line.strip())
            if match:
                key = _normalize_label(match.group(1))
                if key and key not in result:
                    result[key] = match.group(2).strip()
    return result


def _assemble(blocks: list[ScriptDocumentBlock], source_format: str, encoding: str) -> ScriptDocumentParseResult:
    project_ids: list[str] = []
    auxiliary_ids: list[str] = []
    chapters: list[ParsedScriptChapter] = []
    current: dict[str, object] | None = None
    active_section = "unknown"
    active_global = "project"
    active_section_has_content = False
    title: str | None = None

    def flush_chapter() -> None:
        nonlocal current
        if current is None:
            return
        content: list[str] = current.pop("content")  # type: ignore[assignment]
        current["screenplay_text"] = "\n\n".join(part for part in content if part).strip()
        current["warnings"] = _chapter_structure_warnings(
            current["section_block_ids"],  # type: ignore[arg-type]
            target_duration_seconds=current.get("target_duration_seconds"),  # type: ignore[arg-type]
        )
        chapters.append(ParsedScriptChapter(**current))
        current = None

    for block in blocks:
        semantic = block.semantic_kind
        if block.kind == "heading" and semantic == "chapter" and active_global != "auxiliary":
            flush_chapter()
            active_global = "project"
            active_section = "unknown"
            active_section_has_content = False
            time_match = _TIME_RANGE.search(block.clean_text)
            start = float(time_match.group("start")) if time_match else None
            end = float(time_match.group("end")) if time_match else None
            current = {
                "index": len(chapters) + 1,
                "title": _chapter_title(block.clean_text),
                "start_seconds": start,
                "end_seconds": end,
                "target_duration_seconds": end - start if start is not None and end is not None else None,
                "theme": None,
                "content": [],
                "block_ids": [block.id],
                "section_block_ids": {},
                "author_prompt_hints": {},
                "warnings": [],
            }
            continue

        if block.kind == "heading" and semantic in _AUXILIARY:
            flush_chapter()
            active_global = "auxiliary"
            active_section = semantic
            auxiliary_ids.append(block.id)
            continue

        if current is None:
            # Plain-text scripts commonly put a one-line title before the first
            # labelled section without any Markdown marker.
            if (
                title is None
                and semantic == "unknown"
                and "\n" not in block.clean_text
                and len(block.clean_text) <= 100
            ):
                title = block.clean_text
                block.semantic_kind = "document_title"
            (auxiliary_ids if active_global == "auxiliary" else project_ids).append(block.id)
            if block.kind == "heading" and semantic != "unknown":
                active_section = semantic
            continue

        if block.kind == "heading" and semantic != "unknown":
            active_section = semantic
            active_section_has_content = False
            current["block_ids"].append(block.id)  # type: ignore[union-attr]
            current["section_block_ids"].setdefault(semantic, []).append(block.id)  # type: ignore[union-attr]
            continue

        # Markdown authors often use bold standalone labels instead of real
        # headings.  Treat such blocks as section boundaries, but keep their
        # source evidence rather than leaking the label into generated text.
        inline_bracket = _BRACKET_LABEL.match(block.clean_text.strip())
        has_inline_bracket_value = bool(inline_bracket and inline_bracket.group("value").strip())
        if (
            semantic != "unknown"
            and not _KEY_VALUE.match(block.clean_text.strip())
            and not has_inline_bracket_value
        ):
            active_section = semantic
            active_section_has_content = False
            current["block_ids"].append(block.id)  # type: ignore[union-attr]
            current["section_block_ids"].setdefault(semantic, []).append(block.id)  # type: ignore[union-attr]
            continue

        effective = semantic if semantic != "unknown" else active_section
        value = _extract_labeled_value(block.clean_text) if semantic != "unknown" else block.clean_text
        if semantic != "unknown":
            active_section = semantic
            active_section_has_content = False
        current["block_ids"].append(block.id)  # type: ignore[union-attr]
        current["section_block_ids"].setdefault(effective, []).append(block.id)  # type: ignore[union-attr]
        if effective == "theme" and not current["theme"]:
            current["theme"] = value
        if effective in {"prompt_hint_zh", "prompt_hint_en"}:
            current["author_prompt_hints"].setdefault(effective, []).append(value)  # type: ignore[union-attr]
        if block.kind != "separator" and effective not in _AUXILIARY:
            current["content"].append(  # type: ignore[union-attr]
                _canonical_section_text(
                    effective,
                    value,
                    include_label=not active_section_has_content,
                )
            )
            active_section_has_content = True
    flush_chapter()

    warnings: list[str] = []
    if not chapters:
        warnings.append("未识别到明确章节；原文已完整保留，需在预览阶段手动确认或使用 AI 语义切分。")
    if encoding == "utf-8-replacement":
        warnings.append("部分字符无法按常见编码解码，请在预览中核对原文。")
    low_confidence_count = sum(
        1 for chapter in chapters if any("结构差异较大" in item for item in chapter.warnings)
    )
    if low_confidence_count:
        warnings.append(
            f"有 {low_confidence_count} 个章节与推荐结构差异较大；系统已保留原文，请核对后再导入，"
            "或在明确同意后使用 AI 深度分析。"
        )
    return ScriptDocumentParseResult(
        source_format=source_format,
        encoding=encoding,
        parser_version=PARSER_VERSION,
        document_profile=_profile(blocks, len(chapters)),
        title=title,
        metadata=_metadata(blocks, project_ids),
        blocks=blocks,
        project_block_ids=project_ids,
        auxiliary_block_ids=auxiliary_ids,
        chapters=chapters,
        warnings=warnings,
    )


def parse_script_document(content: bytes, filename: str) -> ScriptDocumentParseResult:
    """Parse a supported script document without side effects or model calls."""

    suffix = Path(filename).suffix.lower()
    adapter = _ADAPTERS.get(suffix)
    if adapter is None:
        raise ValueError(f"Unsupported script format: {suffix or '(none)'}")
    raw_blocks, encoding = adapter(content)
    return _assemble(_build_blocks(raw_blocks), suffix.lstrip("."), encoding)
