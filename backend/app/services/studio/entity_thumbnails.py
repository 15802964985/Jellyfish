"""Studio 实体缩略图解析。"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.studio import AssetFileLink, AssetViewAngle, FileItem, FileType

DOWNLOAD_URL_TEMPLATE = "/api/v1/studio/files/{file_id}/download"


def download_url(file_id: str) -> str:
    return DOWNLOAD_URL_TEMPLATE.format(file_id=file_id)


async def resolve_thumbnails(
    db: AsyncSession,
    *,
    image_model: type,
    parent_field_name: str,
    parent_ids: list[str],
) -> dict[str, str]:
    if not parent_ids:
        return {}
    parent_field = getattr(image_model, parent_field_name)
    stmt = select(image_model).where(parent_field.in_(parent_ids), image_model.file_id.is_not(None))
    rows = (await db.execute(stmt)).scalars().all()
    best: dict[str, tuple[int, int, int, str]] = {}
    for row in rows:
        file_id = row.file_id
        if not file_id:
            continue
        parent_id = getattr(row, parent_field_name)
        created_ts = int(row.created_at.timestamp()) if row.created_at else -1
        score = (1 if row.view_angle == AssetViewAngle.front else 0, created_ts, row.id)
        current = best.get(parent_id)
        if current is None or score > current[:3]:
            best[parent_id] = (*score, file_id)
    return {parent_id: download_url(score[3]) for parent_id, score in best.items()}


async def resolve_thumbnail_infos(
    db: AsyncSession,
    *,
    image_model: type,
    parent_field_name: str,
    parent_ids: list[str],
) -> dict[str, dict[str, Any]]:
    """解析每个 parent_id 的最佳缩略图信息（thumbnail + image_id）。"""
    if not parent_ids:
        return {}
    parent_field = getattr(image_model, parent_field_name)
    stmt = select(image_model).where(parent_field.in_(parent_ids), image_model.file_id.is_not(None))
    rows = (await db.execute(stmt)).scalars().all()
    best: dict[str, tuple[int, int, int, int, str]] = {}
    for row in rows:
        file_id = row.file_id
        if not file_id:
            continue
        parent_id = getattr(row, parent_field_name)
        created_ts = int(row.created_at.timestamp()) if row.created_at else -1
        image_id = int(row.id)
        score3 = (1 if row.view_angle == AssetViewAngle.front else 0, created_ts, image_id)
        current = best.get(parent_id)
        if current is None or score3 > current[:3]:
            best[parent_id] = (*score3, image_id, file_id)

    return {
        parent_id: {
            "image_id": info[3],
            "file_id": info[4],
            "thumbnail": download_url(info[4]),
        }
        for parent_id, info in best.items()
    }


async def resolve_attachment_image_infos(
    db: AsyncSession,
    *,
    entity_type: str,
    entity_ids: list[str],
) -> dict[str, dict[str, Any]]:
    """解析资产启用的图片附件，供无专用形象图时作为可选参考回退。"""
    if not entity_ids:
        return {}
    stmt = (
        select(AssetFileLink, FileItem)
        .join(FileItem, FileItem.id == AssetFileLink.file_id)
        .where(
            AssetFileLink.entity_type == entity_type,
            AssetFileLink.entity_id.in_(entity_ids),
            AssetFileLink.enabled.is_(True),
            FileItem.type == FileType.image,
        )
        .order_by(
            AssetFileLink.entity_id,
            AssetFileLink.is_primary.desc(),
            AssetFileLink.sort_index,
            AssetFileLink.id,
        )
    )
    result: dict[str, dict[str, Any]] = {}
    for link, file_item in (await db.execute(stmt)).all():
        if link.entity_id in result:
            continue
        result[link.entity_id] = {
            "image_id": None,
            "file_id": file_item.id,
            "thumbnail": download_url(file_item.id),
            "source": "attachment",
            "resource_role": link.resource_role,
        }
    return result
