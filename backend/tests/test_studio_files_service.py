from __future__ import annotations

from io import BytesIO

import pytest
from fastapi import UploadFile
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from starlette.datastructures import Headers

from app.core.db import Base
from app.core.storage import StoredFileInfo
from app.models.studio import (
    Chapter,
    FileItem,
    FileType,
    FileUsageKind,
    Project,
    ProjectStyle,
    ProjectVisualStyle,
    Shot,
)
from app.services.studio import files as files_service
from app.services.studio.files import build_preview_response, get_file_detail, list_files_paginated, update_file_meta
from app.schemas.studio.files import FileUpdate


async def _build_session() -> tuple[AsyncSession, object]:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", future=True)
    session_local = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    return session_local(), engine


async def _seed_scope_graph(db: AsyncSession) -> None:
    project = Project(
        id="p1",
        name="项目一",
        description="",
        style=ProjectStyle.real_people_city,
        visual_style=ProjectVisualStyle.live_action,
    )
    chapter = Chapter(id="c1", project_id="p1", index=1, title="第一章")
    shot = Shot(id="s1", chapter_id="c1", index=1, title="镜头一")
    db.add_all([project, chapter, shot])
    await db.commit()


@pytest.mark.asyncio
async def test_list_files_paginated_filters_by_keyword() -> None:
    db, engine = await _build_session()
    async with db:
        db.add_all(
            [
                FileItem(id="f1", type=FileType.image, name="角色主图", thumbnail="", tags=[], storage_key="files/a.png"),
                FileItem(id="f2", type=FileType.video, name="片段视频", thumbnail="", tags=[], storage_key="files/b.mp4"),
            ]
        )
        await db.commit()

        resp = await list_files_paginated(
            db,
            q="角色",
            order="name",
            is_desc=False,
            page=1,
            page_size=10,
        )

        assert resp.data is not None
        assert resp.data.pagination.total == 1
        assert [item.id for item in resp.data.items] == ["f1"]
    await engine.dispose()


@pytest.mark.asyncio
async def test_get_file_detail_includes_usages() -> None:
    db, engine = await _build_session()
    async with db:
        await _seed_scope_graph(db)
        db.add(
            FileItem(
                id="f1",
                type=FileType.image,
                name="角色主图",
                thumbnail="thumb",
                tags=["hero"],
                storage_key="files/a.png",
            )
        )
        await db.commit()

        await update_file_meta(
            db,
            file_id="f1",
            body=FileUpdate(
                usage={
                    "project_id": "p1",
                    "chapter_id": "c1",
                    "shot_id": "s1",
                    "usage_kind": FileUsageKind.upload,
                    "source_ref": "manual",
                }
            ),
        )

        detail = await get_file_detail(db, file_id="f1")

        assert detail.id == "f1"
        assert len(detail.usages) == 1
        assert detail.usages[0].project_id == "p1"
        assert detail.usages[0].chapter_id == "c1"
        assert detail.usages[0].shot_id == "s1"
        assert detail.usages[0].usage_kind == FileUsageKind.upload
    await engine.dispose()


@pytest.mark.asyncio
async def test_update_file_meta_updates_fields_and_upserts_usage() -> None:
    db, engine = await _build_session()
    async with db:
        await _seed_scope_graph(db)
        db.add(
            FileItem(
                id="f1",
                type=FileType.image,
                name="旧名称",
                thumbnail="old",
                tags=["old"],
                storage_key="files/a.png",
            )
        )
        await db.commit()

        updated = await update_file_meta(
            db,
            file_id="f1",
            body=FileUpdate(
                name="新名称",
                thumbnail="new-thumb",
                tags=["hero", "poster"],
                usage={
                    "project_id": "p1",
                    "chapter_id": "c1",
                    "shot_id": "s1",
                    "usage_kind": FileUsageKind.asset_image,
                    "source_ref": "slot-1",
                },
            ),
        )
        updated_again = await update_file_meta(
            db,
            file_id="f1",
            body=FileUpdate(
                usage={
                    "project_id": "p1",
                    "chapter_id": "c1",
                    "shot_id": "s1",
                    "usage_kind": FileUsageKind.asset_image,
                    "source_ref": "slot-1",
                }
            ),
        )
        detail = await get_file_detail(db, file_id="f1")

        assert updated.name == "新名称"
        assert updated.thumbnail == "new-thumb"
        assert updated.tags == ["hero", "poster"]
        assert updated_again.id == "f1"
        assert len(detail.usages) == 1
        assert detail.usages[0].usage_kind == FileUsageKind.asset_image
        assert detail.usages[0].source_ref == "slot-1"
    await engine.dispose()


@pytest.mark.asyncio
async def test_upload_file_does_not_force_public_acl(monkeypatch) -> None:
    """上传应兼容禁用对象 ACL 的 S3 bucket，访问控制由 bucket 策略或下载接口处理。"""
    upload = UploadFile(
        filename="reference.png",
        file=BytesIO(b"png-content"),
        headers=Headers({"content-type": "image/png"}),
    )

    captured: dict[str, object] = {}

    async def _fake_upload_file(**kwargs):
        captured.update(kwargs)
        return StoredFileInfo(key=str(kwargs["key"]), url="https://storage.example/files/reference.png")

    monkeypatch.setattr(files_service.storage, "upload_file", _fake_upload_file)
    db, engine = await _build_session()
    async with db:
        uploaded = await files_service.upload_file(db, file=upload)

        assert uploaded.type == FileType.image
        assert str(captured["key"]).startswith("files/")
        assert str(captured["key"]).endswith("/reference.png")
        assert captured["content_type"] == "image/png"
        assert "extra_args" not in captured
    await engine.dispose()


@pytest.mark.asyncio
async def test_preview_response_returns_partial_video_content(monkeypatch) -> None:
    """浏览器视频预览必须响应 206 与 Content-Range，避免黑屏或无法拖动。"""
    async def _fake_info(**kwargs):
        return StoredFileInfo(key=str(kwargs["key"]), url="", size=1000, content_type="video/mp4")

    async def _fake_range(**kwargs):
        return b"x" * (int(kwargs["end"]) - int(kwargs["start"]) + 1)

    async def _source_preview(file_item):
        return file_item.storage_key

    monkeypatch.setattr(files_service.storage, "get_file_info", _fake_info)
    monkeypatch.setattr(files_service.storage, "download_file_range", _fake_range)
    monkeypatch.setattr(files_service, "_resolve_video_preview_key", _source_preview)
    db, engine = await _build_session()
    async with db:
        db.add(
            FileItem(
                id="video-1",
                type=FileType.video,
                name="视频",
                thumbnail="",
                tags=[],
                storage_key="files/video.mp4",
                original_name="video.mp4",
                mime_type="video/mp4",
            )
        )
        await db.commit()
        response = await build_preview_response(db, file_id="video-1", range_header="bytes=0-99")
        assert response.status_code == 206
        assert response.headers["content-range"] == "bytes 0-99/1000"
        assert response.headers["accept-ranges"] == "bytes"
        assert len(response.body) == 100
    await engine.dispose()
