"""项目真实视频时间线与成片导出路由。"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db
from app.schemas.common import ApiResponse, created_response, success_response
from app.schemas.studio.timeline import (
    ProjectTimelineRead,
    ProjectVideoExportRequest,
    ProjectVideoExportTaskRead,
)
from app.services.studio.project_video_export import (
    build_project_timeline,
    create_project_video_export_task,
)

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
        )
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    await db.commit()
    return created_response(
        ProjectVideoExportTaskRead(task_id=task_id, status=task_status, reused=reused)
    )

