"""Regression tests for the format-neutral script parser."""

import pytest
import zipfile
from io import BytesIO

from app.services.studio.script_import_parser import parse_script_document, register_script_adapter


TXT_SCRIPT = """幼儿园第一天

================================================================

项目概述
总时长：60秒
画面比例：16:9
风格：真人纪实、温暖

章节一｜出门前的忐忑（0-12秒）
主题：不安中的告别
[画面]
玄关，女孩穿着新园服，抱着毛绒兔。
[镜头]
低机位特写，缓慢横移。
[配音]
妈妈蹲下：“今天是她第一次，一个人出门。”
[字幕]
第一天上幼儿园
[画面提示词 · 中文]
清晨玄关，暖光，儿童安全视角

章节二｜三十米的路（12-28秒）
主题：依赖与试探
[画面]
母女走过林荫小路，女孩看蚂蚁。

章节三｜那一声妈妈（28-44秒）
[画面]
幼儿园门口，老师弯腰迎接。

章节四｜放学的小月亮（44-60秒）
[画面]
夕阳下，女孩拿着蜡笔画跑向妈妈。

完整提示词汇总
清晨玄关，暖光，儿童安全视角

完整配音文案
妈妈蹲下：“今天是她第一次，一个人出门。”

背景音乐与音效
钢琴与环境声，结尾保留1秒静默。
章节一 · 鸟鸣 + 开门声
章节二 · 脚步 + 树叶沙沙

制作备注
不展示幼儿正脸特写。
"""

MD_SCRIPT = """# 幼儿园第一天

## 项目概述

| 项目 | 内容 |
|---|---|
| 总时长 | 60秒 |
| 画面比例 | 16:9 |

## 章节一｜出门前的忐忑（0-12秒）

| 要素 | 内容 |
|---|---|
| 主题 | 不安中的告别 |
| 画面 | 玄关，女孩穿着新园服，抱着毛绒兔。 |
| 镜头 | 低机位特写，缓慢横移。 |
| 配音 | 妈妈蹲下：“今天是她第一次，一个人出门。” |
| 字幕 | 第一天上幼儿园 |
| 画面提示词（中文） | 清晨玄关，暖光，儿童安全视角 |

## 章节二｜三十米的路（12-28秒）

| 画面 | 母女走过林荫小路，女孩看蚂蚁。 |

## 章节三｜那一声妈妈（28-44秒）

| 画面 | 幼儿园门口，老师弯腰迎接。 |

## 章节四｜放学的小月亮（44-60秒）

| 画面 | 夕阳下，女孩拿着蜡笔画跑向妈妈。 |

## 完整提示词汇总

清晨玄关，暖光，儿童安全视角

## 完整配音文案

妈妈蹲下：“今天是她第一次，一个人出门。”

## 背景音乐与音效

钢琴与环境声，结尾保留1秒静默。

## 制作备注

不展示幼儿正脸特写。
"""


@pytest.mark.parametrize(("filename", "text"), [("script.txt", TXT_SCRIPT), ("script.md", MD_SCRIPT)])
def test_sample_variants_find_only_real_chapters(filename: str, text: str) -> None:
    result = parse_script_document(text.encode("utf-8"), filename)

    assert result.title == "幼儿园第一天"
    assert len(result.chapters) == 4
    assert [chapter.start_seconds for chapter in result.chapters] == [0, 12, 28, 44]
    assert [chapter.target_duration_seconds for chapter in result.chapters] == [12, 16, 16, 16]
    assert "完整配音文案" not in result.chapters[-1].screenplay_text
    assert "制作备注" not in result.chapters[-1].screenplay_text
    assert result.auxiliary_block_ids
    assert all("|" not in chapter.screenplay_text for chapter in result.chapters)


def test_markdown_non_chapter_headings_do_not_create_fake_chapters() -> None:
    result = parse_script_document(
        "# 故事名\n\n## 世界观\n\n海边城市。\n\n## 人物小传\n\n阿青怕水。".encode(),
        "outline.md",
    )

    assert result.title == "故事名"
    assert result.chapters == []
    assert result.warnings
    assert any(block.clean_text == "人物小传" for block in result.blocks)


def test_heading_free_novel_is_preserved_for_later_semantic_partition() -> None:
    original = "雨从凌晨一直下。阿青推开门，发现台阶上放着一只纸船。" * 10
    result = parse_script_document(original.encode(), "novel.txt")

    assert result.document_profile == "novel_text"
    assert result.chapters == []
    assert result.blocks[0].clean_text == original
    assert "AI 语义切分" in result.warnings[0]


def test_gb18030_text_is_decoded_without_losing_content() -> None:
    result = parse_script_document("第一章 起点\n场景：旧车站".encode("gb18030"), "legacy.txt")

    assert result.encoding == "gb18030"
    assert result.chapters[0].title == "第一章 起点"
    assert "旧车站" in result.chapters[0].screenplay_text


def test_exact_duplicates_keep_evidence_but_are_marked() -> None:
    result = parse_script_document("第一章 开场\n风吹过草地。\n\n风吹过草地。".encode(), "dup.txt")

    duplicate = result.blocks[-1]
    assert duplicate.clean_text == "风吹过草地。"
    assert duplicate.duplicate_of == result.blocks[-2].id


def test_unsupported_format_fails_explicitly() -> None:
    with pytest.raises(ValueError, match="Unsupported script format"):
        parse_script_document(b"content", "script.rtf")


def test_docx_adapter_converts_paragraphs_to_common_blocks() -> None:
    xml = """<?xml version="1.0" encoding="UTF-8"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body><w:p><w:r><w:t>第一章 出发</w:t></w:r></w:p>
      <w:p><w:r><w:t>场景：清晨车站</w:t></w:r></w:p></w:body>
    </w:document>"""
    payload = BytesIO()
    with zipfile.ZipFile(payload, "w") as archive:
        archive.writestr("word/document.xml", xml)

    result = parse_script_document(payload.getvalue(), "script.docx")

    assert result.encoding == "docx-xml"
    assert len(result.chapters) == 1
    assert "清晨车站" in result.chapters[0].screenplay_text


def test_new_format_can_be_added_without_changing_semantic_pipeline() -> None:
    register_script_adapter(
        ".fixture",
        lambda content: ([], "test-adapter"),
    )
    result = parse_script_document(b"opaque", "future.fixture")
    assert result.source_format == "fixture"
    assert result.encoding == "test-adapter"
