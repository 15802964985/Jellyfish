"""Reviewable script-import endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db
from app.models.llm import Model, ModelCategoryKey
from app.schemas.common import ApiResponse, created_response, success_response
from app.schemas.studio.script_imports import (
    ScriptImportCreate,
    ScriptImportAnalyzeRequest,
    ScriptImportCommitRequest,
    ScriptImportCommitResult,
    ScriptImportMatchesRead,
    ScriptImportMediaPlanRead,
    ScriptImportMediaPlanRequest,
    ScriptImportRead,
    ScriptImportReviewUpdate,
)
from app.services.studio.script_imports import (
    create_script_import,
    commit_script_import,
    get_script_import,
    find_script_import_matches,
    plan_script_import_media,
    list_script_imports,
    update_script_import_review,
)
from app.services.script_processing_tasks import create_script_import_analysis_task
from app.api.v1.routes.film.common import AsyncTaskCreateRead

router = APIRouter()


@router.post("", response_model=ApiResponse[ScriptImportRead], status_code=status.HTTP_201_CREATED)
async def create_script_import_api(
    body: ScriptImportCreate, db: AsyncSession = Depends(get_db, scope="function")
) -> ApiResponse[ScriptImportRead]:
    obj = await create_script_import(db, project_id=body.project_id, file_id=body.file_id)
    return created_response(ScriptImportRead.model_validate(obj, from_attributes=True))


@router.get("", response_model=ApiResponse[list[ScriptImportRead]])
async def list_script_imports_api(
    project_id: str = Query(...), db: AsyncSession = Depends(get_db, scope="function")
) -> ApiResponse[list[ScriptImportRead]]:
    items = await list_script_imports(db, project_id=project_id)
    return success_response([ScriptImportRead.model_validate(item, from_attributes=True) for item in items])


@router.get("/{import_id}", response_model=ApiResponse[ScriptImportRead])
async def get_script_import_api(
    import_id: str, db: AsyncSession = Depends(get_db, scope="function")
) -> ApiResponse[ScriptImportRead]:
    obj = await get_script_import(db, import_id)
    return success_response(ScriptImportRead.model_validate(obj, from_attributes=True))


@router.post("/{import_id}/commit", response_model=ApiResponse[ScriptImportCommitResult])
async def commit_script_import_api(
    import_id: str,
    body: ScriptImportCommitRequest,
    db: AsyncSession = Depends(get_db, scope="function"),
) -> ApiResponse[ScriptImportCommitResult]:
    result = await commit_script_import(
        db,
        import_id=import_id,
        selected_chapter_indexes=body.selected_chapter_indexes,
        chapter_overrides=body.chapter_overrides,
        candidate_decisions=body.candidate_decisions,
        include_shots=body.include_shots,
        include_audio_dialogue=body.include_audio_dialogue,
        media_plan_model_id=body.media_plan_model_id,
    )
    return success_response(result)


@router.get("/{import_id}/matches", response_model=ApiResponse[ScriptImportMatchesRead])
async def get_script_import_matches_api(
    import_id: str, db: AsyncSession = Depends(get_db, scope="function")
) -> ApiResponse[ScriptImportMatchesRead]:
    return success_response(await find_script_import_matches(db, import_id=import_id))


@router.post("/{import_id}/plan-media", response_model=ApiResponse[ScriptImportMediaPlanRead])
async def plan_script_import_media_api(
    import_id: str,
    body: ScriptImportMediaPlanRequest,
    db: AsyncSession = Depends(get_db, scope="function"),
) -> ApiResponse[ScriptImportMediaPlanRead]:
    return success_response(
        await plan_script_import_media(db, import_id=import_id, model_id=body.model_id)
    )


@router.patch("/{import_id}/review", response_model=ApiResponse[ScriptImportRead])
async def update_script_import_review_api(
    import_id: str,
    body: ScriptImportReviewUpdate,
    db: AsyncSession = Depends(get_db, scope="function"),
) -> ApiResponse[ScriptImportRead]:
    obj = await update_script_import_review(db, import_id=import_id, body=body)
    return success_response(ScriptImportRead.model_validate(obj, from_attributes=True))


@router.post("/{import_id}/analyze", response_model=ApiResponse[AsyncTaskCreateRead])
async def analyze_script_import_api(
    import_id: str,
    body: ScriptImportAnalyzeRequest,
    db: AsyncSession = Depends(get_db, scope="function"),
) -> ApiResponse[AsyncTaskCreateRead]:
    """Explicitly opt in to sending the parsed script to the configured text model."""

    obj = await get_script_import(db, import_id)
    if obj.status == "committed":
        raise HTTPException(status_code=409, detail="已提交的导入批次不可重新分析")
    model = await db.get(Model, body.model_id)
    if model is None or model.category != ModelCategoryKey.text:
        raise HTTPException(status_code=422, detail="请选择有效的文本模型")
    if not model.current_revision_id:
        raise HTTPException(status_code=422, detail="文本模型缺少可执行配置版本，请在模型管理中重新保存")
    task_info = await create_script_import_analysis_task(
        db,
        import_id=obj.id,
        parsed_document=dict(obj.parse_result or {}),
        model_id=body.model_id,
        model_revision_id=model.current_revision_id,
    )
    obj.status = "analyzing"
    obj.error_message = ""
    await db.commit()
    return success_response(
        AsyncTaskCreateRead(
            task_id=task_info.task_id,
            status=task_info.status,
            reused=task_info.reused,
            relation_type=task_info.relation_type,
            relation_entity_id=task_info.relation_entity_id,
        )
    )
