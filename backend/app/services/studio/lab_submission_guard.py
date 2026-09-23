"""Serialize duplicate checks with message creation, while allowing distinct lab requests."""
from fastapi import HTTPException
from sqlalchemy import select
from app.models.experiment_sessions import ExperimentSession, ExperimentMessage
from app.models.task import GenerationTask


async def guard_lab_submission(db, session_id, request):
    """Lock one session until commit; reject identical active commands across tabs/workers.

    Compare the complete normalized request, including ordered references and model parameters.
    Terminal tasks do not block an intentional new generation. No fee-bearing task is created here.
    """
    await db.execute(select(ExperimentSession.id).where(
        ExperimentSession.id == session_id).with_for_update())
    tasks = (await db.execute(select(GenerationTask).join(
        ExperimentMessage, ExperimentMessage.task_id == GenerationTask.id).where(
        ExperimentMessage.session_id == session_id,
        GenerationTask.status.in_(["pending", "running"])
    ).with_for_update().execution_options(populate_existing=True))).scalars().all()
    expected = request.model_dump(mode="json")
    for task in tasks:
        command = (task.payload or {}).get("command") or {}
        saved = command.get("request")
        if saved is not None:
            # Normalize older snapshots through today's defaults rather than comparing missing keys.
            try:
                saved = type(request).model_validate(saved).model_dump(mode="json")
            except ValueError:
                continue
        if saved == expected:
            raise HTTPException(409, "相同输入的生成任务仍在执行，请查看原任务；修改提示词、模型或参数后可并行生成。")
