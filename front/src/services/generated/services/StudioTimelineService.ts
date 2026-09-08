/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ApiResponse_ProjectTimelineRead_ } from '../models/ApiResponse_ProjectTimelineRead_';
import type { ApiResponse_ProjectVideoExportTaskRead_ } from '../models/ApiResponse_ProjectVideoExportTaskRead_';
import type { ProjectVideoExportRequest } from '../models/ProjectVideoExportRequest';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class StudioTimelineService {
    /**
     * 读取项目真实视频时间线
     * 根据当前镜头成片实时构建时间线，不返回 mock 数据。
     * @returns ApiResponse_ProjectTimelineRead_ Successful Response
     * @throws ApiError
     */
    public static getProjectTimelineApiV1StudioTimelineProjectsProjectIdGet({
        projectId,
    }: {
        projectId: string,
    }): CancelablePromise<ApiResponse_ProjectTimelineRead_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/studio/timeline/projects/{project_id}',
            path: {
                'project_id': projectId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * 提交项目 MP4 成片导出任务
     * 在任务中心创建可恢复、可取消的本地 FFmpeg 导出任务。
     * @returns ApiResponse_ProjectVideoExportTaskRead_ Successful Response
     * @throws ApiError
     */
    public static exportProjectVideoApiV1StudioTimelineProjectsProjectIdExportsPost({
        projectId,
        requestBody,
    }: {
        projectId: string,
        requestBody: ProjectVideoExportRequest,
    }): CancelablePromise<ApiResponse_ProjectVideoExportTaskRead_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/timeline/projects/{project_id}/exports',
            path: {
                'project_id': projectId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
}
