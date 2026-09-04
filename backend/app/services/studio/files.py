"""文件服务：封装文件上传、下载、列表、详情、更新与删除。"""

from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import tempfile
import uuid
import zipfile
from io import BytesIO
from pathlib import Path
from typing import Any
from urllib.parse import quote
from xml.etree import ElementTree

from anyio import to_thread
from fastapi import HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.utils import apply_keyword_filter, apply_order, paginate
from app.core import storage
from app.models.studio import AssetFileLink, AudioAsset, FileItem, FileType, ScriptImport
from app.schemas.common import ApiResponse, PaginatedData, paginated_response
from app.schemas.studio import FileDetailRead, FileRead, FileUpdate, FileUsageRead, FileUsageWrite
from app.services.common import create_and_refresh, entity_not_found, flush_and_refresh, get_or_404, patch_model
from app.services.studio.file_usages import upsert_file_usage

FILE_ORDER_FIELDS = {"name", "created_at", "updated_at"}
MAX_UPLOAD_BYTES = 500 * 1024 * 1024
UPLOAD_HASH_CHUNK_BYTES = 1024 * 1024
RANGE_CHUNK_BYTES = 4 * 1024 * 1024

_EXTENSION_TYPES: dict[str, FileType] = {
    ".jpg": FileType.image,
    ".jpeg": FileType.image,
    ".png": FileType.image,
    ".webp": FileType.image,
    ".gif": FileType.image,
    ".mp4": FileType.video,
    ".mov": FileType.video,
    ".mkv": FileType.video,
    ".avi": FileType.video,
    ".webm": FileType.video,
    ".mp3": FileType.audio,
    ".wav": FileType.audio,
    ".m4a": FileType.audio,
    ".aac": FileType.audio,
    ".ogg": FileType.audio,
    ".flac": FileType.audio,
    ".txt": FileType.document,
    ".md": FileType.document,
    ".markdown": FileType.document,
    ".pdf": FileType.document,
    ".docx": FileType.document,
}


def _detect_file_type(filename: str) -> FileType:
    """按受控扩展名识别业务文件类型并拒绝其他内容。"""
    _, ext = os.path.splitext(filename.lower())
    detected = _EXTENSION_TYPES.get(ext)
    if detected is not None:
        return detected
    raise HTTPException(status_code=400, detail=f"不支持的文件类型: {ext or '未知后缀'}")


def _safe_storage_filename(filename: str) -> str:
    """生成不包含路径和危险字符的对象名，原文件名仍单独保存。"""
    raw = filename.replace("\\", "/").rsplit("/", 1)[-1]
    stem = re.sub(r"[^0-9A-Za-z._-]+", "_", Path(raw).stem).strip("._") or "upload"
    return f"{stem[:96]}{Path(raw).suffix.lower()}"


def _build_display_name(filename: str, name: str | None) -> str:
    if name:
        return name
    base, _ = os.path.splitext(filename)
    return base or filename


def _resolve_download_media_type(filename: str) -> str:
    ext = Path(filename).suffix.lower()
    media_types = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".gif": "image/gif",
        ".mp4": "video/mp4",
        ".mov": "video/quicktime",
        ".mp3": "audio/mpeg",
        ".wav": "audio/wav",
        ".m4a": "audio/mp4",
        ".aac": "audio/aac",
        ".ogg": "audio/ogg",
        ".flac": "audio/flac",
        ".txt": "text/plain; charset=utf-8",
        ".md": "text/markdown; charset=utf-8",
        ".markdown": "text/markdown; charset=utf-8",
        ".pdf": "application/pdf",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }
    if ext in media_types:
        return media_types[ext]
    if ext in {".mkv", ".avi", ".webm"}:
        return f"video/{ext.lstrip('.')}"
    return "application/octet-stream"


async def list_files_paginated(
    db: AsyncSession,
    *,
    q: str | None,
    order: str | None,
    is_desc: bool,
    page: int,
    page_size: int,
    file_type: FileType | None = None,
) -> ApiResponse[PaginatedData[FileRead]]:
    """分页查询文件。"""
    stmt = select(FileItem)
    if file_type is not None:
        stmt = stmt.where(FileItem.type == file_type)
    stmt = apply_keyword_filter(stmt, q=q, fields=[FileItem.name])
    stmt = apply_order(
        stmt,
        model=FileItem,
        order=order,
        is_desc=is_desc,
        allow_fields=FILE_ORDER_FIELDS,
        default="created_at",
    )
    items, total = await paginate(db, stmt=stmt, page=page, page_size=page_size)
    return paginated_response(
        [FileRead.model_validate(x) for x in items],
        page=page,
        page_size=page_size,
        total=total,
    )


async def get_file_detail(
    db: AsyncSession,
    *,
    file_id: str,
) -> FileDetailRead:
    """获取文件详情。"""
    stmt = select(FileItem).options(selectinload(FileItem.usages)).where(FileItem.id == file_id)
    res = await db.execute(stmt)
    obj = res.scalars().first()
    if obj is None:
        raise HTTPException(status_code=404, detail=entity_not_found("File"))
    usages = [FileUsageRead.model_validate(u) for u in (obj.usages or [])]
    base = FileRead.model_validate(obj)
    return FileDetailRead(**base.model_dump(), usages=usages)


async def update_file_meta(
    db: AsyncSession,
    *,
    file_id: str,
    body: FileUpdate,
) -> FileItem:
    """更新文件元信息，并按需写入 usage。"""
    obj = await get_or_404(db, FileItem, file_id, detail=entity_not_found("File"))
    data = body.model_dump(exclude_unset=True)
    usage_payload = data.pop("usage", None)
    patch_model(obj, data)
    if usage_payload is not None:
        u = FileUsageWrite.model_validate(usage_payload)
        await upsert_file_usage(
            db,
            file_id=file_id,
            project_id=u.project_id,
            chapter_id=u.chapter_id,
            shot_id=u.shot_id,
            usage_kind=u.usage_kind,
            source_ref=u.source_ref,
        )
    return await flush_and_refresh(db, obj)


async def upload_file(
    db: AsyncSession,
    *,
    file: UploadFile,
    name: str | None = None,
    project_id: str | None = None,
    chapter_id: str | None = None,
    shot_id: str | None = None,
    usage_kind: str | None = None,
    source_ref: str | None = None,
) -> FileItem:
    """上传文件到对象存储，并创建 FileItem 记录。"""
    if not file.filename:
        raise HTTPException(status_code=400, detail="上传文件缺少文件名")

    file_type = _detect_file_type(file.filename)
    display_name = _build_display_name(file.filename, name)
    checksum_builder = hashlib.sha256()
    size_bytes = 0
    while chunk := await file.read(UPLOAD_HASH_CHUNK_BYTES):
        size_bytes += len(chunk)
        if size_bytes > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail="文件超过 500MB 上传限制")
        checksum_builder.update(chunk)
    if size_bytes == 0:
        raise HTTPException(status_code=400, detail="上传文件为空")
    await file.seek(0)

    object_id = str(uuid.uuid4())
    safe_name = _safe_storage_filename(file.filename)
    key = f"files/{object_id}/{safe_name}"
    mime_type = (file.content_type or _resolve_download_media_type(file.filename)).strip()
    checksum = checksum_builder.hexdigest()
    info = await storage.upload_file(
        key=key,
        data=file.file,
        content_type=mime_type,
    )

    file_item = await create_and_refresh(
        db,
        FileItem(
            id=str(uuid.uuid4()),
            type=file_type,
            name=display_name,
            thumbnail=info.url,
            tags=[],
            storage_key=key,
            original_name=file.filename,
            mime_type=mime_type,
            size_bytes=size_bytes,
            checksum=checksum,
        ),
    )

    if project_id and usage_kind:
        await upsert_file_usage(
            db,
            file_id=file_item.id,
            project_id=project_id,
            chapter_id=chapter_id,
            shot_id=shot_id,
            usage_kind=usage_kind,
            source_ref=source_ref,
        )

    return file_item


async def build_download_response(
    db: AsyncSession,
    *,
    file_id: str,
    range_header: str | None = None,
) -> Response:
    """根据 file_id 构建下载响应，并支持音视频分段读取。"""
    file_item = await get_or_404(db, FileItem, file_id, detail=entity_not_found("File"))
    filename = file_item.original_name or Path(file_item.storage_key).name or "download"
    return await _build_binary_response(
        key=file_item.storage_key,
        filename=filename,
        media_type=file_item.mime_type or _resolve_download_media_type(filename),
        range_header=range_header,
        disposition="attachment",
    )


def _parse_range_header(value: str | None, *, size: int) -> tuple[int, int] | None:
    """解析单段 HTTP bytes Range；多段请求保持拒绝，避免错误拼包。"""
    if not value:
        return None
    match = re.fullmatch(r"bytes=(\d*)-(\d*)", value.strip())
    if match is None or size <= 0:
        raise HTTPException(status_code=416, detail="不支持的文件分段范围")
    start_raw, end_raw = match.groups()
    if not start_raw and not end_raw:
        raise HTTPException(status_code=416, detail="不支持的文件分段范围")
    if start_raw:
        start = int(start_raw)
        end = int(end_raw) if end_raw else min(size - 1, start + RANGE_CHUNK_BYTES - 1)
    else:
        suffix = min(int(end_raw), size)
        start, end = size - suffix, size - 1
    if start < 0 or start >= size or end < start:
        raise HTTPException(
            status_code=416,
            detail="请求范围超出文件大小",
            headers={"Content-Range": f"bytes */{size}"},
        )
    return start, min(end, size - 1)


async def _build_binary_response(
    *,
    key: str,
    filename: str,
    media_type: str,
    range_header: str | None,
    disposition: str,
) -> Response:
    """从对象存储返回可缓存、支持 Range 的二进制响应。"""
    info = await storage.get_file_info(key=key)
    size = int(info.size or 0)
    byte_range = _parse_range_header(range_header, size=size)
    headers = {
        "Accept-Ranges": "bytes",
        "Content-Disposition": f"{disposition}; filename*=UTF-8''{quote(filename)}",
        "Cache-Control": "private, max-age=3600",
    }
    if byte_range is None:
        content = await storage.download_file(key=key)
        headers["Content-Length"] = str(len(content))
        return Response(content=content, media_type=media_type, headers=headers)
    start, end = byte_range
    content = await storage.download_file_range(key=key, start=start, end=end)
    headers.update(
        {
            "Content-Length": str(len(content)),
            "Content-Range": f"bytes {start}-{end}/{size}",
        }
    )
    return Response(content=content, status_code=206, media_type=media_type, headers=headers)


def _video_preview_key(file_id: str) -> str:
    """返回不依赖数据库迁移的浏览器兼容视频派生对象键。"""
    return f"previews/{file_id}/browser.mp4"


def _probe_video_codec(path: Path) -> str:
    """读取第一路视频编码；无法识别时交给 ffmpeg 转码以获得稳定预览。"""
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=codec_name",
            "-of",
            "json",
            str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    streams = json.loads(result.stdout or "{}").get("streams") or []
    return str(streams[0].get("codec_name") or "") if streams else ""


def _transcode_browser_video(source: Path, target: Path) -> None:
    """将 HEVC 等浏览器兼容性较差的上传视频转为 H.264/AAC 快速预览副本。"""
    subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-y",
            "-i",
            str(source),
            "-map",
            "0:v:0",
            "-map",
            "0:a:0?",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "24",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-movflags",
            "+faststart",
            str(target),
        ],
        check=True,
        capture_output=True,
    )


async def _resolve_video_preview_key(file_item: FileItem) -> str:
    """按需生成并缓存浏览器兼容视频；原始下载文件始终保持不变。"""
    preview_key = _video_preview_key(file_item.id)
    if await storage.file_exists(key=preview_key):
        return preview_key
    content = await storage.download_file(key=file_item.storage_key)
    with tempfile.TemporaryDirectory(prefix="jellyfish-preview-") as temp_dir:
        source = Path(temp_dir) / (file_item.original_name or "source.mp4")
        target = Path(temp_dir) / "browser.mp4"
        await to_thread.run_sync(source.write_bytes, content)
        codec = await to_thread.run_sync(_probe_video_codec, source)
        suffix = source.suffix.lower()
        browser_compatible = (
            suffix == ".mp4" and codec in {"h264", "av1"}
        ) or (
            suffix == ".webm" and codec in {"vp8", "vp9", "av1"}
        )
        if browser_compatible:
            return file_item.storage_key
        await to_thread.run_sync(_transcode_browser_video, source, target)
        preview_content = await to_thread.run_sync(target.read_bytes)
        await storage.upload_file(
            key=preview_key,
            data=preview_content,
            content_type="video/mp4",
        )
    return preview_key


def _extract_docx_text(content: bytes) -> str:
    """使用标准库提取 DOCX 主文档文本，供网页安全只读预览。"""
    try:
        with zipfile.ZipFile(BytesIO(content)) as archive:
            xml = archive.read("word/document.xml")
    except (KeyError, zipfile.BadZipFile) as exc:
        raise HTTPException(status_code=422, detail="DOCX 文件结构无效，无法预览") from exc
    root = ElementTree.fromstring(xml)
    paragraphs: list[str] = []
    for paragraph in root.iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p"):
        text = "".join(
            node.text or ""
            for node in paragraph.iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t")
        ).strip()
        if text:
            paragraphs.append(text)
    return "\n\n".join(paragraphs)


def _extract_pdf_text(content: bytes) -> str:
    """提取 PDF 文本层；扫描件无文字层时返回空串而不是臆测内容。"""
    try:
        from pypdf import PdfReader

        reader = PdfReader(BytesIO(content))
        return "\n\n".join((page.extract_text() or "").strip() for page in reader.pages).strip()
    except Exception as exc:
        raise HTTPException(status_code=422, detail="PDF 无法解析或已加密") from exc


async def extract_document_text(file_item: FileItem, *, max_chars: int = 8000) -> str:
    """从受控文档文件中提取有限文本，供关联资产提示词上下文使用。"""
    if file_item.type != FileType.document:
        return ""
    if file_item.size_bytes and file_item.size_bytes > 25 * 1024 * 1024:
        return "[文档超过 25MB，未自动提取正文]"
    content = await storage.download_file(key=file_item.storage_key)
    suffix = Path(file_item.original_name or file_item.storage_key).suffix.lower()
    if suffix in {".txt", ".md", ".markdown"}:
        text = content.decode("utf-8-sig", errors="replace")
    elif suffix == ".docx":
        text = await to_thread.run_sync(_extract_docx_text, content)
    elif suffix == ".pdf":
        text = await to_thread.run_sync(_extract_pdf_text, content)
    else:
        return ""
    normalized = re.sub(r"\n{3,}", "\n\n", text).strip()
    return normalized[:max_chars]


async def build_preview_response(
    db: AsyncSession,
    *,
    file_id: str,
    range_header: str | None = None,
) -> Response:
    """构建内联预览；视频按需兼容转码，文本和 DOCX 返回只读文本。"""
    file_item = await get_or_404(db, FileItem, file_id, detail=entity_not_found("File"))
    filename = file_item.original_name or Path(file_item.storage_key).name or "preview"
    suffix = Path(filename).suffix.lower()
    if suffix in {".txt", ".md", ".markdown", ".docx"}:
        content = await storage.download_file(key=file_item.storage_key)
        text = _extract_docx_text(content) if suffix == ".docx" else content.decode("utf-8-sig", errors="replace")
        return Response(
            content=text,
            media_type="text/plain",
            headers={"Content-Disposition": f"inline; filename*=UTF-8''{quote(filename)}"},
        )
    preview_key = (
        await _resolve_video_preview_key(file_item)
        if file_item.type == FileType.video
        else file_item.storage_key
    )
    media_type = "video/mp4" if preview_key != file_item.storage_key else (
        file_item.mime_type or _resolve_download_media_type(filename)
    )
    return await _build_binary_response(
        key=preview_key,
        filename=filename,
        media_type=media_type,
        range_header=range_header,
        disposition="inline",
    )


async def get_storage_info(
    db: AsyncSession,
    *,
    file_id: str,
) -> dict[str, Any]:
    """读取对象存储信息。"""
    file_item = await get_or_404(db, FileItem, file_id, detail=entity_not_found("File"))
    info = await storage.get_file_info(key=file_item.storage_key)
    return {
        "key": info.key,
        "url": info.url,
        "size": info.size,
        "content_type": info.content_type,
        "etag": info.etag,
    }


async def delete_file(
    db: AsyncSession,
    *,
    file_id: str,
) -> None:
    """删除文件记录与对象存储中的内容；若记录不存在则静默返回。"""
    file_item = await db.get(FileItem, file_id)
    if file_item is None:
        return

    asset_link_count = int(
        (await db.execute(select(func.count(AssetFileLink.id)).where(AssetFileLink.file_id == file_id))).scalar()
        or 0
    )
    audio_asset_count = int(
        (await db.execute(select(func.count(AudioAsset.id)).where(AudioAsset.file_id == file_id))).scalar()
        or 0
    )
    script_import_count = int(
        (await db.execute(select(func.count(ScriptImport.id)).where(ScriptImport.file_id == file_id))).scalar()
        or 0
    )
    if asset_link_count or audio_asset_count or script_import_count:
        raise HTTPException(
            status_code=409,
            detail=(
                f"文件仍被 {asset_link_count} 个资产附件和 {audio_asset_count} 个音频资产使用，"
                f"并作为 {script_import_count} 个剧本导入批次的原始证据，请先解除业务关联"
            ),
        )

    try:
        await storage.delete_file(key=file_item.storage_key)
    except Exception:
        # 存储删除失败不阻塞记录删除，保持当前接口语义。
        pass
    try:
        await storage.delete_file(key=_video_preview_key(file_id))
    except Exception:
        pass

    await db.delete(file_item)
    await db.flush()
