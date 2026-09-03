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
)
_ALIYUN_MODEL_OVERRIDES: dict[str, VideoModelCapability] = {}


def register_aliyun_video_capability(*, model_prefix: str, capability: VideoModelCapability) -> None:
    """注册阿里视频模型前缀能力，供不同万相版本覆盖。"""
    prefix = model_prefix.strip().lower()
    if not prefix:
        raise ValueError("model_prefix must not be empty")
    _ALIYUN_MODEL_OVERRIDES[prefix] = capability


def clear_aliyun_video_capability_overrides() -> None:
    """清空运行期能力覆盖，主要用于测试隔离。"""
    _ALIYUN_MODEL_OVERRIDES.clear()


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
