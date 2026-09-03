"""富媒体附件、音频资产和非阻塞合成契约测试。"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.models.studio import ShotAudioTrack
from app.models.types import FileType
from app.schemas.studio.media_assets import ShotAudioTrackCreate
from app.services.studio.files import _detect_file_type, _safe_storage_filename
from app.services.studio.generation.asset_image.build_base import _merge_reference_ids
from app.services.studio.media_composition import _audio_filter


@pytest.mark.parametrize(
    ("filename", "expected"),
    [
        ("voice.mp3", FileType.audio),
        ("scene.MD", FileType.document),
        ("reference.webp", FileType.image),
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
