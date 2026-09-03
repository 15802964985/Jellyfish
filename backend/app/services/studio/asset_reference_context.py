"""把资产附件转换为提示词上下文与模型可接受的参考媒体。"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.contracts.media import MediaReference, VideoSubjectMediaReference
from app.core.integrations.video_capabilities import VideoModelCapability
from app.models.studio import (
    Actor,
    AssetFileLink,
    Character,
    Costume,
    FileItem,
    FileType,
    ProjectActorLink,
    ProjectCostumeLink,
    ProjectPropLink,
    ProjectSceneLink,
    Prop,
    Scene,
    ShotCharacterLink,
)
from app.services.studio.files import extract_document_text


@dataclass(frozen=True, slots=True)
class AssetAttachment:
    """带业务语义的启用附件。"""

    entity_type: str
    entity_id: str
    entity_name: str
    file: FileItem
    resource_role: str
    note: str
    is_primary: bool
    sort_index: int


@dataclass(frozen=True, slots=True)
class ShotReferenceBundle:
    """镜头可用的附件文本与按主体分组的媒体。"""

    prompt_context: str
    subjects: list[VideoSubjectMediaReference]


async def _load_attachments(
    db: AsyncSession,
    *,
    entities: list[tuple[str, str, str]],
) -> list[AssetAttachment]:
    """按实体列表读取启用附件并保留用户设置的主参考和顺序。"""
    output: list[AssetAttachment] = []
    for entity_type, entity_id, entity_name in entities:
        stmt = (
            select(AssetFileLink, FileItem)
            .join(FileItem, FileItem.id == AssetFileLink.file_id)
            .where(
                AssetFileLink.entity_type == entity_type,
                AssetFileLink.entity_id == entity_id,
                AssetFileLink.enabled.is_(True),
            )
            .order_by(
                AssetFileLink.is_primary.desc(),
                AssetFileLink.sort_index,
                AssetFileLink.id,
            )
        )
        for link, file_item in (await db.execute(stmt)).all():
            output.append(
                AssetAttachment(
                    entity_type=entity_type,
                    entity_id=entity_id,
                    entity_name=entity_name,
                    file=file_item,
                    resource_role=link.resource_role,
                    note=link.note or "",
                    is_primary=bool(link.is_primary),
                    sort_index=int(link.sort_index),
                )
            )
    return output


async def build_attachment_prompt_context(
    db: AsyncSession,
    *,
    attachments: list[AssetAttachment],
    max_chars: int = 8000,
) -> str:
    """将附件说明和文档正文变成受长度限制的生成上下文。"""
    lines: list[str] = []
    remaining = max_chars
    for attachment in attachments:
        label = f"{attachment.entity_name}/{attachment.resource_role}"
        if attachment.note.strip():
            line = f"- {label}：{attachment.note.strip()}"
            lines.append(line[:remaining])
            remaining -= len(line)
        if attachment.file.type == FileType.document and remaining > 0:
            excerpt = await extract_document_text(
                attachment.file,
                max_chars=min(remaining, 4000),
            )
            if excerpt:
                block = f"- {label} 文档内容：\n{excerpt}"
                lines.append(block[:remaining])
                remaining -= len(block)
        if remaining <= 0:
            break
    if not lines:
        return ""
    return "[已关联素材上下文，仅作为创作参考]\n" + "\n".join(lines)


async def load_asset_prompt_context(
    db: AsyncSession,
    *,
    entity_type: str,
    entity_id: str,
    entity_name: str,
) -> str:
    """读取单个资产的附件说明和文档正文。"""
    attachments = await _load_attachments(
        db,
        entities=[(entity_type, entity_id, entity_name)],
    )
    return await build_attachment_prompt_context(db, attachments=attachments)


async def load_assets_prompt_context(
    db: AsyncSession,
    *,
    entities: list[tuple[str, str, str]],
) -> str:
    """合并多个相关资产的附件说明和文档，供组合角色等生成场景使用。"""
    attachments = await _load_attachments(db, entities=entities)
    return await build_attachment_prompt_context(db, attachments=attachments)


async def _shot_entities(
    db: AsyncSession,
    *,
    shot_id: str,
) -> tuple[list[tuple[str, str, str]], dict[str, list[tuple[str, str]]]]:
    """解析镜头关联实体，并把演员/服装附件并入对应角色主体。"""
    entities: list[tuple[str, str, str]] = []
    subject_sources: dict[str, list[tuple[str, str]]] = {}

    character_rows = (
        await db.execute(
            select(Character.id, Character.name, Character.actor_id, Character.costume_id)
            .join(ShotCharacterLink, ShotCharacterLink.character_id == Character.id)
            .where(ShotCharacterLink.shot_id == shot_id)
            .order_by(ShotCharacterLink.index)
        )
    ).all()
    for character_id, name, actor_id, costume_id in character_rows:
        key = str(name)
        sources = [("character", str(character_id))]
        entities.append(("character", str(character_id), key))
        if actor_id:
            sources.append(("actor", str(actor_id)))
            entities.append(("actor", str(actor_id), key))
        if costume_id:
            sources.append(("costume", str(costume_id)))
            entities.append(("costume", str(costume_id), key))
        subject_sources[key] = sources

    specs = (
        (ProjectActorLink, Actor, "actor_id", "actor"),
        (ProjectSceneLink, Scene, "scene_id", "scene"),
        (ProjectPropLink, Prop, "prop_id", "prop"),
        (ProjectCostumeLink, Costume, "costume_id", "costume"),
    )
    for link_model, entity_model, field_name, entity_type in specs:
        entity_field = getattr(link_model, field_name)
        rows = (
            await db.execute(
                select(entity_model.id, entity_model.name)
                .join(link_model, entity_field == entity_model.id)
                .where(link_model.shot_id == shot_id)
            )
        ).all()
        for entity_id, name in rows:
            entity = (entity_type, str(entity_id), str(name))
            if entity not in entities:
                entities.append(entity)
            subject_sources.setdefault(str(name), []).append((entity_type, str(entity_id)))
    return entities, subject_sources


def _select_subjects(
    *,
    attachments: list[AssetAttachment],
    subject_sources: dict[str, list[tuple[str, str]]],
    capability: VideoModelCapability,
) -> list[VideoSubjectMediaReference]:
    """按模型限制选择真实支持的图片、视频和参考音频。"""
    if not (
        capability.supports_subject_image_reference
        or capability.supports_subject_video_reference
    ):
        return []
    subjects: list[VideoSubjectMediaReference] = []
    used_file_ids: set[str] = set()
    total_videos = 0
    max_subjects = capability.max_subjects or len(subject_sources)
    for subject_name, sources in subject_sources.items():
        source_set = set(sources)
        candidates = [
            item
            for item in attachments
            if (item.entity_type, item.entity_id) in source_set and item.file.id not in used_file_ids
        ]
        images = [item for item in candidates if item.file.type == FileType.image]
        videos = [item for item in candidates if item.file.type == FileType.video]
        audios = [item for item in candidates if item.file.type == FileType.audio]
        if not capability.supports_subject_image_reference:
            images = []
        if not capability.supports_subject_video_reference:
            videos = []
        images = images[: capability.max_images_per_subject]
        videos = videos[: capability.max_videos_per_subject]
        if capability.max_total_subject_videos is not None:
            videos = videos[: max(0, capability.max_total_subject_videos - total_videos)]
        visual = [*images, *videos]
        audio = (
            audios[: capability.max_audios_per_subject]
            if visual and capability.supports_subject_audio_reference
            else []
        )
        selected = [*visual, *audio]
        if capability.max_media_per_subject is not None:
            selected = selected[: capability.max_media_per_subject]
        if not selected:
            continue
        media = [
            MediaReference(
                file_id=item.file.id,
                media_kind=(
                    "image"
                    if item.file.type == FileType.image
                    else "video"
                    if item.file.type == FileType.video
                    else "audio"
                ),
                ordinal=index,
            )
            for index, item in enumerate(selected)
        ]
        subjects.append(VideoSubjectMediaReference(name=subject_name, media=media))
        used_file_ids.update(item.file.id for item in selected)
        total_videos += len(videos)
        if len(subjects) >= max_subjects:
            break
    return subjects


async def resolve_shot_reference_bundle(
    db: AsyncSession,
    *,
    shot_id: str,
    capability: VideoModelCapability,
    allow_subjects: bool,
) -> ShotReferenceBundle:
    """将镜头关联资产转换为提示词上下文和可选模型媒体主体。"""
    entities, subject_sources = await _shot_entities(db, shot_id=shot_id)
    attachments = await _load_attachments(db, entities=entities)
    prompt_context = await build_attachment_prompt_context(db, attachments=attachments)
    subjects = (
        _select_subjects(
            attachments=attachments,
            subject_sources=subject_sources,
            capability=capability,
        )
        if allow_subjects
        else []
    )
    return ShotReferenceBundle(prompt_context=prompt_context, subjects=subjects)
