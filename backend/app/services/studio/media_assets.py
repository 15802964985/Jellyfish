"""资产附件、音频资产与镜头音轨的业务服务。"""

from __future__ import annotations

import uuid

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.utils import apply_keyword_filter, paginate
from app.models.studio import (
    Actor,
    AssetFileLink,
    AudioAsset,
    Character,
    Costume,
    FileItem,
    FileType,
    Prop,
    Scene,
    Shot,
    ShotAudioTrack,
    ShotDialogLine,
)
from app.models.types import FileUsageKind
from app.schemas.studio.media_assets import (
    AssetFileLinkCreate,
    AssetFileLinkUpdate,
    AudioAssetCreate,
    AudioAssetRead,
    AudioAssetUpdate,
    ShotAudioTrackCreate,
    ShotAudioTrackUpdate,
)
from app.services.common import patch_model
from app.services.studio.file_usages import sync_usage_from_shot_context, upsert_file_usage

ASSET_ENTITY_MODELS = {
    "actor": Actor,
    "character": Character,
    "scene": Scene,
    "prop": Prop,
    "costume": Costume,
}


async def _require_asset_entity(db: AsyncSession, *, entity_type: str, entity_id: str) -> None:
    """验证多态附件目标，避免产生指向不存在业务对象的悬空关系。"""
    model = ASSET_ENTITY_MODELS.get(entity_type)
    if model is None:
        raise HTTPException(status_code=400, detail=f"不支持的资产类型: {entity_type}")
    if await db.get(model, entity_id) is None:
        raise HTTPException(status_code=404, detail="资产不存在")


async def list_asset_file_links(
    db: AsyncSession, *, entity_type: str, entity_id: str, enabled_only: bool = False
) -> list[AssetFileLink]:
    """按业务资产读取有序附件；关联仅作为可选生成参考。"""
    await _require_asset_entity(db, entity_type=entity_type, entity_id=entity_id)
    stmt = (
        select(AssetFileLink)
        .options(selectinload(AssetFileLink.file))
        .where(AssetFileLink.entity_type == entity_type, AssetFileLink.entity_id == entity_id)
        .order_by(AssetFileLink.is_primary.desc(), AssetFileLink.sort_index, AssetFileLink.id)
    )
    if enabled_only:
        stmt = stmt.where(AssetFileLink.enabled.is_(True))
    return list((await db.execute(stmt)).scalars().all())


async def create_asset_file_link(
    db: AsyncSession, *, entity_type: str, entity_id: str, body: AssetFileLinkCreate
) -> AssetFileLink:
    """关联已有文件；设为主参考时清除同一角色下其他主参考标记。"""
    await _require_asset_entity(db, entity_type=entity_type, entity_id=entity_id)
    if await db.get(FileItem, body.file_id) is None:
        raise HTTPException(status_code=404, detail="文件不存在")
    if body.is_primary:
        await db.execute(
            update(AssetFileLink)
            .where(AssetFileLink.entity_type == entity_type, AssetFileLink.entity_id == entity_id)
            .values(is_primary=False)
        )
    row = AssetFileLink(entity_type=entity_type, entity_id=entity_id, **body.model_dump())
    db.add(row)
    try:
        await db.flush()
    except IntegrityError as exc:
        raise HTTPException(status_code=409, detail="该文件已按相同用途关联到此资产") from exc
    await db.refresh(row, attribute_names=["file"])
    return row


async def update_asset_file_link(
    db: AsyncSession, *, link_id: int, body: AssetFileLinkUpdate
) -> AssetFileLink:
    """更新附件排序、角色和推荐状态。"""
    row = await db.get(AssetFileLink, link_id)
    if row is None:
        raise HTTPException(status_code=404, detail="附件关系不存在")
    data = body.model_dump(exclude_unset=True)
    if data.get("is_primary"):
        await db.execute(
            update(AssetFileLink)
            .where(AssetFileLink.entity_type == row.entity_type, AssetFileLink.entity_id == row.entity_id)
            .values(is_primary=False)
        )
    patch_model(row, data)
    await db.flush()
    await db.refresh(row, attribute_names=["file"])
    return row


async def delete_asset_file_link(db: AsyncSession, *, link_id: int) -> None:
    """仅解除业务关联，不删除 RustFS 中的底层文件。"""
    row = await db.get(AssetFileLink, link_id)
    if row is None:
        return
    await db.delete(row)
    await db.flush()


def _audio_read(row: AudioAsset, *, usage_count: int = 0) -> AudioAssetRead:
    """将 ORM 音频资产转换成包含使用次数的稳定响应。"""
    return AudioAssetRead(
        id=row.id,
        name=row.name,
        category=row.category,
        file_id=row.file_id,
        description=row.description,
        transcript=row.transcript,
        tags=row.tags or [],
        actor_id=row.actor_id,
        character_id=row.character_id,
        language=row.language,
        duration_ms=row.duration_ms,
        file=row.file,
        usage_count=usage_count,
    )


async def list_audio_assets(
    db: AsyncSession, *, q: str | None, category: str | None, page: int, page_size: int
) -> tuple[list[AudioAssetRead], int]:
    """分页读取音频资产并返回镜头使用次数。"""
    stmt = select(AudioAsset).options(selectinload(AudioAsset.file))
    stmt = apply_keyword_filter(stmt, q=q, fields=[AudioAsset.name, AudioAsset.description, AudioAsset.transcript])
    if category:
        stmt = stmt.where(AudioAsset.category == category)
    stmt = stmt.order_by(AudioAsset.updated_at.desc())
    rows, total = await paginate(db, stmt=stmt, page=page, page_size=page_size)
    if not rows:
        return [], total
    counts = dict(
        (
            await db.execute(
                select(ShotAudioTrack.audio_asset_id, func.count(ShotAudioTrack.id))
                .where(ShotAudioTrack.audio_asset_id.in_([row.id for row in rows]))
                .group_by(ShotAudioTrack.audio_asset_id)
            )
        ).all()
    )
    return [_audio_read(row, usage_count=int(counts.get(row.id, 0))) for row in rows], total


async def create_audio_asset(db: AsyncSession, *, body: AudioAssetCreate) -> AudioAssetRead:
    """从已上传的音频 FileItem 创建业务资产，并可选登记项目使用关系。"""
    file_item = await db.get(FileItem, body.file_id)
    if file_item is None:
        raise HTTPException(status_code=404, detail="音频文件不存在")
    if file_item.type != FileType.audio:
        raise HTTPException(status_code=400, detail="只有音频文件可以创建配音音效资产")
    if body.actor_id and await db.get(Actor, body.actor_id) is None:
        raise HTTPException(status_code=404, detail="演员不存在")
    if body.character_id and await db.get(Character, body.character_id) is None:
        raise HTTPException(status_code=404, detail="角色不存在")
    data = body.model_dump(exclude={"project_id"})
    if data.get("duration_ms") is None:
        data["duration_ms"] = file_item.duration_ms
    row = AudioAsset(id=str(uuid.uuid4()), **data)
    db.add(row)
    try:
        await db.flush()
    except IntegrityError as exc:
        raise HTTPException(status_code=409, detail="该音频文件已创建为音频资产") from exc
    if body.project_id:
        await upsert_file_usage(
            db,
            file_id=row.file_id,
            project_id=body.project_id,
            chapter_id=None,
            shot_id=None,
            usage_kind=FileUsageKind.audio_asset,
            source_ref=row.id,
        )
    await db.refresh(row, attribute_names=["file"])
    return _audio_read(row)


async def update_audio_asset(db: AsyncSession, *, audio_asset_id: str, body: AudioAssetUpdate) -> AudioAssetRead:
    """更新音频资产业务信息，不替换底层文件。"""
    row = await db.get(AudioAsset, audio_asset_id)
    if row is None:
        raise HTTPException(status_code=404, detail="音频资产不存在")
    patch_model(row, body.model_dump(exclude_unset=True))
    await db.flush()
    await db.refresh(row, attribute_names=["file"])
    count = int(
        (
            await db.execute(select(func.count(ShotAudioTrack.id)).where(ShotAudioTrack.audio_asset_id == row.id))
        ).scalar()
        or 0
    )
    return _audio_read(row, usage_count=count)


async def delete_audio_asset(db: AsyncSession, *, audio_asset_id: str) -> None:
    """删除未被镜头使用的音频资产；底层文件保留供文件管理继续处理。"""
    row = await db.get(AudioAsset, audio_asset_id)
    if row is None:
        return
    usage_count = int(
        (
            await db.execute(select(func.count(ShotAudioTrack.id)).where(ShotAudioTrack.audio_asset_id == row.id))
        ).scalar()
        or 0
    )
    if usage_count:
        raise HTTPException(status_code=409, detail=f"该音频已被 {usage_count} 条镜头音轨使用，请先解除关联")
    await db.delete(row)
    await db.flush()


async def list_shot_audio_tracks(db: AsyncSession, *, shot_id: str) -> list[ShotAudioTrack]:
    """读取镜头全部音轨，并预加载音频文件供前端试听。"""
    if await db.get(Shot, shot_id) is None:
        raise HTTPException(status_code=404, detail="镜头不存在")
    stmt = (
        select(ShotAudioTrack)
        .options(selectinload(ShotAudioTrack.audio_asset).selectinload(AudioAsset.file))
        .where(ShotAudioTrack.shot_id == shot_id)
        .order_by(ShotAudioTrack.sort_index, ShotAudioTrack.id)
    )
    return list((await db.execute(stmt)).scalars().all())


async def create_shot_audio_track(
    db: AsyncSession, *, shot_id: str, body: ShotAudioTrackCreate
) -> ShotAudioTrack:
    """把音频资产加入镜头；这是可选增强，不影响无音频视频生成。"""
    if await db.get(Shot, shot_id) is None:
        raise HTTPException(status_code=404, detail="镜头不存在")
    audio_asset = await db.get(AudioAsset, body.audio_asset_id)
    if audio_asset is None:
        raise HTTPException(status_code=404, detail="音频资产不存在")
    if body.dialog_line_id is not None:
        line = await db.get(ShotDialogLine, body.dialog_line_id)
        if line is None:
            raise HTTPException(status_code=404, detail="对白行不存在")
        if line.shot_detail_id != shot_id:
            raise HTTPException(status_code=400, detail="对白行不属于当前镜头")
    row = ShotAudioTrack(shot_id=shot_id, **body.model_dump())
    db.add(row)
    await db.flush()
    await sync_usage_from_shot_context(
        db,
        file_id=audio_asset.file_id,
        shot_id=shot_id,
        usage_kind=FileUsageKind.audio_track,
        source_ref=str(row.id),
    )
    await db.refresh(row, attribute_names=["audio_asset"])
    await db.refresh(row.audio_asset, attribute_names=["file"])
    return row


async def update_shot_audio_track(
    db: AsyncSession, *, track_id: int, body: ShotAudioTrackUpdate
) -> ShotAudioTrack:
    """更新音轨参数并保持关联音频不变。"""
    row = await db.get(ShotAudioTrack, track_id)
    if row is None:
        raise HTTPException(status_code=404, detail="镜头音轨不存在")
    data = body.model_dump(exclude_unset=True)
    next_start = data.get("start_ms", row.start_ms)
    next_end = data.get("end_ms", row.end_ms)
    if next_end is not None and next_end <= next_start:
        raise HTTPException(status_code=400, detail="结束时间必须晚于开始时间")
    patch_model(row, data)
    await db.flush()
    await db.refresh(row, attribute_names=["audio_asset"])
    await db.refresh(row.audio_asset, attribute_names=["file"])
    return row


async def delete_shot_audio_track(db: AsyncSession, *, track_id: int) -> None:
    """解除镜头音轨关联，不删除可复用音频资产。"""
    row = await db.get(ShotAudioTrack, track_id)
    if row is None:
        return
    await db.delete(row)
    await db.flush()


__all__ = [
    "create_asset_file_link",
    "create_audio_asset",
    "create_shot_audio_track",
    "delete_asset_file_link",
    "delete_audio_asset",
    "delete_shot_audio_track",
    "list_asset_file_links",
    "list_audio_assets",
    "list_shot_audio_tracks",
    "update_asset_file_link",
    "update_audio_asset",
    "update_shot_audio_track",
]
