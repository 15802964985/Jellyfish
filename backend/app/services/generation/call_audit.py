"""Task-scoped provider request persistence and read-only diagnostic exports."""
from fastapi import HTTPException
from sqlalchemy import select
from app.core.db import async_session_maker
from app.models.generation_calls import GenerationCall
from app.models.task import GenerationTask
from app.core.integrations.traced_http import sanitize


def make_call_sink(task_id: str):
    """Create a task-local writer; commit before network calls so crashes leave visible pending attempts."""
    async def record(attempt: str, values: dict) -> None:
        """Write only explicit audit fields, separately from task result updates."""
        async with async_session_maker() as db:
            row = await db.get(GenerationCall, attempt)
            if row is None:
                row = GenerationCall(id=attempt, task_id=task_id, **values)
                db.add(row)
            else:
                for key, value in values.items():
                    setattr(row, key, value)
            await db.commit()
        if values.get("status_code") in {400, 404, 405, 415, 422}:
            try:
                from app.services.llm.model_governance import queue_after_protocol_error
                await queue_after_protocol_error()
            except Exception:
                # Audit is already durable; a diagnostic queue outage must not replace the provider error.
                import logging
                logging.getLogger(__name__).warning("Could not schedule official compatibility check")
    return record


async def get_call_details(db, task_id: str) -> dict:
    """Expose frozen inputs and sanitized actual calls; absent historic records are explicitly unknown."""
    task = await db.get(GenerationTask, task_id)
    if task is None or task.visibility == "hidden":
        raise HTTPException(status_code=404, detail="任务不存在")
    payload = task.payload or {}
    snapshot = payload.get("snapshot") or {}
    calls = (await db.execute(select(GenerationCall).where(GenerationCall.task_id == task_id)
        .order_by(GenerationCall.created_at, GenerationCall.id))).scalars().all()
    from app.services.generation.recovery import recovery_status
    recovery = await recovery_status(db, task_id)
    return sanitize({
        "recovery": recovery,
        "task_id": task.id, "task_kind": task.task_kind, "status": task.status,
        "identity": payload.get("call_identity"),
        "snapshot": snapshot,
        "error": task.error,
        "calls": [{"id": row.id, "created_at": row.created_at.isoformat(), "method": row.method,
            "endpoint": row.endpoint, "request": row.request, "response": row.response,
            "status_code": row.status_code, "state": row.state} for row in calls],
        "notice": "历史未记录字段不能回溯补齐；sending 或 transport_error 不证明供应商未受理，请勿盲目重复生成。",
    })
