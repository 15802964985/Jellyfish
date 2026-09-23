/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ApiResponse_EditVisualEvidence_ } from '../models/ApiResponse_EditVisualEvidence_';
import type { ApiResponse_list_CharacterAngleGroup__ } from '../models/ApiResponse_list_CharacterAngleGroup__';
import type { ApiResponse_list_EditVisualModel__ } from '../models/ApiResponse_list_EditVisualModel__';
import type { ApiResponse_list_EditVisualReport__ } from '../models/ApiResponse_list_EditVisualReport__';
import type { ApiResponse_ProjectEditRead_ } from '../models/ApiResponse_ProjectEditRead_';
import type { ApiResponse_ProjectTimelineRead_ } from '../models/ApiResponse_ProjectTimelineRead_';
import type { ApiResponse_ProjectVideoExportTaskRead_ } from '../models/ApiResponse_ProjectVideoExportTaskRead_';
import type { EditVisualPrepare } from '../models/EditVisualPrepare';
import type { EditVisualSubmit } from '../models/EditVisualSubmit';
import type { ProjectEditSave } from '../models/ProjectEditSave';
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
    /**
     * Get Project Edit
     * 读取跨页面持久化的剪辑工程。
     * @returns ApiResponse_ProjectEditRead_ Successful Response
     * @throws ApiError
     */
    public static getProjectEditApiV1StudioTimelineProjectsProjectIdEditGet({
        projectId,
    }: {
        projectId: string,
    }): CancelablePromise<ApiResponse_ProjectEditRead_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/studio/timeline/projects/{project_id}/edit',
            path: {
                'project_id': projectId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Put Project Edit
     * 保存剪辑快照与引用，冲突时保留客户端草稿供核对。
     * @returns ApiResponse_ProjectEditRead_ Successful Response
     * @throws ApiError
     */
    public static putProjectEditApiV1StudioTimelineProjectsProjectIdEditPut({
        projectId,
        requestBody,
    }: {
        projectId: string,
        requestBody: ProjectEditSave,
    }): CancelablePromise<ApiResponse_ProjectEditRead_> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/api/v1/studio/timeline/projects/{project_id}/edit',
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
    /**
     * Get Edit Visual Models
     * 读取已配置且支持图片检查的模型，不调用供应商。
     * @returns ApiResponse_list_EditVisualModel__ Successful Response
     * @throws ApiError
     */
    public static getEditVisualModelsApiV1StudioTimelineVisualReviewModelsGet(): CancelablePromise<ApiResponse_list_EditVisualModel__> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/studio/timeline/visual-review-models',
        });
    }
    /**
     * Prepare Edit Visual
     * 本地准备可预览的抽帧与基准图清单。
     * @returns ApiResponse_EditVisualEvidence_ Successful Response
     * @throws ApiError
     */
    public static prepareEditVisualApiV1StudioTimelineProjectsProjectIdVisualEvidencePost({
        projectId,
        requestBody,
    }: {
        projectId: string,
        requestBody: EditVisualPrepare,
    }): CancelablePromise<ApiResponse_EditVisualEvidence_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/timeline/projects/{project_id}/visual-evidence',
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
    /**
     * Submit Edit Visual
     * 用户明确确认外发与费用后提交审片任务。
     * @returns ApiResponse_ProjectVideoExportTaskRead_ Successful Response
     * @throws ApiError
     */
    public static submitEditVisualApiV1StudioTimelineProjectsProjectIdVisualReviewsPost({
        projectId,
        requestBody,
    }: {
        projectId: string,
        requestBody: EditVisualSubmit,
    }): CancelablePromise<ApiResponse_ProjectVideoExportTaskRead_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/timeline/projects/{project_id}/visual-reviews',
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
    /**
     * Get Edit Visual History
     * 只查询对应片段的成功报告并标记其是否适用于当前工程。
     * @returns ApiResponse_list_EditVisualReport__ Successful Response
     * @throws ApiError
     */
    public static getEditVisualHistoryApiV1StudioTimelineProjectsProjectIdVisualReviewsGet({
        projectId,
        clipId,
    }: {
        projectId: string,
        clipId: string,
    }): CancelablePromise<ApiResponse_list_EditVisualReport__> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/studio/timeline/projects/{project_id}/visual-reviews',
            path: {
                'project_id': projectId,
            },
            query: {
                'clip_id': clipId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Get Shot Character Views
     * 提供当前镜头人物的多角度图片目录，不执行模型调用。
     * @returns ApiResponse_list_CharacterAngleGroup__ Successful Response
     * @throws ApiError
     */
    public static getShotCharacterViewsApiV1StudioTimelineShotsShotIdCharacterViewsGet({
        shotId,
    }: {
        shotId: string,
    }): CancelablePromise<ApiResponse_list_CharacterAngleGroup__> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/studio/timeline/shots/{shot_id}/character-views',
            path: {
                'shot_id': shotId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
}
