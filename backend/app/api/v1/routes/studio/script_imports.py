"""Reviewable script-import endpoints."""

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db
from app.schemas.common import ApiResponse, created_response, success_response
from app.schemas.studio.script_imports import (
    ScriptImportCreate,
    ScriptImportCommitRequest,
    ScriptImportCommitResult,
    ScriptImportRead,
    ScriptImportReviewUpdate,
)
from app.services.studio.script_imports import (
    create_script_import,
    commit_script_import,
    get_script_import,
    list_script_imports,
    update_script_import_review,
)

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
    )
    return success_response(result)


@router.patch("/{import_id}/review", response_model=ApiResponse[ScriptImportRead])
async def update_script_import_review_api(
    import_id: str,
    body: ScriptImportReviewUpdate,
    db: AsyncSession = Depends(get_db, scope="function"),
) -> ApiResponse[ScriptImportRead]:
    obj = await update_script_import_review(db, import_id=import_id, body=body)
    return success_response(ScriptImportRead.model_validate(obj, from_attributes=True))
