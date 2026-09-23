"""视频生成能力约束与参数映射辅助。"""

from __future__ import annotations

from dataclasses import dataclass

from app.core.contracts.provider import ProviderKey
from app.core.contracts.video_generation import VideoGenerationInput, VideoRatio

ALLOWED_RATIOS = {"16:9", "4:3", "1:1", "3:4", "9:16", "21:9"}
DEFAULT_RATIO_TO_SIZE_MAPPING: dict[str, str] = {
    "16:9": "1280x720",
    "4:3": "1024x768",
    "1:1": "1024x1024",
    "3:4": "768x1024",
    "9:16": "720x1280",
    "21:9": "1680x720",
}


def infer_ratio_from_size(value: str | None) -> str | None:
    """将标准比例或宽高像素串归一化为项目支持的视频比例。"""
    normalized = (value or "").strip()
    if normalized in ALLOWED_RATIOS:
        return normalized
    try:
        width_text, height_text = normalized.lower().split("x", maxsplit=1)
        width, height = int(width_text), int(height_text)
    except ValueError:
        return None
    if width <= 0 or height <= 0:
        return None
    for ratio, size in DEFAULT_RATIO_TO_SIZE_MAPPING.items():
        mapping_width, mapping_height = (int(item) for item in size.split("x", maxsplit=1))
        if width * mapping_height == height * mapping_width:
            return ratio
    return None


@dataclass(frozen=True, slots=True)
class VideoModelCapability:
    """供应商/模型能力约束。"""

    supports_seed: bool = True
    supports_watermark: bool = True
    allowed_ratios: set[str] | None = None
    default_ratio: str | None = None
    ratio_to_size_mapping: dict[str, str] | None = None
    min_seconds: int | None = 1
    max_seconds: int | None = None
    supports_subject_image_reference: bool = False
    supports_subject_video_reference: bool = False
    supports_subject_audio_reference: bool = False
    supports_subject_reference_with_frame_reference: bool = False
    max_subjects: int | None = None
    max_images_per_subject: int | None = None
    max_videos_per_subject: int | None = None
    max_audios_per_subject: int | None = None
    max_media_per_subject: int | None = None
    max_total_subject_images: int | None = None
    max_total_subject_videos: int | None = None
    supports_text_to_video: bool = True
    supports_first_frame: bool = True
    supports_last_frame: bool = True
    max_key_frames: int | None = None
    requires_first_frame: bool = False
    requires_last_frame: bool = False
    requires_subject_reference: bool = False
    allowed_seconds: set[int] | None = None
    # Ordered by low-cost preference; only the exact adapter declares verified wire values.
    supports_generate_audio: bool = False
    resolutions: tuple[str, ...] = ()
    resolution_source: str | None = None


def register_video_model_capability(
    *,
    provider: ProviderKey,
    model_prefix: str,
    capability: VideoModelCapability,
) -> None:
    """兼容入口：注册模型能力覆盖（按前缀匹配，大小写不敏感）。"""
    if provider not in {"openai", "vidu", "kling", "aliyun_bailian", "volcengine"}:
        raise ValueError(f"Video capability overrides are not implemented for {provider}")
    if provider == "openai":
        from app.core.integrations.openai.video_capabilities import register_openai_video_capability

        register_openai_video_capability(model_prefix=model_prefix, capability=capability)
        return
    if provider == "vidu":
        from app.core.integrations.vidu.video_capabilities import register_vidu_video_capability

        register_vidu_video_capability(model_prefix=model_prefix, capability=capability)
        return
    if provider == "kling":
        from app.core.integrations.kling.video_capabilities import register_kling_video_capability

        register_kling_video_capability(model_prefix=model_prefix, capability=capability)
        return
    if provider == "aliyun_bailian":
        from app.core.integrations.aliyun.video_capabilities import register_aliyun_video_capability

        register_aliyun_video_capability(model_prefix=model_prefix, capability=capability)
        return
    from app.core.integrations.volcengine.video_capabilities import register_volcengine_video_capability

    register_volcengine_video_capability(model_prefix=model_prefix, capability=capability)


def clear_video_model_capability_overrides(*, provider: ProviderKey | None = None) -> None:
    """兼容入口：清空能力覆盖；供测试或重置场景使用。"""
    from app.core.integrations.openai.video_capabilities import clear_openai_video_capability_overrides
    from app.core.integrations.vidu.video_capabilities import clear_vidu_video_capability_overrides
    from app.core.integrations.volcengine.video_capabilities import clear_volcengine_video_capability_overrides
    from app.core.integrations.kling.video_capabilities import clear_kling_video_capability_overrides
    from app.core.integrations.aliyun.video_capabilities import clear_aliyun_video_capability_overrides

    if provider is None:
        clear_openai_video_capability_overrides()
        clear_volcengine_video_capability_overrides()
        clear_vidu_video_capability_overrides()
        clear_kling_video_capability_overrides()
        clear_aliyun_video_capability_overrides()
        return
    if provider == "openai":
        clear_openai_video_capability_overrides()
        return
    if provider == "vidu":
        clear_vidu_video_capability_overrides()
        return
    if provider == "kling":
        clear_kling_video_capability_overrides()
        return
    if provider == "aliyun_bailian":
        clear_aliyun_video_capability_overrides()
        return
    clear_volcengine_video_capability_overrides()


def resolve_video_capability(*, provider: ProviderKey, model: str | None) -> VideoModelCapability:
    """Reject unknown protocols instead of silently borrowing Volcengine capabilities."""
    if provider == "jimeng":
        from app.core.integrations.jimeng_media import VIDEO_V3, VIDEO_ROUTES
        if model is None:
            return VideoModelCapability(supports_text_to_video=False, supports_first_frame=False,
                supports_last_frame=False, max_key_frames=0, supports_watermark=False)
        if model == VIDEO_V3:
            mode, tiers = "auto", ("720P", "1080P")
        elif model in VIDEO_ROUTES.values():
            mode, tier = next(pair for pair, key in VIDEO_ROUTES.items() if key == model)
            tiers = (tier,)
        else:
            raise ValueError("即梦视频服务版本未核验")
        return VideoModelCapability(supports_seed=True, supports_watermark=False,
            allowed_ratios={"16:9", "9:16", "1:1", "4:3", "3:4", "21:9"}, default_ratio="16:9",
            supports_text_to_video=mode in {"auto", "text"}, supports_first_frame=mode != "text",
            supports_last_frame=mode in {"auto", "first_last"}, requires_first_frame=mode in {"first", "first_last"},
            requires_last_frame=mode == "first_last", max_key_frames=0,
            allowed_seconds={5, 10}, min_seconds=5, max_seconds=10, resolutions=tiers,
            resolution_source="https://docs.volcengine.com/docs/85621/1792710?lang=zh")
    if provider in {"zhipu", "hunyuan"}:
        from app.core.integrations.domestic_media import VIDEO_MODELS
        if model is None:
            return VideoModelCapability(supports_seed=False, supports_watermark=False,
                supports_text_to_video=False, supports_first_frame=False, supports_last_frame=False, max_key_frames=0)
        if model not in VIDEO_MODELS[provider]:
            raise ValueError("视频型号尚未核验")
        return VideoModelCapability(supports_seed=False, supports_watermark=provider == "zhipu",
            allowed_ratios={"16:9", "9:16", "1:1"} if provider == "zhipu" else {"16:9", "9:16", "1:1", "4:3", "3:4"},
            default_ratio="16:9", supports_last_frame=provider == "zhipu", max_key_frames=0,
            allowed_seconds={5, 10} if provider == "zhipu" else {5}, min_seconds=5, max_seconds=10 if provider == "zhipu" else 5)
    if provider == "minimax":
        if model is None:
            return VideoModelCapability(supports_seed=False, supports_watermark=False,
                supports_text_to_video=False, supports_first_frame=False, supports_last_frame=False, max_key_frames=0)
        from app.core.integrations.minimax_video import HAILUO_MODELS
        if model not in HAILUO_MODELS:
            raise ValueError("海螺型号尚未核验")
        return VideoModelCapability(supports_seed=False, supports_watermark=True,
            allowed_ratios={"16:9", "9:16", "1:1", "4:3", "3:4"}, default_ratio="16:9",
            supports_text_to_video=model != "MiniMax-Hailuo-2.3-Fast",
            supports_last_frame=model == "MiniMax-Hailuo-02", max_key_frames=0,
            requires_first_frame=model == "MiniMax-Hailuo-2.3-Fast", allowed_seconds={6, 10},
            min_seconds=6, max_seconds=10, resolutions=("768P",))
    if provider not in {"openai", "vidu", "kling", "aliyun_bailian", "volcengine"}:
        raise ValueError(f"Video generation is not implemented for {provider}")
    if provider == "openai":
        from app.core.integrations.openai.video_capabilities import resolve_openai_video_capability

        return resolve_openai_video_capability(model)
    if provider == "vidu":
        from app.core.integrations.vidu.video_capabilities import resolve_vidu_video_capability

        return resolve_vidu_video_capability(model)
    if provider == "kling":
        from app.core.integrations.kling.video_capabilities import resolve_kling_video_capability

        return resolve_kling_video_capability(model)
    if provider == "aliyun_bailian":
        from app.core.integrations.aliyun.video_capabilities import resolve_aliyun_video_capability

        return resolve_aliyun_video_capability(model)
    from app.core.integrations.volcengine.video_capabilities import resolve_volcengine_video_capability

    return resolve_volcengine_video_capability(model)


def resolve_effective_ratio(input_: VideoGenerationInput) -> str | None:
    return input_.ratio


def resolve_default_ratio(*, provider: ProviderKey, model: str | None) -> str | None:
    cap = resolve_video_capability(provider=provider, model=model)
    if cap.default_ratio:
        return cap.default_ratio
    if cap.allowed_ratios:
        return sorted(cap.allowed_ratios)[0]
    return "16:9"


def derive_provider_size(
    *,
    provider: ProviderKey,
    model: str | None,
    ratio: VideoRatio,
) -> str | None:
    cap = resolve_video_capability(provider=provider, model=model)
    mapping = cap.ratio_to_size_mapping or DEFAULT_RATIO_TO_SIZE_MAPPING
    return mapping.get(ratio)


def validate_video_options(
    *,
    provider: ProviderKey,
    model: str | None,
    input_: VideoGenerationInput,
) -> None:
    cap = resolve_video_capability(provider=provider, model=model)
    if getattr(input_, "resolution", None) is not None and input_.resolution not in cap.resolutions:
        raise ValueError("当前模型不支持所选分辨率")
    if getattr(input_, "generate_audio", None) is not None and not cap.supports_generate_audio:
        raise ValueError("当前模型不支持配置原生音频")
    if input_.ratio and cap.allowed_ratios is not None and input_.ratio not in cap.allowed_ratios:
        raise ValueError(
            f"Unsupported ratio for provider={provider} model={model or '<default>'}: {input_.ratio}. "
            f"Allowed: {sorted(cap.allowed_ratios)}"
        )
    if input_.seconds is not None:
        if cap.allowed_seconds is not None and input_.seconds not in cap.allowed_seconds:
            raise ValueError(f"seconds must be one of {sorted(cap.allowed_seconds)}")
        if cap.min_seconds is not None and input_.seconds < cap.min_seconds:
            raise ValueError(f"seconds must be >= {cap.min_seconds}")
        if cap.max_seconds is not None and input_.seconds > cap.max_seconds:
            raise ValueError(f"seconds must be <= {cap.max_seconds}")
    if input_.seed is not None and not cap.supports_seed:
        raise ValueError(f"seed is not supported by provider={provider} model={model or '<default>'}")
    if input_.watermark is not None and not cap.supports_watermark:
        raise ValueError(f"watermark is not supported by provider={provider} model={model or '<default>'}")
    subjects = input_.subject_references
    frames = input_.frame_references
    has_first = bool(frames.first_frame)
    has_last = bool(frames.last_frame)
    key_frame_count = len(frames.key_frames)
    if cap.requires_last_frame and not has_last:
        raise ValueError(f"last frame is required by provider={provider} model={model or '<default>'}；请同时提供首帧与尾帧")
    if cap.requires_first_frame and not has_first:
        raise ValueError(f"first frame is required by provider={provider} model={model or '<default>'}；该型号必须输入首帧。请在分镜工作室生成或上传首帧并选择首帧参考；只有文字时请明确选择支持文生视频的型号。资产关联图不会自动等同于镜头首帧。")
    if cap.requires_subject_reference and not subjects:
        raise ValueError(f"reference media is required by provider={provider} model={model or '<default>'}")
    if not (has_first or has_last or key_frame_count or subjects) and not cap.supports_text_to_video:
        raise ValueError(f"text-to-video is not supported by provider={provider} model={model or '<default>'}")
    if has_first and not cap.supports_first_frame:
        raise ValueError(f"first frame is not supported by provider={provider} model={model or '<default>'}")
    if has_last and not cap.supports_last_frame:
        raise ValueError(f"last frame is not supported by provider={provider} model={model or '<default>'}")
    if cap.max_key_frames is not None and key_frame_count > cap.max_key_frames:
        raise ValueError(f"key frames must contain at most {cap.max_key_frames} items")
    if not subjects:
        return
    has_frame_reference = any(
        (
            input_.frame_references.first_frame,
            input_.frame_references.last_frame,
            *input_.frame_references.key_frames,
        )
    )
    if has_frame_reference and not cap.supports_subject_reference_with_frame_reference:
        raise ValueError(
            f"subject references cannot be combined with frame references for provider={provider} "
            f"model={model or '<default>'}"
        )
    if cap.max_subjects is not None and len(subjects) > cap.max_subjects:
        raise ValueError(f"subject references must contain at most {cap.max_subjects} subjects")
    total_images = sum(sum(r.media_kind == "image" for r in subject.media) for subject in subjects)
    if cap.max_total_subject_images is not None and total_images > cap.max_total_subject_images:
        raise ValueError(f"主体参考图片总数不能超过 {cap.max_total_subject_images} 张")
    total_subject_videos = sum(
        sum(reference.media_kind == "video" for reference in subject.media)
        for subject in subjects
    )
    if cap.max_total_subject_videos is not None and total_subject_videos > cap.max_total_subject_videos:
        raise ValueError(f"subject references support at most {cap.max_total_subject_videos} videos in total")
    for subject in subjects:
        images = [reference for reference in subject.media if reference.media_kind == "image"]
        videos = [reference for reference in subject.media if reference.media_kind == "video"]
        audios = [reference for reference in subject.media if reference.media_kind == "audio"]
        if images and not cap.supports_subject_image_reference:
            raise ValueError(f"subject image references are not supported by provider={provider} model={model or '<default>'}")
        if videos and not cap.supports_subject_video_reference:
            raise ValueError(f"subject video references are not supported by provider={provider} model={model or '<default>'}")
        if audios and not cap.supports_subject_audio_reference:
            raise ValueError(f"subject audio references are not supported by provider={provider} model={model or '<default>'}")
        if audios and not (images or videos):
            raise ValueError("subject audio reference requires an image or video to bind its voice")
        if cap.max_images_per_subject is not None and len(images) > cap.max_images_per_subject:
            raise ValueError(f"a subject supports at most {cap.max_images_per_subject} reference images")
        if cap.max_videos_per_subject is not None and len(videos) > cap.max_videos_per_subject:
            raise ValueError(f"a subject supports at most {cap.max_videos_per_subject} reference videos")
        if cap.max_audios_per_subject is not None and len(audios) > cap.max_audios_per_subject:
            raise ValueError(f"a subject supports at most {cap.max_audios_per_subject} reference audios")
        if cap.max_media_per_subject is not None and len(subject.media) > cap.max_media_per_subject:
            raise ValueError(f"a subject supports at most {cap.max_media_per_subject} reference media items")


def supports_studio_subject_images(provider: str, model: str) -> bool:
    """Expose only exact names whose native subject-image wire format is verified for the studio."""
    return (provider, model.lower()) in {
        ('aliyun_bailian', 'happyhorse-1.1-r2v'),
        ('vidu', 'viduq2'), ('vidu', 'viduq1'), ('vidu', 'vidu2.0'),
    }
