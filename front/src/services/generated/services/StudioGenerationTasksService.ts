/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AdoptVideoEditRequest } from '../models/AdoptVideoEditRequest';
import type { ApiResponse_dict_ } from '../models/ApiResponse_dict_';
import type { ApiResponse_dict_str__str__ } from '../models/ApiResponse_dict_str__str__';
import type { ApiResponse_ExperimentTaskCreated_ } from '../models/ApiResponse_ExperimentTaskCreated_';
import type { ApiResponse_list_dict__ } from '../models/ApiResponse_list_dict__';
import type { ApiResponse_QualityReviewHistory_ } from '../models/ApiResponse_QualityReviewHistory_';
import type { ApiResponse_QualityReviewRecord_ } from '../models/ApiResponse_QualityReviewRecord_';
import type { ApiResponse_TaskCreated_ } from '../models/ApiResponse_TaskCreated_';
import type { ApiResponse_VideoEditCatalogRead_ } from '../models/ApiResponse_VideoEditCatalogRead_';
import type { ApiResponse_VideoEditPreviewRead_ } from '../models/ApiResponse_VideoEditPreviewRead_';
import type { ApplyReviewRevisionRequest } from '../models/ApplyReviewRevisionRequest';
import type { FrameReviewCheckRequest } from '../models/FrameReviewCheckRequest';
import type { GenerationSubmitRequest } from '../models/GenerationSubmitRequest';
import type { QualityReviewRequest } from '../models/QualityReviewRequest';
import type { ShotFrameType } from '../models/ShotFrameType';
import type { VideoEditPreflightRequest } from '../models/VideoEditPreflightRequest';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class StudioGenerationTasksService {
    /**
     * List Video Edit Models
     * Return the backend-owned capability catalogue and precise configured exclusions.
     * @returns ApiResponse_VideoEditCatalogRead_ Successful Response
     * @throws ApiError
     */
    public static listVideoEditModelsApiV1StudioGenerationTasksVideoEditModelsGet(): CancelablePromise<ApiResponse_VideoEditCatalogRead_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/studio/generation-tasks/video-edit-models',
        });
    }
    /**
     * Preflight Video Edit
     * Only inspect local files/configuration; no external request or generation task.
     * @returns ApiResponse_VideoEditPreviewRead_ Successful Response
     * @throws ApiError
     */
    public static preflightVideoEditApiV1StudioGenerationTasksShotsShotIdVideoEditPreflightPost({
        shotId,
        requestBody,
    }: {
        shotId: string,
        requestBody: VideoEditPreflightRequest,
    }): CancelablePromise<ApiResponse_VideoEditPreviewRead_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/generation-tasks/shots/{shot_id}/video-edit-preflight',
            path: {
                'shot_id': shotId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Get Quality Review History
     * 免费读取镜头预检/修改历史；读取不会重新提交或调用模型。
     * @returns ApiResponse_QualityReviewHistory_ Successful Response
     * @throws ApiError
     */
    public static getQualityReviewHistoryApiV1StudioGenerationTasksShotsShotIdQualityReviewsGet({
        shotId,
        scope = 'video',
        stage,
        outputFileId,
        page = 1,
        pageSize = 10,
    }: {
        shotId: string,
        scope?: 'video' | 'first' | 'key' | 'last' | 'legacy',
        stage?: ('before' | 'after' | null),
        outputFileId?: (string | null),
        page?: number,
        pageSize?: number,
    }): CancelablePromise<ApiResponse_QualityReviewHistory_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/studio/generation-tasks/shots/{shot_id}/quality-reviews',
            path: {
                'shot_id': shotId,
            },
            query: {
                'scope': scope,
                'stage': stage,
                'output_file_id': outputFileId,
                'page': page,
                'page_size': pageSize,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Apply Quality Revision
     * 显式应用优化方案；只保存草稿/标记，不调用模型。
     * @returns ApiResponse_QualityReviewRecord_ Successful Response
     * @throws ApiError
     */
    public static applyQualityRevisionApiV1StudioGenerationTasksShotsShotIdQualityReviewsTaskIdApplyPost({
        shotId,
        taskId,
        requestBody,
    }: {
        shotId: string,
        taskId: string,
        requestBody: ApplyReviewRevisionRequest,
    }): CancelablePromise<ApiResponse_QualityReviewRecord_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/generation-tasks/shots/{shot_id}/quality-reviews/{task_id}/apply',
            path: {
                'shot_id': shotId,
                'task_id': taskId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Submit Quality Review
     * 显式提交预检或调整，服务层负责校验历史来源与冻结证据。
     * @returns ApiResponse_TaskCreated_ Successful Response
     * @throws ApiError
     */
    public static submitQualityReviewApiV1StudioGenerationTasksShotsShotIdQualityReviewPost({
        shotId,
        requestBody,
    }: {
        shotId: string,
        requestBody: QualityReviewRequest,
    }): CancelablePromise<ApiResponse_TaskCreated_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/generation-tasks/shots/{shot_id}/quality-review',
            path: {
                'shot_id': shotId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Adopt Shot Video Edit
     * Adopt only after explicit comparison; preserve source files and edit provenance.
     * @returns ApiResponse_dict_str__str__ Successful Response
     * @throws ApiError
     */
    public static adoptShotVideoEditApiV1StudioGenerationTasksShotsShotIdVideoEditsTaskIdAdoptPost({
        shotId,
        taskId,
        requestBody,
    }: {
        shotId: string,
        taskId: string,
        requestBody: AdoptVideoEditRequest,
    }): CancelablePromise<ApiResponse_dict_str__str__> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/generation-tasks/shots/{shot_id}/video-edits/{task_id}/adopt',
            path: {
                'shot_id': shotId,
                'task_id': taskId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * 提交已有视频文字编辑任务
     * Bind edit to the shot, require separate consent, preserve source and await manual adoption.
     * @returns ApiResponse_TaskCreated_ Successful Response
     * @throws ApiError
     */
    public static submitShotVideoEditTaskApiV1StudioGenerationTasksShotsShotIdVideoEditsPost({
        shotId,
        requestBody,
    }: {
        shotId: string,
        requestBody: GenerationSubmitRequest,
    }): CancelablePromise<ApiResponse_TaskCreated_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/generation-tasks/shots/{shot_id}/video-edits',
            path: {
                'shot_id': shotId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * 提交镜头分镜帧图片任务
     * 绑定镜头帧槽位后提交图片任务；最终提示词由客户端先经 render API 确认。
     * @returns ApiResponse_TaskCreated_ Successful Response
     * @throws ApiError
     */
    public static submitShotFrameGenerationTaskApiV1StudioGenerationTasksShotsShotIdFramesFrameTypePost({
        shotId,
        frameType,
        requestBody,
    }: {
        shotId: string,
        frameType: ShotFrameType,
        requestBody: GenerationSubmitRequest,
    }): CancelablePromise<ApiResponse_TaskCreated_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/generation-tasks/shots/{shot_id}/frames/{frame_type}',
            path: {
                'shot_id': shotId,
                'frame_type': frameType,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * 提交镜头视频任务
     * 绑定镜头后提交视频任务；视频帧与具名主体媒体的分组直接冻结到快照。
     * @returns ApiResponse_TaskCreated_ Successful Response
     * @throws ApiError
     */
    public static submitShotVideoGenerationTaskApiV1StudioGenerationTasksShotsShotIdVideoPost({
        shotId,
        requestBody,
    }: {
        shotId: string,
        requestBody: GenerationSubmitRequest,
    }): CancelablePromise<ApiResponse_TaskCreated_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/generation-tasks/shots/{shot_id}/video',
            path: {
                'shot_id': shotId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * 提交演员图片任务
     * 绑定演员图片槽位，防止请求体伪造目标或改变图片执行语义。
     * @returns ApiResponse_TaskCreated_ Successful Response
     * @throws ApiError
     */
    public static submitActorImageGenerationTaskApiV1StudioGenerationTasksActorsActorIdSlotsSlotIdTasksPost({
        actorId,
        slotId,
        requestBody,
    }: {
        actorId: string,
        slotId: number,
        requestBody: GenerationSubmitRequest,
    }): CancelablePromise<ApiResponse_TaskCreated_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/generation-tasks/actors/{actor_id}/slots/{slot_id}/tasks',
            path: {
                'actor_id': actorId,
                'slot_id': slotId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * 提交角色图片任务
     * 绑定角色图片槽位，统一交由提交器冻结模型与媒体快照。
     * @returns ApiResponse_TaskCreated_ Successful Response
     * @throws ApiError
     */
    public static submitCharacterImageGenerationTaskApiV1StudioGenerationTasksCharactersCharacterIdSlotsSlotIdTasksPost({
        characterId,
        slotId,
        requestBody,
    }: {
        characterId: string,
        slotId: number,
        requestBody: GenerationSubmitRequest,
    }): CancelablePromise<ApiResponse_TaskCreated_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/generation-tasks/characters/{character_id}/slots/{slot_id}/tasks',
            path: {
                'character_id': characterId,
                'slot_id': slotId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * 提交资产图片任务
     * 绑定道具、场景或服装图片槽位；资产类型仅用于受限路径匹配。
     * @returns ApiResponse_TaskCreated_ Successful Response
     * @throws ApiError
     */
    public static submitAssetImageGenerationTaskApiV1StudioGenerationTasksAssetsAssetTypeAssetIdSlotsSlotIdTasksPost({
        assetType,
        assetId,
        slotId,
        requestBody,
    }: {
        assetType: 'prop' | 'scene' | 'costume',
        assetId: string,
        slotId: number,
        requestBody: GenerationSubmitRequest,
    }): CancelablePromise<ApiResponse_TaskCreated_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/generation-tasks/assets/{asset_type}/{asset_id}/slots/{slot_id}/tasks',
            path: {
                'asset_type': assetType,
                'asset_id': assetId,
                'slot_id': slotId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Restore Quality Revision
     * 免费恢复应用前状态，原预检和优化方案仍保留。
     * @returns ApiResponse_QualityReviewRecord_ Successful Response
     * @throws ApiError
     */
    public static restoreQualityRevisionApiV1StudioGenerationTasksShotsShotIdQualityReviewsTaskIdRestorePost({
        shotId,
        taskId,
    }: {
        shotId: string,
        taskId: string,
    }): CancelablePromise<ApiResponse_QualityReviewRecord_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/generation-tasks/shots/{shot_id}/quality-reviews/{task_id}/restore',
            path: {
                'shot_id': shotId,
                'task_id': taskId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Check Frame Review
     * 免费校验帧图输入，不创建任何模型任务。
     * @returns ApiResponse_dict_ Successful Response
     * @throws ApiError
     */
    public static checkFrameReviewApiV1StudioGenerationTasksShotsShotIdFrameReviewCheckPost({
        shotId,
        requestBody,
    }: {
        shotId: string,
        requestBody: FrameReviewCheckRequest,
    }): CancelablePromise<ApiResponse_dict_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/generation-tasks/shots/{shot_id}/frame-review-check',
            path: {
                'shot_id': shotId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Quality Review Models
     * 返回当前预检模型和已接入的看图能力，不调用模型。
     * @returns ApiResponse_list_dict__ Successful Response
     * @throws ApiError
     */
    public static qualityReviewModelsApiV1StudioGenerationTasksQualityReviewModelsGet(): CancelablePromise<ApiResponse_list_dict__> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/studio/generation-tasks/quality-review-models',
        });
    }
    /**
     * 提交图片实验室统一任务
     * 为图片实验会话创建权威消息和安全快照任务。
     * @returns ApiResponse_ExperimentTaskCreated_ Successful Response
     * @throws ApiError
     */
    public static submitImageLabGenerationTaskApiV1StudioGenerationTasksLabsImageSessionsSessionIdTasksPost({
        sessionId,
        requestBody,
    }: {
        sessionId: string,
        requestBody: GenerationSubmitRequest,
    }): CancelablePromise<ApiResponse_ExperimentTaskCreated_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/generation-tasks/labs/image/sessions/{session_id}/tasks',
            path: {
                'session_id': sessionId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * 提交视频实验室统一任务
     * 为视频实验会话创建权威消息和安全快照任务。
     * @returns ApiResponse_ExperimentTaskCreated_ Successful Response
     * @throws ApiError
     */
    public static submitVideoLabGenerationTaskApiV1StudioGenerationTasksLabsVideoSessionsSessionIdTasksPost({
        sessionId,
        requestBody,
    }: {
        sessionId: string,
        requestBody: GenerationSubmitRequest,
    }): CancelablePromise<ApiResponse_ExperimentTaskCreated_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/generation-tasks/labs/video/sessions/{session_id}/tasks',
            path: {
                'session_id': sessionId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
}
