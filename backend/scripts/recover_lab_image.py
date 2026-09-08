"""Recover a verified lab image after publication rollback, without provider calls."""

import argparse
import asyncio
from uuid import uuid4

from sqlalchemy import select

from app.core.db import async_session_maker
from app.core.storage import get_file_info
from app.models.experiment_sessions import ExperimentMessage
from app.models.generation_artifacts import GenerationArtifact
from app.models.studio import FileItem
from app.models.task import GenerationTask
from app.models.task_links import GenerationTaskLink


async def recover(task_id: str, key: str, apply: bool) -> None:
    """Validate exact task/object correlation; default to a read-only dry run."""
    if not key.startswith("generated-images/experiment_session/"):
        raise ValueError("Only laboratory image objects can be recovered")
    info = await get_file_info(key=key)
    if not info.size or not (info.content_type or "").startswith("image/"):
        raise ValueError("Stored object is not a non-empty image")
    async with async_session_maker() as db:
        task = await db.get(GenerationTask, task_id, with_for_update=apply)
        if task is None or task.status != "failed" or task.error != "image generation snapshot target is unsupported":
            raise ValueError("Task is not the specific recoverable publication failure")
        target = task.payload.get("snapshot", {}).get("canonical_target", {})
        if target.get("kind") != "experiment_session":
            raise ValueError("Task is not a laboratory task")
        modified = (info.extra or {}).get("LastModified")
        if modified is None or abs((modified.replace(tzinfo=None) - task.updated_at.replace(tzinfo=None)).total_seconds()) > 5:
            raise ValueError("Object time does not match task failure; manual evidence required")
        if await db.scalar(select(FileItem.id).where(FileItem.storage_key == key)):
            raise ValueError("Object already has a file record")
        if await db.scalar(select(GenerationArtifact.id).where(GenerationArtifact.task_id == task_id)):
            raise ValueError("Task already has artifacts")
        message = await db.scalar(select(ExperimentMessage).where(ExperimentMessage.task_id == task_id, ExperimentMessage.session_id == target["entity_id"]))
        link = await db.scalar(select(GenerationTaskLink).where(GenerationTaskLink.task_id == task_id, GenerationTaskLink.relation_type == "experiment_session", GenerationTaskLink.relation_entity_id == target["entity_id"]))
        if message is None or link is None:
            raise ValueError("Matching conversation message and task link are required")
        if not apply:
            print({"task_id": task_id, "key": key, "bytes": info.size, "validated": True})
            return
        file_id = str(uuid4())
        db.add(FileItem(id=file_id, type="image", name=f"recovered-lab-{task_id[:8]}", storage_key=key, thumbnail=info.url, mime_type=info.content_type, size_bytes=info.size))
        await db.flush()
        recovery = {"source": "existing_object_after_publication_rollback", "original_error": task.error, "object_key": key}
        db.add(GenerationArtifact(id=uuid4().hex, task_id=task_id, ordinal=0, modality="image", file_id=file_id, publish_status="skipped", publish_error="no_target_slot", provider_result={"recovery": recovery}))
        result = {"file_id": file_id, "file_ids": [file_id], "publish_status": "skipped", "recovery": recovery}
        task.result, task.status, task.progress, task.error = result, "succeeded", 100, ""
        link.file_id = file_id
        message.status = "succeeded"
        payload = dict(message.payload or {})
        payload.pop("error", None)
        message.payload = {**payload, "result": result}
        await db.commit()
        print({"task_id": task_id, "file_id": file_id, "recovered": True})


async def main() -> None:
    """Close the SQL connection pool before the command's event loop exits."""
    from app.core.db import engine

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--task-id", required=True)
    parser.add_argument("--key", required=True)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    try:
        await recover(args.task_id, args.key, args.apply)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
