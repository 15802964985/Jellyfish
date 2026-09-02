"""阿里云百炼图片模型能力声明。"""

from __future__ import annotations

from typing import TYPE_CHECKING

from app.core.integrations.image_capabilities import ImageModelCapability

if TYPE_CHECKING:
    from app.core.contracts.image_generation import ImageGenerationInput


_ALIYUN_DEFAULT = ImageModelCapability(
    supports_seed=True,
    supports_watermark=True,
    default_resolution_profile="standard",
    min_n=1,
    max_n=4,
)
_ALIYUN_MODEL_OVERRIDES: dict[str, ImageModelCapability] = {}


def register_aliyun_image_capability(*, model_prefix: str, capability: ImageModelCapability) -> None:
    """注册阿里图片模型前缀能力，供后续模型差异化覆盖。"""
    prefix = model_prefix.strip().lower()
    if not prefix:
        raise ValueError("model_prefix must not be empty")
    _ALIYUN_MODEL_OVERRIDES[prefix] = capability


def clear_aliyun_image_capability_overrides() -> None:
    """清空运行期能力覆盖，主要用于测试隔离。"""
    _ALIYUN_MODEL_OVERRIDES.clear()


def resolve_aliyun_image_capability(model: str | None) -> ImageModelCapability:
    """按最长模型前缀解析阿里图片能力。"""
    value = (model or "").strip().lower()
    for prefix, capability in sorted(
        _ALIYUN_MODEL_OVERRIDES.items(), key=lambda item: len(item[0]), reverse=True
    ):
        if value.startswith(prefix):
            return capability
    return _ALIYUN_DEFAULT


def validate_aliyun_image_options(input_: "ImageGenerationInput") -> None:
    """使用统一约束校验阿里图片生成参数。"""
    from app.core.integrations.image_capabilities import validate_image_options

    validate_image_options(provider="aliyun_bailian", model=input_.model, input_=input_)

