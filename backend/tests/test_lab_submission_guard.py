"""Database-backed duplicate protection without any model or broker calls."""
import pytest
from fastapi import HTTPException
from app.core.contracts.generation import GenerationSubmitRequest
from app.models.experiment_sessions import ExperimentSession, ExperimentMessage
from app.models.task import GenerationTask
from app.services.studio.lab_submission_guard import guard_lab_submission
from tests.test_media_recovery import environment


@pytest.mark.asyncio
async def test_same_active_input_blocked_distinct_and_terminal_allowed(environment):
    """Protect identical running inputs while preserving parallel and intentional regeneration."""
    maker, _ = environment
    request = GenerationSubmitRequest.model_validate({"model_id": "model", "execution_prompt": "a girl",
        "operation_input": {"kind": "image_generation"}})
    async with maker() as db:
        db.add(ExperimentSession(id="session", lab_type="image"))
        db.add(GenerationTask(id="lab", mode="async_polling", task_kind="image_generation", status="running",
            payload={"command": {"request": request.model_dump(mode="json")}}))
        await db.flush()
        db.add(ExperimentMessage(id="message", session_id="session", sequence=1, role="task", task_id="lab"))
        await db.commit()
    async with maker() as db:
        with pytest.raises(HTTPException) as error:
            await guard_lab_submission(db, "session", request)
        assert error.value.status_code == 409
        await db.rollback()
        await guard_lab_submission(db, "session", request.model_copy(update={"execution_prompt": "another shot"}))
        await db.rollback()
        task = await db.get(GenerationTask, "lab")
        task.status = "succeeded"
        await db.commit()
        await guard_lab_submission(db, "session", request)
