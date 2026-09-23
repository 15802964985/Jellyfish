"""按供应商官方语义为最终生成提示词补充最小、可审计的执行指令。"""

from __future__ import annotations

from dataclasses import dataclass

from app.core.contracts.generation import (GenerationModality,
                                           GenerationTargetKind)
from app.core.contracts.media import ImageMediaInput, VideoMediaInput


@dataclass(frozen=True, slots=True)
class PromptProfileResult:
    """保存适配后的提示词与实际应用的规则标识。"""

    prompt: str | None
    applied_rules: tuple[str, ...] = ()


def _append_once(prompt: str, block: str, *, marker: str) -> tuple[str, bool]:
    """仅在目标语义尚未出现时追加一段约束，避免重试时重复膨胀。"""
    if marker in prompt.replace(" ", ""):
        return prompt, False
    return f"{prompt}\n\n{block}".strip(), True


def _aliyun_reference_mapping(media: VideoMediaInput) -> str:
    """按百炼 media 数组的图片/视频独立计数规则生成可读映射。"""
    image_index = 0
    video_index = 0
    mappings: list[str] = []

    for label, reference in (
        ("首帧", media.frames.first),
        ("尾帧", media.frames.last),
    ):
        if reference is not None:
            mappings.append(f"{label}={label}约束")
    for index, _reference in enumerate(media.frames.keys, start=1):
        mappings.append(f"关键帧{index}=时间过程约束")
    for subject in media.subjects:
        for reference in sorted(subject.media, key=lambda item: item.ordinal):
            if reference.media_kind == "image":
                image_index += 1
                mappings.append(f"图{image_index}={subject.name}")
            elif reference.media_kind == "video":
                video_index += 1
                mappings.append(f"视频{video_index}={subject.name}")
    return "、".join(mappings)


def apply_generation_prompt_profile(
    *,
    prompt: str | None,
    modality: GenerationModality,
    target_kind: GenerationTargetKind,
    provider_key: str,
    model_name: str,
    media: ImageMediaInput | VideoMediaInput | None,
) -> PromptProfileResult:
    """应用保守的模型提示词规范，且不改写用户已经表达的创作内容。

    当前只处理官方明确要求、同时会影响 API 解释结果的规则。自由实验提示词
    不自动扩写；生产镜头才加入单镜头与参考素材编号约束。
    """
    text = (prompt or "").strip()
    if not text or modality != GenerationModality.video or target_kind != GenerationTargetKind.shot_video:
        return PromptProfileResult(prompt=text or None)

    provider = provider_key.strip().lower()
    model = model_name.strip().lower()
    rules: list[str] = []

    if provider == "aliyun_bailian" and (model.startswith("wan2.7") or model.startswith("wan3")):
        text, appended = _append_once(text, "生成单镜头。", marker="生成单镜头")
        if appended:
            rules.append("aliyun_wan_single_shot")

        if isinstance(media, VideoMediaInput):
            mapping = _aliyun_reference_mapping(media)
            if mapping:
                text, appended = _append_once(
                    text,
                    f"参考素材编号（严格按传入顺序）：{mapping}。参考素材只用于身份、外观、场景与动作一致性，不要求机械复刻。",
                    marker="参考素材编号（严格按传入顺序）",
                )
                if appended:
                    rules.append("aliyun_wan_reference_aliases")

    if provider == "aliyun_bailian" and model == "happyhorse-1.1-r2v" and isinstance(media, VideoMediaInput):
        # Native aliases must follow precisely the same ordering as the transmitted media array.
        mappings = []
        for subject in media.subjects:
            for reference in sorted(subject.media, key=lambda item: item.ordinal):
                if reference.media_kind == 'image':
                    mappings.append(f"[Image {len(mappings) + 1}]={subject.name}")
        if mappings:
            # Replace only our generated mapping line when the user changes reference order.
            text = '\n'.join(line for line in text.splitlines() if not line.startswith('主体图片映射：')).strip()
            text, appended = _append_once(text,
                "主体图片映射：" + "；".join(mappings) + "。按用途参考主体特征，动作与构图遵循本镜头提示词。",
                marker="主体图片映射：")
            if appended: rules.append('happyhorse_reference_aliases')

    if provider == "vidu" and isinstance(media, VideoMediaInput) and media.subjects:
        mentions = "、".join(f"@{subject.name}" for subject in media.subjects)
        text, appended = _append_once(
            text,
            f"主体参考：{mentions}。保持主体身份特征稳定，动作、表情与构图可按当前镜头自然变化。",
            marker="主体参考：",
        )
        if appended:
            rules.append("vidu_named_subjects")

    return PromptProfileResult(prompt=text, applied_rules=tuple(rules))
