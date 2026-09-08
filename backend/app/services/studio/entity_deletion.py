"""Impact preview and transactional unlink-before-delete for Studio assets."""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field
from typing import Any

from fastapi import HTTPException
from sqlalchemy import delete, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.studio import (
    AssetFileLink,
    AudioAsset,
    Chapter,
    Character,
    CharacterPropLink,
    FileItem,
    Project,
    Shot,
    ShotCandidateStatus,
    ShotCharacterLink,
    ShotDetail,
    ShotDialogLine,
    ShotExtractedCandidate,
)
from app.schemas.studio.entity_deletion import EntityDeleteImpactGroup, EntityDeleteImpactRead
from app.services.common import entity_not_found
from app.services.studio.entity_specs import LINK_MODEL_BY_ENTITY, entity_spec, normalize_entity_type

_DISPLAY_ITEM_LIMIT = 30


@dataclass(slots=True)
class _ImpactCollector:
    """Accumulate relation labels while keeping large confirmations readable."""

    groups: list[EntityDeleteImpactGroup] = field(default_factory=list)

    def add(self, relation_type: str, label: str, items: Iterable[str]) -> None:
        """Add a non-empty group with exact total and a bounded item preview."""

        values = list(dict.fromkeys(value for value in items if value))
        if not values:
            return
        self.groups.append(
            EntityDeleteImpactGroup(
                relation_type=relation_type,
                label=label,
                count=len(values),
                items=values[:_DISPLAY_ITEM_LIMIT],
            )
        )


def _scope_label(
    *,
    project_name: str,
    chapter_index: int | None,
    chapter_title: str | None,
    shot_index: int | None,
    shot_title: str | None,
) -> str:
    """Format one project/chapter/shot scope into a compact confirmation line."""

    parts = [f"项目《{project_name}》"]
    if chapter_index is not None:
        parts.append(f"章节 {chapter_index}「{chapter_title or '未命名'}」")
    if shot_index is not None:
        parts.append(f"镜头 {shot_index}「{shot_title or '未命名'}」")
    return " / ".join(parts)


async def _project_scope_items(
    db: AsyncSession, *, entity_type: str, entity_id: str
) -> list[str]:
    """Resolve generic project link rows to concrete project/chapter/shot names."""

    if entity_type not in LINK_MODEL_BY_ENTITY:
        return []
    link_model, asset_field = LINK_MODEL_BY_ENTITY[entity_type]
    stmt = (
        select(
            Project.name,
            Chapter.index,
            Chapter.title,
            Shot.index,
            Shot.title,
        )
        .select_from(link_model)
        .join(Project, Project.id == link_model.project_id)
        .outerjoin(Chapter, Chapter.id == link_model.chapter_id)
        .outerjoin(Shot, Shot.id == link_model.shot_id)
        .where(getattr(link_model, asset_field) == entity_id)
    )
    return [
        _scope_label(
            project_name=row[0],
            chapter_index=row[1],
            chapter_title=row[2],
            shot_index=row[3],
            shot_title=row[4],
        )
        for row in (await db.execute(stmt)).all()
    ]


async def _shot_reference_items(db: AsyncSession, stmt: Any) -> list[str]:
    """Execute a statement returning project/chapter/shot display columns."""

    return [
        _scope_label(
            project_name=row[0],
            chapter_index=row[1],
            chapter_title=row[2],
            shot_index=row[3],
            shot_title=row[4],
        )
        for row in (await db.execute(stmt)).all()
    ]


async def get_entity_delete_impact(
    db: AsyncSession, *, entity_type: str, entity_id: str
) -> EntityDeleteImpactRead:
    """Return concrete active relations and owned images before destructive deletion."""

    normalized = normalize_entity_type(entity_type)
    spec = entity_spec(normalized)
    entity = await db.get(spec.model, entity_id)
    if entity is None:
        raise HTTPException(status_code=404, detail=entity_not_found(spec.model.__name__))

    collector = _ImpactCollector()
    collector.add(
        "project_scope",
        "项目、章节或镜头关联",
        await _project_scope_items(db, entity_type=normalized, entity_id=entity_id),
    )

    attachment_rows = (
        await db.execute(
            select(FileItem.original_name, FileItem.name)
            .select_from(AssetFileLink)
            .join(FileItem, FileItem.id == AssetFileLink.file_id)
            .where(
                AssetFileLink.entity_type == normalized,
                AssetFileLink.entity_id == entity_id,
            )
        )
    ).all()
    collector.add("reference_material", "参考素材", [row[0] or row[1] for row in attachment_rows])

    image_rows = (
        await db.execute(
            select(spec.image_model.view_angle, spec.image_model.file_id).where(
                getattr(spec.image_model, spec.id_field) == entity_id
            )
        )
    ).all()
    collector.add(
        "owned_image",
        "资产图片（随资产删除）",
        [f"{getattr(row[0], 'value', row[0])}视角{f' · 文件 {row[1]}' if row[1] else ' · 空槽位'}" for row in image_rows],
    )

    if normalized == "actor":
        rows = (
            await db.execute(
                select(Project.name, Character.name)
                .select_from(Character)
                .join(Project, Project.id == Character.project_id)
                .where(Character.actor_id == entity_id)
            )
        ).all()
        collector.add("character_actor", "角色使用该演员", [f"项目《{row[0]}》 / 角色「{row[1]}」" for row in rows])
    elif normalized == "character":
        project_name = await db.scalar(select(Project.name).where(Project.id == entity.project_id))
        collector.add("project_owner", "所属项目", [f"项目《{project_name or entity.project_id}》"])
        shot_stmt = (
            select(Project.name, Chapter.index, Chapter.title, Shot.index, Shot.title)
            .select_from(ShotCharacterLink)
            .join(Shot, Shot.id == ShotCharacterLink.shot_id)
            .join(Chapter, Chapter.id == Shot.chapter_id)
            .join(Project, Project.id == Chapter.project_id)
            .where(ShotCharacterLink.character_id == entity_id)
        )
        collector.add("shot_character", "镜头角色阵容", await _shot_reference_items(db, shot_stmt))
        dialog_stmt = (
            select(Project.name, Chapter.index, Chapter.title, Shot.index, Shot.title)
            .select_from(ShotDialogLine)
            .join(Shot, Shot.id == ShotDialogLine.shot_detail_id)
            .join(Chapter, Chapter.id == Shot.chapter_id)
            .join(Project, Project.id == Chapter.project_id)
            .where(
                or_(
                    ShotDialogLine.speaker_character_id == entity_id,
                    ShotDialogLine.target_character_id == entity_id,
                )
            )
        )
        collector.add("dialog_character", "镜头对白角色", await _shot_reference_items(db, dialog_stmt))
    elif normalized == "scene":
        shot_stmt = (
            select(Project.name, Chapter.index, Chapter.title, Shot.index, Shot.title)
            .select_from(ShotDetail)
            .join(Shot, Shot.id == ShotDetail.id)
            .join(Chapter, Chapter.id == Shot.chapter_id)
            .join(Project, Project.id == Chapter.project_id)
            .where(ShotDetail.scene_id == entity_id)
        )
        collector.add("shot_scene", "镜头详细场景", await _shot_reference_items(db, shot_stmt))
    elif normalized == "prop":
        rows = (
            await db.execute(
                select(Project.name, Character.name)
                .select_from(CharacterPropLink)
                .join(Character, Character.id == CharacterPropLink.character_id)
                .join(Project, Project.id == Character.project_id)
                .where(CharacterPropLink.prop_id == entity_id)
            )
        ).all()
        collector.add("character_prop", "角色使用该道具", [f"项目《{row[0]}》 / 角色「{row[1]}」" for row in rows])
    elif normalized == "costume":
        rows = (
            await db.execute(
                select(Project.name, Character.name)
                .select_from(Character)
                .join(Project, Project.id == Character.project_id)
                .where(Character.costume_id == entity_id)
            )
        ).all()
        collector.add("character_costume", "角色使用该服装", [f"项目《{row[0]}》 / 角色「{row[1]}」" for row in rows])

    if normalized in {"actor", "character"}:
        audio_field = AudioAsset.actor_id if normalized == "actor" else AudioAsset.character_id
        audio_names = list((await db.execute(select(AudioAsset.name).where(audio_field == entity_id))).scalars().all())
        collector.add("audio_asset", "配音音效资产", audio_names)

    if normalized in {"character", "scene", "prop", "costume"}:
        candidate_stmt = (
            select(Project.name, Chapter.index, Chapter.title, Shot.index, Shot.title)
            .select_from(ShotExtractedCandidate)
            .join(Shot, Shot.id == ShotExtractedCandidate.shot_id)
            .join(Chapter, Chapter.id == Shot.chapter_id)
            .join(Project, Project.id == Chapter.project_id)
            .where(
                ShotExtractedCandidate.candidate_type == normalized,
                ShotExtractedCandidate.linked_entity_id == entity_id,
            )
        )
        collector.add("extracted_candidate", "已确认的镜头提取候选", await _shot_reference_items(db, candidate_stmt))

    relation_count = sum(group.count for group in collector.groups)
    return EntityDeleteImpactRead(
        entity_type=normalized,
        entity_id=entity_id,
        entity_name=entity.name,
        relation_count=relation_count,
        has_relations=relation_count > 0,
        groups=collector.groups,
    )


async def unlink_and_delete_entity(
    db: AsyncSession,
    *,
    entity_type: str,
    entity_id: str,
    unlink_relations: bool,
) -> None:
    """Explicitly detach active relationships, then delete the asset in one transaction."""

    normalized = normalize_entity_type(entity_type)
    impact = await get_entity_delete_impact(db, entity_type=normalized, entity_id=entity_id)
    if impact.has_relations and not unlink_relations:
        raise HTTPException(status_code=409, detail="资产仍有关联，请先查看关联影响并确认解除关联后删除")

    await db.execute(
        delete(AssetFileLink).where(
            AssetFileLink.entity_type == normalized,
            AssetFileLink.entity_id == entity_id,
        )
    )
    if normalized in LINK_MODEL_BY_ENTITY:
        link_model, asset_field = LINK_MODEL_BY_ENTITY[normalized]
        await db.execute(delete(link_model).where(getattr(link_model, asset_field) == entity_id))

    if normalized == "actor":
        await db.execute(update(Character).where(Character.actor_id == entity_id).values(actor_id=None))
        await db.execute(update(AudioAsset).where(AudioAsset.actor_id == entity_id).values(actor_id=None))
    elif normalized == "character":
        await db.execute(delete(ShotCharacterLink).where(ShotCharacterLink.character_id == entity_id))
        await db.execute(delete(CharacterPropLink).where(CharacterPropLink.character_id == entity_id))
        await db.execute(
            update(ShotDialogLine)
            .where(ShotDialogLine.speaker_character_id == entity_id)
            .values(speaker_character_id=None)
        )
        await db.execute(
            update(ShotDialogLine)
            .where(ShotDialogLine.target_character_id == entity_id)
            .values(target_character_id=None)
        )
        await db.execute(update(AudioAsset).where(AudioAsset.character_id == entity_id).values(character_id=None))
    elif normalized == "scene":
        await db.execute(update(ShotDetail).where(ShotDetail.scene_id == entity_id).values(scene_id=None))
    elif normalized == "prop":
        await db.execute(delete(CharacterPropLink).where(CharacterPropLink.prop_id == entity_id))
    elif normalized == "costume":
        await db.execute(update(Character).where(Character.costume_id == entity_id).values(costume_id=None))

    if normalized in {"character", "scene", "prop", "costume"}:
        await db.execute(
            update(ShotExtractedCandidate)
            .where(
                ShotExtractedCandidate.candidate_type == normalized,
                ShotExtractedCandidate.linked_entity_id == entity_id,
            )
            .values(linked_entity_id=None, candidate_status=ShotCandidateStatus.pending)
        )

    spec = entity_spec(normalized)
    entity = await db.get(spec.model, entity_id)
    if entity is not None:
        await db.delete(entity)
    await db.flush()


__all__ = ["get_entity_delete_impact", "unlink_and_delete_entity"]
