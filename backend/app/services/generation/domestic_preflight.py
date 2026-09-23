"""Free prerequisite checks for new domestic adapters before task persistence."""
from types import SimpleNamespace
from fastapi import HTTPException
from app.core.contracts.media import ImageMediaInput, VideoMediaInput
from app.core.integrations.video_capabilities import validate_video_options
from app.core.integrations.image_capabilities import resolve_image_capability


def validate_domestic_submission(*, provider, model, operation, media):
    """Reject incompatible selections without resolving bytes or invoking a model."""
    if provider not in {"minimax", "zhipu", "hunyuan", "jimeng"}:
        return
    try:
        if operation.kind == "video_generation":
            value = media if isinstance(media, VideoMediaInput) else VideoMediaInput()
            validate_video_options(provider=provider, model=model, input_=SimpleNamespace(
                model=model, ratio=operation.ratio, seconds=operation.seconds, seed=operation.seed, watermark=None,
                resolution=operation.resolution, generate_audio=operation.generate_audio,
                subject_references=value.subjects, frame_references=SimpleNamespace(
                    first_frame=value.frames.first, last_frame=value.frames.last, key_frames=value.frames.keys)))
            if provider == "jimeng":
                from app.core.integrations.jimeng_media import video_route
                video_route(model, first=bool(value.frames.first), last=bool(value.frames.last), resolution=operation.resolution)
            if provider == "minimax" and not value.frames.first and operation.ratio != "16:9":
                raise ValueError("当前海螺纯文字模式仅开放16:9，其他画幅需首帧")
        elif operation.kind == "image_generation":
            cap = resolve_image_capability(provider=provider, model=model)
            if operation.count > (cap.max_n or 1):
                raise ValueError("当前型号不支持所选图片数量")
            if operation.target_ratio and cap.supported_ratios and operation.target_ratio not in cap.supported_ratios:
                raise ValueError("当前型号不支持所选图片比例")
            if operation.resolution_profile == "high" and provider not in {"zhipu", "jimeng"}:
                raise ValueError("当前适配仅开放标准档，请显式更改档位")
            refs = media.references if isinstance(media, ImageMediaInput) else []
            if refs and provider in {"minimax", "zhipu"}:
                raise ValueError("此型号当前业务未开放通用本地参考图，请改选已接通参考图的模型；不会忽略素材")
            if provider == "jimeng":
                from app.core.integrations.jimeng_media import image_profiles
                profiles = image_profiles(model, len(refs))
                if operation.resolution_profile and operation.resolution_profile not in next(iter(profiles.values())):
                    raise ValueError("即梦当前参考方式不支持所选图片档位，请重新选择")
            if provider == "hunyuan" and len(refs) > 3:
                raise ValueError("混元图片最多3张参考图")
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
