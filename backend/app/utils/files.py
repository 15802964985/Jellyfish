"""文件相关工具：从 URL 或 base64 内容创建 FileItem，并上传到对象存储。"""

from __future__ import annotations

import base64
import os
import uuid
from dataclasses import dataclass
from pathlib import Path
import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import storage
from app.models.studio import FileItem, FileType
from app.models.types import FileUsageKind


async def _infer_file_type_from_ext(ext: str) -> FileType:
    ext = ext.lower()
    if ext in {".jpg", ".jpeg", ".png", ".webp", ".gif"}:
        return FileType.image
    if ext in {".mp4", ".mov", ".mkv", ".avi", ".webm"}:
        return FileType.video
    # 默认按图片处理，调用方若有更精细需求可在外层再封装
    return FileType.image


@dataclass(frozen=True)
class FileUsageCreateParams:
    """创建 FileItem 后写入 file_usages 的参数。"""

    project_id: str
    chapter_id: str | None = None
    shot_id: str | None = None
    usage_kind: FileUsageKind | str = FileUsageKind.api
    source_ref: str | None = None


async def _infer_file_type_from_content_type(content_type: str | None) -> FileType:
    if not content_type:
        return FileType.image
    ct = content_type.lower()
    if ct.startswith("image/"):
        return FileType.image
    if ct.startswith("video/"):
        return FileType.video
    return FileType.image


async def create_file_from_url_or_b64(
    session: AsyncSession,
    *,
    url: str | None = None,
    b64_data: str | None = None,
    name: str | None = None,
    prefix: str = "files",
    url_request_headers: dict[str, str] | None = None,
    httpx_timeout: float | None = None,
    usage: FileUsageCreateParams | None = None,
    recovery_ordinal: int | None = None,
) -> FileItem:
    """从远端 URL 或 base64 内容创建 FileItem。

    - 若提供 url：会先下载内容，推断 content_type 和后缀；
    - 若提供 b64_data：优先解析 data URL 前缀中的 MIME 类型，否则默认 image/png；
    - 始终通过 storage.upload_file 上传到对象存储，再创建 FileItem 记录并返回。
    - url_request_headers / httpx_timeout：用于需鉴权或大文件下载（如 OpenAI /videos/{id}/content）。
    """
    if not url and not b64_data:
        raise ValueError("create_file_from_url_or_b64 需要提供 url 或 b64_data 至少其一")

    from app.core.contracts.generation_recovery import media_recovery
    recovery = media_recovery.get() if recovery_ordinal is not None else None
    archive_id = str(recovery_ordinal)
    if recovery is not None:
        cached = await recovery.update(lambda data: (data.get("archives") or {}).get(archive_id))
        if cached:
            # A prior SQL rollback does not discard the already stored bytes or create another object.
            existing = await session.get(FileItem, cached["id"])
            if existing is not None:
                return existing
            file_obj = FileItem(**cached)
            session.add(file_obj)
            await session.flush()
            return file_obj

    content: bytes
    content_type: str | None = None
    filename: str = ""

    if url:
        client_kwargs: dict = {}
        if httpx_timeout is not None:
            client_kwargs["timeout"] = httpx_timeout
        async with httpx.AsyncClient(**client_kwargs) as client:
            resp = await client.get(url, headers=url_request_headers or None)
            resp.raise_for_status()
            content = resp.content
            content_type = resp.headers.get("Content-Type")

        # 从 URL 推断文件名
        path = Path(httpx.URL(url).path)
        filename = path.name or "file"
    else:
        raw = b64_data or ""
        # 支持 data URL 形式：data:image/png;base64,xxxxxx
        if raw.startswith("data:") and ";base64," in raw:
            header, encoded = raw.split(";base64,", 1)
            # 形如 data:image/png
            mime = header[5:]
            content_type = mime or "image/png"
            content = base64.b64decode(encoded)
        else:
            content_type = "image/png"
            content = base64.b64decode(raw)

        filename = "image.png"

    # 推断扩展名和 FileType
    _, ext = os.path.splitext(filename)
    file_type = await _infer_file_type_from_content_type(content_type)
    if not ext:
        # 根据类型给一个默认后缀
        ext = ".png" if file_type == FileType.image else ".mp4"

    display_name = name or os.path.splitext(filename)[0] or filename

    file_id = str(uuid.uuid5(uuid.NAMESPACE_URL, recovery.task_id + "/" + archive_id)) if recovery else str(uuid.uuid4())
    key = f"{prefix}/{file_id}{ext}"
    info = await storage.upload_file(
        key=key,
        data=content,
        content_type=content_type,
    )

    file_obj = FileItem(
        id=file_id,
        type=file_type,
        name=display_name,
        thumbnail=info.url,
        tags=[],
        storage_key=key,
    )
    if recovery is not None:
        def remember(data):
            """Persist archive identity before the business transaction can roll back."""
            archives = dict(data.get("archives", {}))
            archives[archive_id] = {"id": file_id, "type": file_type.value, "name": display_name,
                "thumbnail": info.url, "tags": [], "storage_key": key}
            data["archives"] = archives
        await recovery.update(remember)
    session.add(file_obj)
    await session.flush()
    await session.refresh(file_obj)

    if usage is not None:
        from app.services.studio.file_usages import upsert_file_usage

        await upsert_file_usage(
            session,
            file_id=file_obj.id,
            project_id=usage.project_id,
            chapter_id=usage.chapter_id,
            shot_id=usage.shot_id,
            usage_kind=usage.usage_kind,
            source_ref=usage.source_ref,
        )

    return file_obj
