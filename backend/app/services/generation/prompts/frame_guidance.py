"""分镜帧提示词渲染所需的服务端 guidance 加载能力。"""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.studio import ShotFrameType
from app.services.generation.prompts.frame_context import FrameRenderGuidance, build_frame_render_guidance


def _empty_frame_render_guidance() -> FrameRenderGuidance:
    """返回缺少镜头上下文时的稳定空 guidance，避免渲染接口泄漏旧任务错误。"""
    return {
        "director_command_summary": "",
        "continuity_guidance": "",
        "frame_specific_guidance": "",
        "composition_anchor": "",
        "screen_direction_guidance": "",
    }


async def load_frame_render_guidance(
    *,
    db: AsyncSession,
    shot_id: str,
    frame_type: ShotFrameType,
) -> FrameRenderGuidance:
    """加载指定分镜帧的服务端约束，供统一 Renderer 注入不可编辑的业务事实。"""
    try:
        return await build_frame_render_guidance(
            db=db,
            shot_id=shot_id,
            frame_type=frame_type.value if hasattr(frame_type, "value") else str(frame_type),
        )
    except HTTPException:
        return _empty_frame_render_guidance()


async def build_initial_frame_prompt(*, db: AsyncSession, shot_id: str, frame_type: ShotFrameType) -> dict:
    """免费整理当前镜头证据为可编辑单帧草稿，不保存、不调用模型、不补造剧情。"""
    from app.models.studio import Shot
    from app.services.generation.quality_sources import collect_quality_sources
    shot = await db.get(Shot, shot_id)
    if shot is None:
        raise HTTPException(status_code=404, detail="分镜不存在")
    sources = await collect_quality_sources(db, shot_id=shot_id, prompt=None)
    guidance = await load_frame_render_guidance(db=db, shot_id=shot_id, frame_type=frame_type)
    label = {"first": "首帧", "key": "关键帧", "last": "尾帧"}[frame_type.value]
    blocks = [f"生成本镜头的{label}单张画面，不要拼图或同时表现连续动作。", f"镜头：{shot.title}"]
    labels = {"script_excerpt": "镜头剧本摘录（仅作为剧情上下文）", "description": "画面描述", "camera_shot": "景别", "angle": "视角", "creative_direction": "有效创作设定", "style": "项目风格", "visual_style": "视觉风格"}
    asset_labels = {"character": "角色", "scene": "场景", "prop": "道具", "costume": "服装"}
    used = []
    for source in sources.sources:
        if not source.text or not source.text.strip():
            continue
        if source.kind in ("shot", "shot_detail", "project") and source.field in labels:
            if source.kind == "project" and source.field == "description":
                continue
            name = labels[source.field]
        elif source.kind in asset_labels:
            name = "已关联" + asset_labels[source.kind]
        else:
            continue
        blocks.append(f"【{name}】\n{source.text}")
        used.append(name)
    blocks.append("【本帧画面阶段】\n" + guidance["frame_specific_guidance"])
    warnings = [] if shot.script_excerpt or any(s.kind == "shot_detail" and s.field == "description" and s.text for s in sources.sources) else ["当前镜头缺少剧本摘录和画面描述，请补充具体人物、场景和动作后生成。"]
    return {"prompt": "\n\n".join(blocks), "sources": list(dict.fromkeys(used)), "warnings": warnings, "notice": "依据已有资料免费整理，未调用模型；请核对并自由修改。"}
