"""系统提示词模板种子覆盖实际生产链的关键类别。"""

from app.scripts.seed_system_data import _seed_statements


def test_prompt_seed_covers_all_production_image_and_video_categories() -> None:
    """种子必须覆盖资产、场景、三类镜头帧和视频生成模板。"""
    sql = "\n".join(_seed_statements())
    expected_ids = {
        "system_actor_image",
        "system_character_image",
        "system_prop_image",
        "system_costume_image",
        "system_scene_image_front",
        "system_scene_image_other",
        "system_frame_head_image",
        "system_frame_key_image",
        "system_frame_tail_image",
        "system_video_prompt",
    }
    assert all(template_id in sql for template_id in expected_ids)
    assert all(f"'{legacy_id}'" in sql for legacy_id in range(1, 7))
    assert "WHERE is_system = 1 AND" in sql


def test_prompt_seed_does_not_add_dead_audio_or_combined_templates() -> None:
    """没有生产调用链的类别不能用静态系统模板伪装成已接入。"""
    sql = "\n".join(_seed_statements())
    assert "'bgm'" not in sql
    assert "'sfx'" not in sql
    assert "'combined'" not in sql
