"""阿里云百炼视频模型能力声明。"""

from __future__ import annotations

from typing import TYPE_CHECKING

from app.core.integrations.video_capabilities import ALLOWED_RATIOS, VideoModelCapability

if TYPE_CHECKING:
    from app.core.contracts.video_generation import VideoGenerationInput


_ALIYUN_DEFAULT = VideoModelCapability(
    supports_seed=True,
    supports_watermark=True,
    allowed_ratios=set(ALLOWED_RATIOS),
    default_ratio="16:9",
    min_seconds=2,
    max_seconds=30,
    supports_subject_image_reference=True,
    supports_subject_video_reference=True,
    max_subjects=5,
    max_media_per_subject=5,
    max_key_frames=0,
)
_HAPPYHORSE_T2V = VideoModelCapability(
    supports_seed=True,
    supports_watermark=True,
    allowed_ratios={"16:9", "9:16", "1:1", "4:3", "3:4", "21:9"},
    default_ratio="16:9",
    min_seconds=3,
    max_seconds=15,
    supports_first_frame=False,
    supports_last_frame=False,
    max_key_frames=0,
)
_HAPPYHORSE_I2V = VideoModelCapability(
    resolutions=("480P", "720P", "1080P"),
    resolution_source="https://help.aliyun.com/zh/model-studio/happyhorse-image-to-video-api-reference",
    supports_seed=True,
    supports_watermark=True,
    allowed_ratios=set(ALLOWED_RATIOS),
    default_ratio="16:9",
    min_seconds=3,
    max_seconds=15,
    supports_text_to_video=False,
    supports_last_frame=False,
    max_key_frames=0,
    requires_first_frame=True,
)
_HAPPYHORSE_R2V = VideoModelCapability(
    supports_seed=True, supports_watermark=True,
    allowed_ratios=set(ALLOWED_RATIOS), default_ratio="16:9",
    min_seconds=3, max_seconds=15,
    supports_text_to_video=False, supports_first_frame=False, supports_last_frame=False,
    max_key_frames=0, supports_subject_image_reference=True,
    max_subjects=9, max_images_per_subject=9, max_media_per_subject=9,
    max_total_subject_images=9, requires_subject_reference=True,
    resolutions=("480P", "720P", "1080P"),
    resolution_source="https://help.aliyun.com/zh/model-studio/happyhorse-reference-to-video-api-reference",
)
_WAN27 = VideoModelCapability(
    supports_seed=True,
    supports_watermark=True,
    allowed_ratios=set(ALLOWED_RATIOS),
    default_ratio="16:9",
    min_seconds=2,
    max_seconds=15,
    supports_last_frame=False,
    max_key_frames=0,
    supports_subject_image_reference=True,
    supports_subject_video_reference=True,
    supports_subject_audio_reference=True,
    supports_subject_reference_with_frame_reference=True,
    max_subjects=5,
    max_images_per_subject=5,
    max_videos_per_subject=5,
    max_audios_per_subject=1,
    max_media_per_subject=5,
)
_WAN26 = VideoModelCapability(
    supports_seed=True,
    supports_watermark=True,
    allowed_ratios=set(ALLOWED_RATIOS),
    default_ratio="16:9",
    min_seconds=2,
    max_seconds=10,
    supports_last_frame=False,
    max_key_frames=0,
    supports_subject_image_reference=True,
    supports_subject_video_reference=True,
    max_subjects=5,
    max_media_per_subject=5,
)
_ALIYUN_BUILTIN_OVERRIDES: dict[str, VideoModelCapability] = {
    "happyhorse-1.1-t2v": _HAPPYHORSE_T2V,
    "happyhorse-1.1-i2v": _HAPPYHORSE_I2V,
    "happyhorse-1.1-r2v": _HAPPYHORSE_R2V,
    "wan3.0-video": _ALIYUN_DEFAULT,
    "wan2.7": _WAN27,
    "wan2.6": _WAN26,
}
_ALIYUN_MODEL_OVERRIDES: dict[str, VideoModelCapability] = dict(_ALIYUN_BUILTIN_OVERRIDES)


def register_aliyun_video_capability(*, model_prefix: str, capability: VideoModelCapability) -> None:
    """注册阿里视频模型前缀能力，供不同万相版本覆盖。"""
    prefix = model_prefix.strip().lower()
    if not prefix:
        raise ValueError("model_prefix must not be empty")
    _ALIYUN_MODEL_OVERRIDES[prefix] = capability


def clear_aliyun_video_capability_overrides() -> None:
    """清空运行期覆盖并恢复阿里内置模型家族规则。"""
    _ALIYUN_MODEL_OVERRIDES.clear()
    _ALIYUN_MODEL_OVERRIDES.update(_ALIYUN_BUILTIN_OVERRIDES)


def resolve_aliyun_video_capability(model: str | None) -> VideoModelCapability:
    """按最长模型前缀解析阿里视频能力。"""
    value = (model or "").strip().lower()
    for prefix, capability in sorted(
        _ALIYUN_MODEL_OVERRIDES.items(), key=lambda item: len(item[0]), reverse=True
    ):
        if value.startswith(prefix):
            return capability
    return _ALIYUN_DEFAULT


def validate_aliyun_video_options(input_: "VideoGenerationInput") -> None:
    """使用统一约束校验阿里视频生成参数。"""
    from app.core.integrations.video_capabilities import validate_video_options

    validate_video_options(provider="aliyun_bailian", model=input_.model, input_=input_)
