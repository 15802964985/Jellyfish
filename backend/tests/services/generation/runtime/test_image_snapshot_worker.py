"""图片 snapshot Worker 的安全输入投影测试。"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.core.contracts.generation import (
    GenerationTarget,
    GenerationTargetKind,
    ImageGenerationOperationInput,
    ResolvedGenerationSnapshot,
)
from app.core.contracts.media import ImageMediaInput, MediaReference
from app.services.studio import image_task_runner


class _RevisionSession:
    """为图片输入投影提供最小 revision 查询能力。"""

    async def get(self, model: object, identifier: str) -> object | None:
        """只返回冻结模型配置，避免测试依赖真实数据库。"""
        if identifier == "revision-1":
            return SimpleNamespace(model_name="image-model")
        return None


class _FakeResolver:
    """记录 Worker 是否通过 FileResolver 取得执行期媒体内容。"""

    references: list[MediaReference] = []

    def __init__(self, _session: object) -> None:
        """保持与真实 resolver 相同的构造签名。"""

    async def resolve_task_reference(self, *, task_id: str, reference: MediaReference) -> SimpleNamespace:
        """模拟按任务冻结快照解析的内存 PNG 内容。"""
        assert task_id == "task-1"
        self.references.append(reference)
        return SimpleNamespace(content=b"png-bytes", content_type="image/png")


@pytest.mark.asyncio
async def test_snapshot_image_input_resolves_file_reference_only_in_worker_memory(monkeypatch) -> None:
    """Worker 从 snapshot 的 file_id 解析媒体，不接触历史 run_args URL 或凭据。"""
    monkeypatch.setattr(image_task_runner, "FileResolver", _FakeResolver)
    snapshot = ResolvedGenerationSnapshot(
        model_id="model-1",
        model_revision_id="revision-1",
        canonical_target=GenerationTarget(
            kind=GenerationTargetKind.shot_frame_slot,
            entity_id="shot-1",
            slot_id="12",
        ),
        expected_version_id=1,
        media=ImageMediaInput(references=[MediaReference(file_id="file-1", media_kind="image")]),
        operation_input=ImageGenerationOperationInput(target_ratio="16:9", count=2),
        execution_prompt="冻结提示词",
    )

    input_ = await image_task_runner._resolve_snapshot_image_input(  # type: ignore[arg-type]
        _RevisionSession(),
        task_id="task-1",
        snapshot=snapshot,
    )

    assert _FakeResolver.references == [MediaReference(file_id="file-1", media_kind="image")]
    assert input_.prompt == "冻结提示词"
    assert input_.model == "image-model"
    assert input_.n == 2
    assert input_.purpose == "video_reference"
    assert input_.images[0].file_id is None
    assert input_.images[0].image_url == "data:image/png;base64,cG5nLWJ5dGVz"


@pytest.mark.asyncio
@pytest.mark.parametrize("provider", ["aliyun_bailian", "volcengine"])
async def test_experiment_image_archives_and_links_without_slot_version(monkeypatch, provider) -> None:
    """Both providers must deliver a laboratory result without asset-slot CAS."""
    from app.core.contracts.image_generation import ImageGenerationResult, ImageItem
    from app.models.generation_artifacts import GenerationArtifactPublishStatus

    snapshot = ResolvedGenerationSnapshot(
        model_id="model-1", model_revision_id="revision-1",
        canonical_target=GenerationTarget(kind=GenerationTargetKind.experiment_session, entity_id="lab-1"),
        operation_input=ImageGenerationOperationInput(), execution_prompt="pencil",
    )
    result = ImageGenerationResult(provider=provider, images=[ImageItem(b64_json="cG5n")])
    task = SimpleNamespace(run=AsyncMock(), get_result=AsyncMock(return_value=result))
    monkeypatch.setattr(image_task_runner, "ImageGenerationTask", MagicMock(return_value=task))
    monkeypatch.setattr(image_task_runner, "_resolve_snapshot_provider_config", AsyncMock())
    monkeypatch.setattr(image_task_runner, "_resolve_snapshot_image_input", AsyncMock())
    archive = AsyncMock(return_value=[SimpleNamespace(file_id="archived-image", publish_status=GenerationArtifactPublishStatus.skipped)])
    monkeypatch.setattr(image_task_runner, "ArtifactStore", lambda: SimpleNamespace(store_images=archive))
    db = SimpleNamespace(execute=AsyncMock())
    payload, _ = await image_task_runner._run_snapshot_image_generation(
        db, task_id="task-1", snapshot_payload=snapshot.model_dump(mode="json"),
    )
    assert payload["file_id"] == "archived-image"
    assert payload["file_ids"] == ["archived-image"]
    task.run.assert_awaited_once()
    archive.assert_awaited_once()
    db.execute.assert_awaited_once()


@pytest.mark.asyncio
async def test_invalid_image_target_fails_before_provider_call(monkeypatch) -> None:
    """An unsupported target must never consume provider quota."""
    snapshot = ResolvedGenerationSnapshot(
        model_id="model-1", model_revision_id="revision-1",
        canonical_target=GenerationTarget(kind=GenerationTargetKind.shot_video, entity_id="shot-1"),
        operation_input=ImageGenerationOperationInput(), execution_prompt="pencil",
    )
    config = AsyncMock()
    monkeypatch.setattr(image_task_runner, "_resolve_snapshot_provider_config", config)
    with pytest.raises(RuntimeError, match="target is unsupported"):
        await image_task_runner._run_snapshot_image_generation(
            SimpleNamespace(), task_id="task-1", snapshot_payload=snapshot.model_dump(mode="json"),
        )
    config.assert_not_awaited()


@pytest.mark.asyncio
async def test_lab_worker_commits_file_artifact_link_and_message(monkeypatch) -> None:
    """Exercise the full laboratory worker transaction with only external IO mocked."""
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from app.core.db import Base
    from app.core.task_manager import SqlAlchemyTaskStore, DeliveryMode
    from app.models.experiment_sessions import ExperimentSession, ExperimentMessage
    from app.models.task import GenerationTask
    from app.models.task_links import GenerationTaskLink
    from app.models.studio import FileItem
    from app.models.generation_artifacts import GenerationArtifact
    from app.core.contracts.image_generation import ImageGenerationResult, ImageItem
    from app.services.generation.runtime import artifacts as artifact_module

    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    snapshot = ResolvedGenerationSnapshot(
        model_id="model-1", model_revision_id="revision-1",
        canonical_target=GenerationTarget(kind=GenerationTargetKind.experiment_session, entity_id="lab"),
        operation_input=ImageGenerationOperationInput(), execution_prompt="pencil",
    )
    async with sessions() as db:
        task = await SqlAlchemyTaskStore(db).create(
            payload={"snapshot": snapshot.model_dump(mode="json")},
            mode=DeliveryMode.async_polling, task_kind="image_generation",
        )
        db.add(ExperimentSession(id="lab", lab_type="image", title="Lab"))
        await db.flush()
        db.add(ExperimentMessage(id="message", session_id="lab", role="task", content="Generating", task_id=task.id, status="pending", payload={}, sequence=1))
        db.add(GenerationTaskLink(task_id=task.id, resource_type="image", relation_type="experiment_session", relation_entity_id="lab"))
        await db.commit()

    async def archive_file(db, **kwargs):
        """Replace network/storage IO while retaining actual artifact persistence."""
        file = FileItem(id="lab-output", name="Pencil", type="image", storage_key="test/pencil.png")
        db.add(file)
        await db.flush()
        return file

    result = ImageGenerationResult(provider="volcengine", images=[ImageItem(b64_json="cG5n")])
    monkeypatch.setattr(image_task_runner, "async_session_maker", sessions)
    monkeypatch.setattr(image_task_runner, "_resolve_snapshot_provider_config", AsyncMock())
    monkeypatch.setattr(image_task_runner, "_resolve_snapshot_image_input", AsyncMock())
    monkeypatch.setattr(image_task_runner, "ImageGenerationTask", lambda **kwargs: SimpleNamespace(run=AsyncMock(), get_result=AsyncMock(return_value=result)))
    monkeypatch.setattr(artifact_module, "create_file_from_url_or_b64", archive_file)
    await image_task_runner.run_image_generation_task(task.id, {})
    async with sessions() as db:
        saved_task = await db.get(GenerationTask, task.id)
        assert saved_task.status == "succeeded"
        assert saved_task.result["file_id"] == "lab-output"
        message = await db.get(ExperimentMessage, "message")
        assert message.status == "succeeded"
        assert message.payload["result"]["file_id"] == "lab-output"
        assert (await db.scalar(select(GenerationTaskLink))).file_id == "lab-output"
        assert (await db.scalar(select(GenerationArtifact))).file_id == "lab-output"
        assert await db.get(FileItem, "lab-output") is not None
    await engine.dispose()
