"""项目真实视频时间线与成片导出路由。"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db
from app.schemas.common import ApiResponse, created_response, success_response
from app.schemas.studio.timeline import (
    ProjectTimelineRead, ProjectEditRead, ProjectEditSave,
    ProjectVideoExportRequest,
    ProjectVideoExportTaskRead,
)
from app.services.studio.project_video_export import (
    build_project_timeline,
    create_project_video_export_task,
)

from app.services.studio.project_editing import load_project_edit, save_project_edit

router = APIRouter()


@router.get(
    "/projects/{project_id}",
    response_model=ApiResponse[ProjectTimelineRead],
    summary="读取项目真实视频时间线",
)
async def get_project_timeline(
    project_id: str,
    db: AsyncSession = Depends(get_db, scope="function"),
) -> ApiResponse[ProjectTimelineRead]:
    """根据当前镜头成片实时构建时间线，不返回 mock 数据。"""

    try:
        timeline = await build_project_timeline(db, project_id=project_id)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return success_response(timeline)


@router.post(
    "/projects/{project_id}/exports",
    response_model=ApiResponse[ProjectVideoExportTaskRead],
    status_code=status.HTTP_201_CREATED,
    summary="提交项目 MP4 成片导出任务",
)
async def export_project_video(
    project_id: str,
    body: ProjectVideoExportRequest,
    db: AsyncSession = Depends(get_db, scope="function"),
) -> ApiResponse[ProjectVideoExportTaskRead]:
    """在任务中心创建可恢复、可取消的本地 FFmpeg 导出任务。"""

    try:
        task_id, task_status, reused = await create_project_video_export_task(
            db,
            project_id=project_id,
            allow_partial=body.allow_partial,
            include_subtitles=body.include_subtitles,
            edit_revision=body.edit_revision,
        )
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    await db.commit()
    return created_response(
        ProjectVideoExportTaskRead(task_id=task_id, status=task_status, reused=reused)
    )



@router.get("/projects/{project_id}/edit", response_model=ApiResponse[ProjectEditRead])
async def get_project_edit(project_id: str, db: AsyncSession = Depends(get_db, scope="function")) -> ApiResponse[ProjectEditRead]:
    """读取跨页面持久化的剪辑工程。"""
    try:
        return success_response(await load_project_edit(db, project_id))
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc


@router.put("/projects/{project_id}/edit", response_model=ApiResponse[ProjectEditRead])
async def put_project_edit(project_id: str, body: ProjectEditSave,
                           db: AsyncSession = Depends(get_db, scope="function")) -> ApiResponse[ProjectEditRead]:
    """保存剪辑快照与引用，冲突时保留客户端草稿供核对。"""
    try:
        result = await save_project_edit(db, project_id, body)
        await db.commit()
        return success_response(result)
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc


from app.schemas.studio.timeline import (EditVisualPrepare, EditVisualEvidence, EditVisualSubmit, EditVisualModel, EditVisualReport)
from app.services.studio.project_visual_review import (visual_models, prepare_visual_evidence, submit_visual_review, visual_history)


@router.get('/visual-review-models', response_model=ApiResponse[list[EditVisualModel]])
async def get_edit_visual_models(db: AsyncSession = Depends(get_db)):
    """读取已配置且支持图片检查的模型，不调用供应商。"""
    return success_response(await visual_models(db))


@router.post('/projects/{project_id}/visual-evidence', response_model=ApiResponse[EditVisualEvidence])
async def prepare_edit_visual(project_id: str, body: EditVisualPrepare, db: AsyncSession = Depends(get_db)):
    """本地准备可预览的抽帧与基准图清单。"""
    try:
        result = await prepare_visual_evidence(db, project_id, body)
        await db.commit()
        return success_response(result)
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc


@router.post('/projects/{project_id}/visual-reviews', response_model=ApiResponse[ProjectVideoExportTaskRead])
async def submit_edit_visual(project_id: str, body: EditVisualSubmit, db: AsyncSession = Depends(get_db)):
    """用户明确确认外发与费用后提交审片任务。"""
    try:
        task_id = await submit_visual_review(db, project_id, body)
        await db.commit()
        return success_response(ProjectVideoExportTaskRead(task_id=task_id, status='pending'))
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc


@router.get('/projects/{project_id}/visual-reviews', response_model=ApiResponse[list[EditVisualReport]])
async def get_edit_visual_history(project_id: str, clip_id: str, db: AsyncSession = Depends(get_db)):
    """只查询对应片段的成功报告并标记其是否适用于当前工程。"""
    try:
        return success_response(await visual_history(db, project_id, clip_id))
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc


from app.schemas.studio.timeline import CharacterAngleGroup
from app.services.studio.character_views import character_angle_groups


@router.get('/shots/{shot_id}/character-views', response_model=ApiResponse[list[CharacterAngleGroup]])
async def get_shot_character_views(shot_id: str, db: AsyncSession = Depends(get_db)):
    """提供当前镜头人物的多角度图片目录，不执行模型调用。"""
    try:
        return success_response(await character_angle_groups(db, shot_id))
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc
