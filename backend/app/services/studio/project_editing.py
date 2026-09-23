"""剪辑工程保存、来源验证与一致性复核，不调用生成模型。"""
from __future__ import annotations

import hashlib
import json

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.studio import Chapter, FileItem, FileUsage, Project, Shot, ShotDetail, ShotDialogLine, Character, Actor, Costume, CharacterImage, ShotCharacterLink
from app.models.studio_projects import ProjectEdit
from app.schemas.studio.timeline import EditSubtitle, EditVideoClip, ProjectEditPlan, ProjectEditRead, ProjectEditSave, EditCharacterReference
from app.services.studio.file_usages import upsert_file_usage


async def load_project_edit(db: AsyncSession, project_id: str) -> ProjectEditRead:
    """首次按实际镜头建立草案；已保存工程始终保留固定文件。"""
    from app.services.studio.project_video_export import build_project_timeline
    timeline = await build_project_timeline(db, project_id=project_id)
    row = await db.get(ProjectEdit, project_id)
    if row:
        plan = ProjectEditPlan.model_validate(row.plan)
    else:
        plan = ProjectEditPlan(clips=[EditVideoClip(id=c.shot_id, shot_id=c.shot_id,
            file_id=c.file_id, label=c.label, out_seconds=c.duration_seconds) for c in timeline.clips])
        cursor = 0.0
        for clip in plan.clips:
            lines = (await db.execute(select(ShotDialogLine).where(ShotDialogLine.shot_detail_id == clip.shot_id)
                .order_by(ShotDialogLine.index))).scalars().all()
            lines = [line for line in lines if line.text.strip()]
            total = sum(len(line.text) for line in lines)
            pos = cursor
            for line in lines:
                end = pos + clip.out_seconds * len(line.text) / total
                plan.subtitles.append(EditSubtitle(id=f"dialogue-{line.id}", start_seconds=round(pos, 3),
                    end_seconds=round(end, 3), text=f"{line.speaker_name}：{line.text}" if line.speaker_name else line.text))
                pos = end
            cursor += clip.out_seconds
    references = await character_references(db, project_id)
    for clip in plan.clips:
        signature = reference_signature(references, clip.shot_id)
        if clip.reference_signature and clip.reference_signature != signature:
            clip.review = "unchecked"
        clip.reference_signature = signature
    current = {c.shot_id: c.file_id for c in timeline.clips}
    warnings = [f"{c.label}：镜头当前视频已变化，工程仍使用原版本；请比较后主动替换。"
                for c in plan.clips if current.get(c.shot_id) != c.file_id]
    if any(c.review != "approved" for c in plan.clips):
        warnings.append("部分片段尚未通过人物/服装/道具/声音/衔接人工复核；生成成功不代表质量合格。")
    return ProjectEditRead(revision=row.revision if row else 0, plan=plan, warnings=warnings, character_references=references)


async def validate_edit_plan(db: AsyncSession, project_id: str, plan: ProjectEditPlan,
                             previous: ProjectEditPlan | None = None) -> None:
    """验证项目归属、固定媒体存在性和真实时长，避免跨镜头误用与越界裁剪。"""
    ids = [c.id for c in plan.clips] + [a.id for a in plan.audio] + [s.id for s in plan.subtitles]
    if len(ids) != len(set(ids)):
        raise ValueError("剪辑片段 ID 重复")
    rows = (await db.execute(select(Shot, ShotDetail).join(Chapter, Chapter.id == Shot.chapter_id)
        .outerjoin(ShotDetail, ShotDetail.id == Shot.id).where(Chapter.project_id == project_id))).all()
    shots = {s.id: (s, d) for s, d in rows}
    old_pairs = {(c.shot_id, c.file_id) for c in previous.clips} if previous else set()
    for clip in plan.clips:
        pair = shots.get(clip.shot_id)
        if not pair:
            raise ValueError("片段不属于当前项目")
        shot, detail = pair
        if clip.file_id != shot.generated_video_file_id and (clip.shot_id, clip.file_id) not in old_pairs:
            raise ValueError("请先在分镜工作室采用对应视频，再主动替换工程片段")
        file = await db.get(FileItem, clip.file_id)
        if not file or file.type != "video" or not file.storage_key:
            raise ValueError("视频文件已不存在")
        duration = (file.duration_ms or 0) / 1000 or (detail.duration if detail else 0)
        if not duration or clip.out_seconds > duration + 0.02:
            raise ValueError(f"{clip.label}：裁剪超出源视频时长或源时长未知")
    for index, clip in enumerate(plan.clips):
        incoming = plan.clips[index - 1].transition_seconds if index and plan.clips[index - 1].transition != "cut" else 0
        outgoing = clip.transition_seconds if clip.transition != "cut" else 0
        if outgoing and index == len(plan.clips) - 1:
            raise ValueError("最后片段没有后续镜头，请取消出场转场")
        if incoming + outgoing > clip.out_seconds - clip.in_seconds - 0.04:
            raise ValueError(f"{clip.label}：转场重叠超过片段可用时长，请缩短转场")
    duration = edit_duration(plan)
    for audio in plan.audio:
        file = await db.get(FileItem, audio.file_id)
        if not file or file.type != "audio" or not file.storage_key:
            raise ValueError("请选择有效音频文件")
        if not file.duration_ms or audio.in_seconds + audio.duration_seconds > file.duration_ms / 1000 + 0.02:
            raise ValueError(f"{audio.label}：音频裁剪越界或时长未知")
        if audio.start_seconds + audio.duration_seconds > duration + 0.02:
            raise ValueError(f"{audio.label}：音频超出成片长度，请裁剪或调整起点")
    for subtitle in plan.subtitles:
        if subtitle.end_seconds > duration + 0.02:
            raise ValueError("字幕超出成片长度，请重新校时")


async def pin_edit_files(db: AsyncSession, project_id: str, plan: ProjectEditPlan, source_ref: str) -> None:
    """登记工程/导出使用的媒体，文件管理删除时可识别关联。"""
    for file_id in {c.file_id for c in plan.clips} | {a.file_id for a in plan.audio}:
        await upsert_file_usage(db, file_id=file_id, project_id=project_id, chapter_id=None,
            shot_id=None, usage_kind="project_edit", source_ref=source_ref)


async def save_project_edit(db: AsyncSession, project_id: str, body: ProjectEditSave) -> ProjectEditRead:
    """锁项目行串行保存，以修订号防止首次创建及后续并发覆盖。"""
    project = (await db.execute(select(Project).where(Project.id == project_id).with_for_update())).scalar_one_or_none()
    if not project:
        raise LookupError("项目不存在")
    row = await db.get(ProjectEdit, project_id, populate_existing=True)
    if (row.revision if row else 0) != body.expected_revision:
        raise ValueError("工程已在其他页面更新，请保留当前修改并刷新后核对")
    old = ProjectEditPlan.model_validate(row.plan) if row else None
    await validate_edit_plan(db, project_id, body.plan, old)
    # 改动视频、剪辑顺序或声音后，旧审片标记不再代表新组合已通过。
    references = await character_references(db, project_id)
    if old:
        old_by_id = {c.id: c for c in old.clips}
        old_order = [c.id for c in old.clips]
        for index, clip in enumerate(body.plan.clips):
            prior = old_by_id.get(clip.id)
            changed = (not prior or any(getattr(prior, key) != getattr(clip, key)
                for key in ("file_id", "shot_id", "in_seconds", "out_seconds", "volume", "transition", "transition_seconds"))
                or prior.reference_signature != reference_signature(references, clip.shot_id)
                or old_order != [c.id for c in body.plan.clips] or old.audio != body.plan.audio or old.subtitles != body.plan.subtitles)
            if changed:
                clip.review = "unchecked"
    for clip in body.plan.clips:
        clip.reference_signature = reference_signature(references, clip.shot_id)
    if row:
        row.plan = body.plan.model_dump(mode="json")
        row.revision += 1
    else:
        row = ProjectEdit(project_id=project_id, revision=1, plan=body.plan.model_dump(mode="json"))
        db.add(row)
    source_ref = f"project:{project_id}:edit"
    await db.execute(delete(FileUsage).where(FileUsage.project_id == project_id,
        FileUsage.usage_kind == "project_edit", FileUsage.source_ref == source_ref))
    await pin_edit_files(db, project_id, body.plan, source_ref)
    await db.flush()
    return await load_project_edit(db, project_id)


async def character_references(db: AsyncSession, project_id: str) -> list[EditCharacterReference]:
    """批量读取人物身份、演员、服装和主图，供前后镜头对照。"""
    rows = (await db.execute(select(ShotCharacterLink.shot_id, Character, Actor.name, Costume.name)
        .join(Character, Character.id == ShotCharacterLink.character_id)
        .outerjoin(Actor, Actor.id == Character.actor_id).outerjoin(Costume, Costume.id == Character.costume_id)
        .where(Character.project_id == project_id).order_by(ShotCharacterLink.shot_id, ShotCharacterLink.index))).all()
    images = (await db.execute(select(CharacterImage).where(CharacterImage.character_id.in_([c.id for _, c, _, _ in rows]),
        CharacterImage.file_id.is_not(None)).order_by(CharacterImage.is_primary.desc(), CharacterImage.id))).scalars().all()
    primary = {}
    for image in images:
        primary.setdefault(image.character_id, image.file_id)
    from app.services.studio.character_appearances import selected_appearances
    appearances={shot_id:await selected_appearances(db,shot_id) for shot_id in {r[0] for r in rows}}
    result=[]
    for shot_id,c,actor,costume in rows:
        look=appearances[shot_id].get(c.id)
        data=look.data if look else {}
        views=data.get('views',[])
        result.append(EditCharacterReference(shot_id=shot_id,character_id=c.id,name=c.name,
            description=(c.description or '') + (f"\n本镜头造型：{look.name} v{look.version}；"+data.get('description','') if look else ''),
            actor_name=actor,costume_name=data.get('costume_name') if look else costume,
            image_file_id=(views[0]['file_id'] if views else None) if look else primary.get(c.id)))
    return result


def reference_signature(references: list[EditCharacterReference], shot_id: str) -> str:
    """人物基准改变时，让旧人工复核失效；摘要不推断画面一致性。"""
    values = [r.model_dump() for r in references if r.shot_id == shot_id]
    return hashlib.sha256(json.dumps(values, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


def edit_duration(plan: ProjectEditPlan) -> float:
    """叠化重叠只计算一次，音轨/字幕校验和导出共用此时间口径。"""
    return sum(c.out_seconds - c.in_seconds for c in plan.clips) - sum(
        c.transition_seconds for c in plan.clips[:-1] if c.transition != "cut")
