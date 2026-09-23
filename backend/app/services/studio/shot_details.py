"""镜头细节服务：ShotDetail 的分页查询与 CRUD。"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.utils import apply_order, paginate
from app.models.studio import Scene, Shot, ShotDetail, CameraShotType, CameraAngle, CameraMovement
from app.schemas.common import ApiResponse, PaginatedData, paginated_response
from app.schemas.studio.shots import ShotDetailCreate, ShotDetailRead, ShotDetailUpdate
from app.services.common import (
    create_and_refresh,
    delete_if_exists,
    entity_already_exists,
    entity_not_found,
    ensure_not_exists,
    flush_and_refresh,
    get_or_404,
    patch_model,
    require_entity,
    require_optional_entity,
)
from app.services.studio.frame_reference_selection import merge_frame_references
from app.services.studio.shot_extracted_candidates import mark_linked_by_name, mark_pending_by_linked_entity


def new_shot_detail(shot_id: str) -> ShotDetail:
    """创建未提取镜头的基础详情，与自动分镜的默认镜头语言一致，不标记准备完成。"""
    return ShotDetail(**ShotDetailCreate(
        id=shot_id, camera_shot=CameraShotType.ms, angle=CameraAngle.eye_level,
        movement=CameraMovement.static, duration=4,
    ).model_dump())


async def repair_missing_shot_details(db: AsyncSession) -> list[str]:
    """部署修复旧版手动镜头：仅补缺失详情，锁定父记录并复查，绝不覆盖已有内容。"""
    ids = list((await db.execute(select(Shot.id).outerjoin(ShotDetail, ShotDetail.id == Shot.id)
                                .where(ShotDetail.id.is_(None)).order_by(Shot.id))).scalars())
    repaired = []
    for shot_id in ids:
        shot = (await db.execute(select(Shot).where(Shot.id == shot_id).with_for_update())).scalar_one_or_none()
        if shot is not None and await db.get(ShotDetail, shot_id) is None:
            db.add(new_shot_detail(shot_id))
            await db.flush()
            repaired.append(shot_id)
    return repaired


async def list_paginated(
    db: AsyncSession,
    *,
    shot_id: str | None,
    order: str | None,
    is_desc: bool,
    page: int,
    page_size: int,
    allow_fields: set[str],
) -> ApiResponse[PaginatedData[ShotDetailRead]]:
    """分页查询镜头细节。"""
    stmt = select(ShotDetail)
    if shot_id is not None:
        stmt = stmt.where(ShotDetail.id == shot_id)
    stmt = apply_order(
        stmt,
        model=ShotDetail,
        order=order,
        is_desc=is_desc,
        allow_fields=allow_fields,
        default="id",
    )
    items, total = await paginate(db, stmt=stmt, page=page, page_size=page_size)
    return paginated_response(
        [ShotDetailRead.model_validate(x) for x in items],
        page=page,
        page_size=page_size,
        total=total,
    )


async def create(
    db: AsyncSession,
    *,
    body: ShotDetailCreate,
) -> ShotDetail:
    """创建镜头细节。"""
    await ensure_not_exists(db, ShotDetail, body.id, detail=entity_already_exists("ShotDetail"))
    await require_entity(db, Shot, body.id, detail=entity_not_found("Shot"), status_code=400)
    await require_optional_entity(db, Scene, body.scene_id, detail=entity_not_found("Scene"), status_code=400)
    values = body.model_dump()
    if body.frame_reference_selections is not None:
        values["frame_reference_selections"] = await merge_frame_references(db, {}, body.frame_reference_selections)
    return await create_and_refresh(db, ShotDetail(**values))


async def get(
    db: AsyncSession,
    *,
    shot_id: str,
) -> ShotDetail:
    """获取镜头细节。"""
    return await get_or_404(db, ShotDetail, shot_id, detail=entity_not_found("ShotDetail"))


async def update(
    db: AsyncSession,
    *,
    shot_id: str,
    body: ShotDetailUpdate,
) -> ShotDetail:
    """更新镜头细节。"""
    obj = (await db.execute(select(ShotDetail).where(ShotDetail.id == shot_id).with_for_update())).scalar_one_or_none()
    if obj is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=entity_not_found("ShotDetail"))
    update_data = body.model_dump(exclude_unset=True)
    if "frame_reference_selections" in update_data:
        update_data["frame_reference_selections"] = await merge_frame_references(
            db, obj.frame_reference_selections, update_data["frame_reference_selections"]
        )
    old_scene_id = obj.scene_id
    scene_obj = None
    if "scene_id" in update_data:
        scene_obj = await require_optional_entity(
            db,
            Scene,
            update_data["scene_id"],
            detail=entity_not_found("Scene"),
            status_code=400,
        )
    patch_model(obj, update_data)
    obj = await flush_and_refresh(db, obj)
    if "scene_id" in update_data and old_scene_id and old_scene_id != obj.scene_id:
        await mark_pending_by_linked_entity(
            db,
            shot_id=shot_id,
            candidate_type="scene",
            linked_entity_id=old_scene_id,
        )
    if scene_obj is not None:
        await mark_linked_by_name(
            db,
            shot_id=shot_id,
            candidate_type="scene",
            candidate_name=scene_obj.name,
            linked_entity_id=scene_obj.id,
        )
    return obj


async def delete(
    db: AsyncSession,
    *,
    shot_id: str,
) -> None:
    """删除镜头细节。"""
    await delete_if_exists(db, ShotDetail, shot_id)
