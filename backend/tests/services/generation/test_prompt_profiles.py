"""供应商提示词适配规则测试。"""

from app.core.contracts.generation import (GenerationModality,
                                           GenerationTargetKind)
from app.core.contracts.media import (MediaReference,
                                      VideoFrameMediaReferences,
                                      VideoMediaInput,
                                      VideoSubjectMediaReference)
from app.services.generation.prompt_profiles import \
    apply_generation_prompt_profile


def test_wan_shot_prompt_gets_single_shot_and_ordered_reference_aliases() -> None:
    """Wan 2.7 生产镜头应按真实 media 顺序声明图像与视频编号。"""
    media = VideoMediaInput(
        frames=VideoFrameMediaReferences(
            first=MediaReference(file_id="first", media_kind="image", ordinal=0),
        ),
        subjects=[
            VideoSubjectMediaReference(
                name="小林",
                media=[
                    MediaReference(file_id="face", media_kind="image", ordinal=0),
                    MediaReference(file_id="motion", media_kind="video", ordinal=1),
                ],
            )
        ],
    )

    result = apply_generation_prompt_profile(
        prompt="小林转身看向门口",
        modality=GenerationModality.video,
        target_kind=GenerationTargetKind.shot_video,
        provider_key="aliyun_bailian",
        model_name="wan2.7-r2v",
        media=media,
    )

    assert result.prompt is not None
    assert "生成单镜头" in result.prompt
    assert "首帧=首帧约束" in result.prompt
    assert "图1=小林" in result.prompt
    assert "视频1=小林" in result.prompt
    assert result.applied_rules == ("aliyun_wan_single_shot", "aliyun_wan_reference_aliases")


def test_prompt_profile_does_not_expand_free_experiment_or_duplicate_rules() -> None:
    """实验室保持自由提示词，生产镜头重复执行也不会重复追加规则。"""
    experiment = apply_generation_prompt_profile(
        prompt="一只猫",
        modality=GenerationModality.video,
        target_kind=GenerationTargetKind.experiment_session,
        provider_key="aliyun_bailian",
        model_name="wan2.7-t2v",
        media=None,
    )
    assert experiment.prompt == "一只猫"
    assert experiment.applied_rules == ()

    first = apply_generation_prompt_profile(
        prompt="生成单镜头。\n人物向前走",
        modality=GenerationModality.video,
        target_kind=GenerationTargetKind.shot_video,
        provider_key="aliyun_bailian",
        model_name="wan2.7-t2v",
        media=None,
    )
    assert first.prompt is not None
    assert first.prompt.count("生成单镜头") == 1
    assert first.applied_rules == ()


def test_vidu_named_subjects_use_at_mentions() -> None:
    """Vidu 命名主体进入提示词时使用其官方 @name 语义。"""
    media = VideoMediaInput(
        subjects=[
            VideoSubjectMediaReference(
                name="女主",
                media=[MediaReference(file_id="hero", media_kind="image", ordinal=0)],
            )
        ]
    )
    result = apply_generation_prompt_profile(
        prompt="女主推开门",
        modality=GenerationModality.video,
        target_kind=GenerationTargetKind.shot_video,
        provider_key="vidu",
        model_name="viduq2-pro",
        media=media,
    )
    assert result.prompt is not None and "@女主" in result.prompt
    assert result.applied_rules == ("vidu_named_subjects",)
