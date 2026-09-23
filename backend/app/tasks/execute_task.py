"""统一 Celery 执行入口。

职责：
- Celery 统一只接收业务 task_id；
- 通过 GenerationTask.task_kind + registry 找到具体 WorkerTaskExecutor；
- 回写 executor_type / executor_task_id，便于排障。
"""

from __future__ import annotations

import asyncio
import logging

from celery.result import AsyncResult

from app.core.celery_app import celery_app
from app.core.db import close_db, reset_db_runtime
from app.core.db_sync import sync_session_maker
from app.models.task import GenerationTask
from app.services.generation.dispatch import GenerationOutboxDispatcher
from app.services.generation.runtime.text_chat_streaming import reap_expired_text_stream_runs
from app.services.worker.task_registry import task_executor_registry

logger = logging.getLogger(__name__)


def _record_executor_dispatch(task_id: str, *, executor_type: str, executor_task_id: str | None) -> None:
    with sync_session_maker() as db:
        row = db.get(GenerationTask, task_id)
        if row is None:
            return
        row.executor_type = executor_type
        row.executor_task_id = executor_task_id
        db.commit()


def enqueue_task_execution(task_id: str) -> AsyncResult:
    async_result = run_task_celery.delay(task_id)
    _record_executor_dispatch(
        task_id,
        executor_type="celery",
        executor_task_id=async_result.id,
    )
    return async_result


def revoke_task_execution(task_id: str, *, terminate: bool = True, signal: str = "SIGTERM") -> bool:
    with sync_session_maker() as db:
        row = db.get(GenerationTask, task_id)
        if row is None:
            return False
        if (row.executor_type or "").strip() != "celery":
            return False
        executor_task_id = (row.executor_task_id or "").strip()
        if not executor_task_id:
            return False

    try:
        AsyncResult(executor_task_id, app=celery_app).revoke(terminate=terminate, signal=signal)
    except Exception:  # noqa: BLE001
        logger.exception("failed to revoke celery task: task_id=%s executor_task_id=%s", task_id, executor_task_id)
        return False
    return True


@celery_app.task(name="task.execute")
def run_task_celery(task_id: str) -> None:
    with sync_session_maker() as db:
        row = db.get(GenerationTask, task_id)
        if row is None:
            return
        task_kind = (row.task_kind or "").strip() or str((row.payload or {}).get("task_kind") or "").strip()
    executor = task_executor_registry.resolve(task_kind)
    from app.core.integrations.traced_http import call_sink
    from app.services.generation.call_audit import make_call_sink
    token = call_sink.set(make_call_sink(task_id))
    try:
        executor.run(task_id)
    finally:
        call_sink.reset(token)


@celery_app.task(name="task.reap_text_streams")
def reap_text_streams_celery() -> list[str]:
    """由 Celery Beat 周期回收过期的 hidden 文本流，避免重启后任务永久卡在 streaming。"""
    reset_db_runtime()

    async def _run() -> list[str]:
        try:
            return await reap_expired_text_stream_runs()
        finally:
            await close_db()

    return asyncio.run(_run())


@celery_app.task(name="task.dispatch_generation_outbox")
def dispatch_generation_outbox_celery() -> int:
    """由 Celery Beat 投递已提交但尚未发送的统一生成任务。"""
    return GenerationOutboxDispatcher().dispatch_pending()


@celery_app.task(name="task.sync_model_contracts")
def sync_model_contracts_celery(force: bool = False) -> dict:
    """Check only supported/configured official sources; database lease prevents duplicate startup/periodic scans."""
    reset_db_runtime()
    async def run_sync() -> dict:
        """Dispose the worker event-loop database runtime after each bounded synchronization."""
        from app.services.llm.model_governance import sync_official_sources
        try:
            return await sync_official_sources(force=force)
        finally:
            await close_db()
    return asyncio.run(run_sync())


@celery_app.task(name="task.recover_media")
def recover_media_celery():
    """Resume interrupted media work from private receipts without repeating generation submissions."""
    reset_db_runtime()
    async def run():
        """Release the worker database engine after the bounded recovery scan."""
        from app.services.generation.recovery import recover_interrupted_media
        try:
            return await recover_interrupted_media()
        finally:
            await close_db()
    return asyncio.run(run())
