"""Validate per-frame selections without conflating an explicit empty list with automatic suggestions."""
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.studio import FileItem, FileType


async def merge_frame_references(db: AsyncSession, previous: dict | None, patch: dict | None) -> dict:
    """Merge only supplied frame keys; validate image existence and preserve ordered unique IDs."""
    if patch is None:
        raise HTTPException(status_code=422, detail="参考图配置不能为 null")
    merged = dict(previous or {})
    for frame, ids in patch.items():
        if frame not in {"first", "key", "last"} or len(ids) > 100:
            raise HTTPException(status_code=422, detail="参考图帧类型或数量无效")
        ordered = list(dict.fromkeys(fid.strip() for fid in ids))
        if any(not fid or len(fid) > 64 for fid in ordered):
            raise HTTPException(status_code=422, detail="参考文件 ID 无效")
        if ordered:
            valid = set((await db.execute(select(FileItem.id).where(
                FileItem.id.in_(ordered), FileItem.type == FileType.image
            ))).scalars())
            if valid != set(ordered):
                raise HTTPException(status_code=422, detail="部分参考图片不存在或不是图片，请重新选择")
        merged[frame] = ordered
    return merged
