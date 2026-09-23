"""火山视频能力声明与覆盖注册。"""

from __future__ import annotations

from typing import TYPE_CHECKING

from app.core.integrations.video_capabilities import ALLOWED_RATIOS, VideoModelCapability

if TYPE_CHECKING:
    from app.core.contracts.video_generation import VideoGenerationInput

_VOLCENGINE_DEFAULT = VideoModelCapability(
    supports_seed=True,
    supports_watermark=True,
    allowed_ratios=set(ALLOWED_RATIOS),
    default_ratio="16:9",
    min_seconds=2,
    max_seconds=12,
    max_key_frames=0,
)

# key: 模型前缀（小写）
_SEEDANCE_15 = VideoModelCapability(
    supports_seed=True,
    supports_watermark=True,
    allowed_ratios=set(ALLOWED_RATIOS),
    default_ratio="16:9",
    min_seconds=4,
    max_seconds=12,
    supports_generate_audio=True,
    resolutions=("480p", "720p", "1080p"),
    resolution_source="https://www.volcengine.com/docs/82379/1520757",
    max_key_frames=0,
)
_VOLCENGINE_BUILTIN_OVERRIDES: dict[str, VideoModelCapability] = {
    "doubao-seedance-1.5": _SEEDANCE_15,
    "doubao-seedance-1-5-pro": _SEEDANCE_15,
}
_VOLCENGINE_MODEL_OVERRIDES: dict[str, VideoModelCapability] = dict(_VOLCENGINE_BUILTIN_OVERRIDES)


def register_volcengine_video_capability(*, model_prefix: str, capability: VideoModelCapability) -> None:
    prefix = model_prefix.strip().lower()
    if not prefix:
        raise ValueError("model_prefix must not be empty")
    _VOLCENGINE_MODEL_OVERRIDES[prefix] = capability


def clear_volcengine_video_capability_overrides() -> None:
    _VOLCENGINE_MODEL_OVERRIDES.clear()
    _VOLCENGINE_MODEL_OVERRIDES.update(_VOLCENGINE_BUILTIN_OVERRIDES)


def _pick_override(model: str | None) -> VideoModelCapability | None:
    if not model:
        return None
    value = model.strip().lower()
    if not value:
        return None
    # 最长前缀优先，避免通用前缀覆盖具体前缀。
    for prefix, cap in sorted(_VOLCENGINE_MODEL_OVERRIDES.items(), key=lambda item: len(item[0]), reverse=True):
        if value.startswith(prefix):
            return cap
    return None


def resolve_volcengine_video_capability(model: str | None) -> VideoModelCapability:
    return _pick_override(model) or _VOLCENGINE_DEFAULT


def validate_volcengine_video_options(input_: VideoGenerationInput) -> None:
    """火山能力校验入口（避免调用侧传 provider 字面量）。"""
    from app.core.contracts.video_generation import VideoGenerationInput
    from app.core.integrations.video_capabilities import validate_video_options

    assert isinstance(input_, VideoGenerationInput)
    validate_video_options(provider="volcengine", model=input_.model, input_=input_)
