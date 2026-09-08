/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ApiResponse_AssetFileLinkRead_ } from '../models/ApiResponse_AssetFileLinkRead_';
import type { ApiResponse_AudioAssetRead_ } from '../models/ApiResponse_AudioAssetRead_';
import type { ApiResponse_list_AssetFileLinkRead__ } from '../models/ApiResponse_list_AssetFileLinkRead__';
import type { ApiResponse_list_ShotAudioTrackRead__ } from '../models/ApiResponse_list_ShotAudioTrackRead__';
import type { ApiResponse_NoneType_ } from '../models/ApiResponse_NoneType_';
import type { ApiResponse_PaginatedData_AudioAssetRead__ } from '../models/ApiResponse_PaginatedData_AudioAssetRead__';
import type { ApiResponse_ShotAudioTrackRead_ } from '../models/ApiResponse_ShotAudioTrackRead_';
import type { ApiResponse_ShotTtsTaskRead_ } from '../models/ApiResponse_ShotTtsTaskRead_';
import type { AssetFileLinkCreate } from '../models/AssetFileLinkCreate';
import type { AssetFileLinkUpdate } from '../models/AssetFileLinkUpdate';
import type { AudioAssetCreate } from '../models/AudioAssetCreate';
import type { AudioAssetUpdate } from '../models/AudioAssetUpdate';
import type { ShotAudioTrackCreate } from '../models/ShotAudioTrackCreate';
import type { ShotAudioTrackUpdate } from '../models/ShotAudioTrackUpdate';
import type { ShotTtsTaskCreate } from '../models/ShotTtsTaskCreate';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class StudioMediaAssetsService {
    /**
     * 使用默认或指定语音模型生成镜头配音
     * 校验请求并创建进入任务中心的异步配音任务。
     * @returns ApiResponse_ShotTtsTaskRead_ Successful Response
     * @throws ApiError
     */
    public static createShotTtsTaskApiApiV1StudioMediaAssetsShotsShotIdTtsTasksPost({
        shotId,
        requestBody,
    }: {
        shotId: string,
        requestBody: ShotTtsTaskCreate,
    }): CancelablePromise<ApiResponse_ShotTtsTaskRead_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/media-assets/shots/{shot_id}/tts-tasks',
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
     * 列出资产的可选参考素材
     * @returns ApiResponse_list_AssetFileLinkRead__ Successful Response
     * @throws ApiError
     */
    public static listAssetFilesApiApiV1StudioMediaAssetsAssetFilesEntityTypeEntityIdGet({
        entityType,
        entityId,
        enabledOnly = false,
    }: {
        entityType: string,
        entityId: string,
        enabledOnly?: boolean,
    }): CancelablePromise<ApiResponse_list_AssetFileLinkRead__> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/studio/media-assets/asset-files/{entity_type}/{entity_id}',
            path: {
                'entity_type': entityType,
                'entity_id': entityId,
            },
            query: {
                'enabled_only': enabledOnly,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * 把文件关联为资产参考素材
     * @returns ApiResponse_AssetFileLinkRead_ Successful Response
     * @throws ApiError
     */
    public static createAssetFileApiApiV1StudioMediaAssetsAssetFilesEntityTypeEntityIdPost({
        entityType,
        entityId,
        requestBody,
    }: {
        entityType: string,
        entityId: string,
        requestBody: AssetFileLinkCreate,
    }): CancelablePromise<ApiResponse_AssetFileLinkRead_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/media-assets/asset-files/{entity_type}/{entity_id}',
            path: {
                'entity_type': entityType,
                'entity_id': entityId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * 更新资产参考素材关系
     * @returns ApiResponse_AssetFileLinkRead_ Successful Response
     * @throws ApiError
     */
    public static updateAssetFileApiApiV1StudioMediaAssetsAssetFilesLinkIdPatch({
        linkId,
        requestBody,
    }: {
        linkId: number,
        requestBody: AssetFileLinkUpdate,
    }): CancelablePromise<ApiResponse_AssetFileLinkRead_> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/api/v1/studio/media-assets/asset-files/{link_id}',
            path: {
                'link_id': linkId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * 解除资产参考素材关系
     * @returns ApiResponse_NoneType_ Successful Response
     * @throws ApiError
     */
    public static deleteAssetFileApiApiV1StudioMediaAssetsAssetFilesLinkIdDelete({
        linkId,
    }: {
        linkId: number,
    }): CancelablePromise<ApiResponse_NoneType_> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/api/v1/studio/media-assets/asset-files/{link_id}',
            path: {
                'link_id': linkId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * 配音音效资产列表（分页）
     * @returns ApiResponse_PaginatedData_AudioAssetRead__ Successful Response
     * @throws ApiError
     */
    public static listAudioAssetsApiApiV1StudioMediaAssetsAudioAssetsGet({
        q,
        category,
        page = 1,
        pageSize = 12,
    }: {
        q?: (string | null),
        category?: (string | null),
        page?: number,
        pageSize?: number,
    }): CancelablePromise<ApiResponse_PaginatedData_AudioAssetRead__> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/studio/media-assets/audio-assets',
            query: {
                'q': q,
                'category': category,
                'page': page,
                'page_size': pageSize,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * 创建配音音效资产
     * @returns ApiResponse_AudioAssetRead_ Successful Response
     * @throws ApiError
     */
    public static createAudioAssetApiApiV1StudioMediaAssetsAudioAssetsPost({
        requestBody,
    }: {
        requestBody: AudioAssetCreate,
    }): CancelablePromise<ApiResponse_AudioAssetRead_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/media-assets/audio-assets',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * 更新配音音效资产
     * @returns ApiResponse_AudioAssetRead_ Successful Response
     * @throws ApiError
     */
    public static updateAudioAssetApiApiV1StudioMediaAssetsAudioAssetsAudioAssetIdPatch({
        audioAssetId,
        requestBody,
    }: {
        audioAssetId: string,
        requestBody: AudioAssetUpdate,
    }): CancelablePromise<ApiResponse_AudioAssetRead_> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/api/v1/studio/media-assets/audio-assets/{audio_asset_id}',
            path: {
                'audio_asset_id': audioAssetId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * 删除未使用的配音音效资产
     * @returns ApiResponse_NoneType_ Successful Response
     * @throws ApiError
     */
    public static deleteAudioAssetApiApiV1StudioMediaAssetsAudioAssetsAudioAssetIdDelete({
        audioAssetId,
    }: {
        audioAssetId: string,
    }): CancelablePromise<ApiResponse_NoneType_> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/api/v1/studio/media-assets/audio-assets/{audio_asset_id}',
            path: {
                'audio_asset_id': audioAssetId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * 列出镜头音轨
     * @returns ApiResponse_list_ShotAudioTrackRead__ Successful Response
     * @throws ApiError
     */
    public static listShotAudioTracksApiApiV1StudioMediaAssetsShotsShotIdAudioTracksGet({
        shotId,
    }: {
        shotId: string,
    }): CancelablePromise<ApiResponse_list_ShotAudioTrackRead__> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/studio/media-assets/shots/{shot_id}/audio-tracks',
            path: {
                'shot_id': shotId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * 向镜头添加可选音轨
     * @returns ApiResponse_ShotAudioTrackRead_ Successful Response
     * @throws ApiError
     */
    public static createShotAudioTrackApiApiV1StudioMediaAssetsShotsShotIdAudioTracksPost({
        shotId,
        requestBody,
    }: {
        shotId: string,
        requestBody: ShotAudioTrackCreate,
    }): CancelablePromise<ApiResponse_ShotAudioTrackRead_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/media-assets/shots/{shot_id}/audio-tracks',
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
     * 调整镜头音轨
     * @returns ApiResponse_ShotAudioTrackRead_ Successful Response
     * @throws ApiError
     */
    public static updateShotAudioTrackApiApiV1StudioMediaAssetsShotAudioTracksTrackIdPatch({
        trackId,
        requestBody,
    }: {
        trackId: number,
        requestBody: ShotAudioTrackUpdate,
    }): CancelablePromise<ApiResponse_ShotAudioTrackRead_> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/api/v1/studio/media-assets/shot-audio-tracks/{track_id}',
            path: {
                'track_id': trackId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * 移除镜头音轨
     * @returns ApiResponse_NoneType_ Successful Response
     * @throws ApiError
     */
    public static deleteShotAudioTrackApiApiV1StudioMediaAssetsShotAudioTracksTrackIdDelete({
        trackId,
    }: {
        trackId: number,
    }): CancelablePromise<ApiResponse_NoneType_> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/api/v1/studio/media-assets/shot-audio-tracks/{track_id}',
            path: {
                'track_id': trackId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
}
