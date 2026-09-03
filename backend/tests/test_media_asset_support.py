"""富媒体附件、音频资产和非阻塞合成契约测试。"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.models.studio import ShotAudioTrack
from app.models.studio import FileItem
from app.models.types import FileType
from app.core.integrations.video_capabilities import VideoModelCapability
from app.schemas.studio.media_assets import ShotAudioTrackCreate
from app.services.studio.asset_reference_context import AssetAttachment, _select_subjects
from app.services.studio.files import _detect_file_type, _parse_range_header, _safe_storage_filename
from app.services.studio.generation.asset_image.build_base import _append_attachment_context, _merge_reference_ids
from app.services.studio.media_composition import _audio_filter


@pytest.mark.parametrize(
    ("filename", "expected"),
    [
        ("voice.mp3", FileType.audio),
        ("voice.wav", FileType.audio),
        ("voice.m4a", FileType.audio),
        ("scene.MD", FileType.document),
        ("scene.txt", FileType.document),
        ("scene.pdf", FileType.document),
        ("scene.docx", FileType.document),
        ("reference.webp", FileType.image),
        ("reference.jpg", FileType.image),
        ("motion.mp4", FileType.video),
        ("motion.mov", FileType.video),
        ("motion.webm", FileType.video),
    ],
)
def test_detect_file_type_supports_rich_assets(filename: str, expected: FileType) -> None:
    assert _detect_file_type(filename) == expected


def test_storage_filename_strips_paths_and_unsafe_characters() -> None:
    safe_name = _safe_storage_filename("..\\人物 设定?.PNG")
    assert safe_name == "upload.png"
    assert "/" not in safe_name and "\\" not in safe_name and "?" not in safe_name
    assert safe_name.endswith(".png")


def test_reference_merge_is_stable_optional_and_limited() -> None:
    assert _merge_reference_ids([], []) == []
    assert _merge_reference_ids(["a", "b"], ["b", "c", "d", "e"], limit=4) == ["a", "b", "c", "d"]


def test_attachment_context_is_a_soft_prompt_suffix() -> None:
    assert _append_attachment_context("主体提示词", "附件说明") == "主体提示词\n\n附件说明"
    assert _append_attachment_context("主体提示词", "") == "主体提示词"


def test_media_range_parser_supports_browser_request_forms() -> None:
    assert _parse_range_header("bytes=0-99", size=1000) == (0, 99)
    assert _parse_range_header("bytes=900-", size=1000) == (900, 999)
    assert _parse_range_header("bytes=-100", size=1000) == (900, 999)


def test_linked_subject_media_only_uses_model_supported_types() -> None:
    """关联素材按模型能力转成主体引用，音频必须与视觉素材绑定。"""
    attachments = [
        AssetAttachment(
            entity_type="character",
            entity_id="character-1",
            entity_name="角色A",
            file=FileItem(id=file_id, type=file_type, name=file_id, thumbnail="", tags=[], storage_key=f"files/{file_id}"),
            resource_role="reference",
            note="",
            is_primary=index == 0,
            sort_index=index,
        )
        for index, (file_id, file_type) in enumerate(
            [("image-1", FileType.image), ("video-1", FileType.video), ("audio-1", FileType.audio)]
        )
    ]
    subjects = _select_subjects(
        attachments=attachments,
        subject_sources={"角色A": [("character", "character-1")]},
        capability=VideoModelCapability(
            supports_subject_image_reference=True,
            supports_subject_video_reference=False,
            supports_subject_audio_reference=True,
            max_subjects=1,
            max_images_per_subject=1,
            max_audios_per_subject=1,
        ),
    )

    assert len(subjects) == 1
    assert [(item.file_id, item.media_kind) for item in subjects[0].media] == [
        ("image-1", "image"),
        ("audio-1", "audio"),
    ]


def test_audio_track_range_must_be_forward() -> None:
    with pytest.raises(ValidationError):
        ShotAudioTrackCreate(
            audio_asset_id="audio-1",
            track_type="sfx",
            start_ms=1000,
            end_ms=500,
        )


def test_audio_filter_contains_timeline_and_mix_parameters() -> None:
    track = ShotAudioTrack(
        shot_id="shot-1",
        audio_asset_id="audio-1",
        track_type="sfx",
        start_ms=1200,
        end_ms=4200,
        volume=0.75,
        fade_in_ms=200,
        fade_out_ms=300,
        loop=False,
        sort_index=0,
    )
    output = _audio_filter(track, 1, "track1")
    assert "atrim=duration=3.000" in output
    assert "volume=0.7500" in output
    assert "adelay=1200:all=1" in output
