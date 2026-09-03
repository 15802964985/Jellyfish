"""视频能力映射单测。"""

from __future__ import annotations

import pytest

from app.core.contracts.video_generation import VideoFrameReferences, VideoGenerationInput, VideoSubjectReference
from app.core.contracts.media import MediaReference
from app.core.integrations.video_capabilities import (
    VideoModelCapability,
    clear_video_model_capability_overrides,
    infer_ratio_from_size,
    register_video_model_capability,
    resolve_video_capability,
    validate_video_options,
)


def test_infer_ratio_from_size_supports_ratio_and_resolution() -> None:
    assert infer_ratio_from_size("16:9") == "16:9"
    assert infer_ratio_from_size("1920x1080") == "16:9"
    assert infer_ratio_from_size("720x1280") == "9:16"
    assert infer_ratio_from_size("abc") is None


def test_resolve_video_capability_prefers_longest_prefix() -> None:
    clear_video_model_capability_overrides(provider="openai")
    register_video_model_capability(
        provider="openai",
        model_prefix="gpt-video",
        capability=VideoModelCapability(supports_seed=False),
    )
    register_video_model_capability(
        provider="openai",
        model_prefix="gpt-video-pro",
        capability=VideoModelCapability(supports_seed=True, supports_watermark=False),
    )
    try:
        cap = resolve_video_capability(provider="openai", model="gpt-video-pro-1")
        assert cap.supports_seed is True
        assert cap.supports_watermark is False
    finally:
        clear_video_model_capability_overrides(provider="openai")


def test_validate_video_options_rejects_capability_mismatch() -> None:
    clear_video_model_capability_overrides(provider="volcengine")
    register_video_model_capability(
        provider="volcengine",
        model_prefix="seedream-video",
        capability=VideoModelCapability(supports_seed=False),
    )
    try:
        inp = VideoGenerationInput(prompt="test", model="seedream-video-v1", ratio="16:9", seed=7)
        with pytest.raises(ValueError) as exc_info:
            validate_video_options(provider="volcengine", model=inp.model, input_=inp)
        assert "seed is not supported" in str(exc_info.value)
    finally:
        clear_video_model_capability_overrides(provider="volcengine")


def test_openai_sora_capability_rejects_unsupported_duration_and_tail_frame() -> None:
    """Sora 只允许 4/8/12 秒和单首帧参考。"""
    with pytest.raises(ValueError, match="one of"):
        validate_video_options(
            provider="openai",
            model="sora-2",
            input_=VideoGenerationInput(prompt="city", model="sora-2", ratio="16:9", seconds=6),
        )
    with pytest.raises(ValueError, match="last frame"):
        validate_video_options(
            provider="openai",
            model="sora-2",
            input_=VideoGenerationInput.model_construct(
                prompt="city",
                model="sora-2",
                ratio="16:9",
                seconds=8,
                seed=None,
                watermark=None,
                frame_references=type("Frames", (), {"first_frame": None, "last_frame": "tail", "key_frames": []})(),
                subject_references=[],
            ),
        )


def test_aliyun_happyhorse_modes_require_matching_reference_shape() -> None:
    """HappyHorse t2v/i2v/r2v 的素材边界必须在提交供应商前生效。"""
    with pytest.raises(ValueError, match="first frame is required"):
        validate_video_options(
            provider="aliyun_bailian",
            model="happyhorse-1.1-i2v",
            input_=VideoGenerationInput(
                prompt="person", model="happyhorse-1.1-i2v", ratio="16:9", seconds=5
            ),
        )
    with pytest.raises(ValueError, match="reference media is required"):
        validate_video_options(
            provider="aliyun_bailian",
            model="happyhorse-1.1-r2v",
            input_=VideoGenerationInput(
                prompt="person", model="happyhorse-1.1-r2v", ratio="16:9", seconds=5
            ),
        )


def test_aliyun_reference_audio_requires_visual_and_is_model_scoped() -> None:
    """参考音色必须绑定视觉素材，且只允许声明支持的阿里模型。"""
    audio_only = VideoSubjectReference(
        name="hero",
        media=[MediaReference(file_id="voice", media_kind="audio")],
    )
    with pytest.raises(ValueError, match="requires an image or video"):
        validate_video_options(
            provider="aliyun_bailian",
            model="happyhorse-1.1-r2v",
            input_=VideoGenerationInput(
                prompt="hero", model="happyhorse-1.1-r2v", ratio="16:9", subject_references=[audio_only]
            ),
        )
    visual_voice = VideoSubjectReference(
        name="hero",
        media=[
            MediaReference(file_id="image", media_kind="image"),
            MediaReference(file_id="voice", media_kind="audio", ordinal=1),
        ],
    )
    validate_video_options(
        provider="aliyun_bailian",
        model="happyhorse-1.1-r2v",
        input_=VideoGenerationInput(
            prompt="hero", model="happyhorse-1.1-r2v", ratio="16:9", subject_references=[visual_voice]
        ),
    )


def test_vidu_subject_video_is_limited_to_q2_pro_and_conflicts_with_frames() -> None:
    """Vidu 主体视频仅 q2-pro 支持，且主体与构图帧不可混用。"""
    subject = VideoSubjectReference(
        name="hero",
        media=[MediaReference(file_id="hero-video", media_kind="video")],
    )
    q2_pro = VideoGenerationInput(
        prompt="@hero walks into the room",
        model="viduq2-pro",
        ratio="16:9",
        subject_references=[subject],
    )
    validate_video_options(provider="vidu", model=q2_pro.model, input_=q2_pro)

    q2 = q2_pro.model_copy(update={"model": "viduq2"})
    with pytest.raises(ValueError, match="subject video references are not supported"):
        validate_video_options(provider="vidu", model=q2.model, input_=q2)

    conflict = q2_pro.model_copy(
        update={"frame_references": VideoFrameReferences(first_frame=MediaReference(file_id="frame", media_kind="image"))}
    )
    with pytest.raises(ValueError, match="cannot be combined with frame references"):
        validate_video_options(provider="vidu", model=conflict.model, input_=conflict)
