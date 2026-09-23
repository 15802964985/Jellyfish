"""Task-scoped durable HTTP hooks; integrations depend on contracts, not worker services."""
from contextvars import ContextVar
from typing import Any
media_recovery: ContextVar[Any | None] = ContextVar("media_recovery", default=None)


async def confirm_media_receipt(task_id: str | None) -> None:
    """Mark a task only after its adapter has validated the provider's creation reply."""
    recovery = media_recovery.get()
    if recovery is not None and task_id:
        await recovery.confirm_receipt(str(task_id))
