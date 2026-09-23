/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ApiResponse_AppearanceRead_ } from '../models/ApiResponse_AppearanceRead_';
import type { ApiResponse_dict_ } from '../models/ApiResponse_dict_';
import type { ApiResponse_list_AppearanceRead__ } from '../models/ApiResponse_list_AppearanceRead__';
import type { AppearanceCreate } from '../models/AppearanceCreate';
import type { AppearanceSelection } from '../models/AppearanceSelection';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class StudioCharacterAppearancesService {
    /**
     * Get Appearances
     * 读取同角色造型版本。
     * @returns ApiResponse_list_AppearanceRead__ Successful Response
     * @throws ApiError
     */
    public static getAppearancesApiV1StudioCharacterAppearancesCharactersCharacterIdGet({
        characterId,
    }: {
        characterId: string,
    }): CancelablePromise<ApiResponse_list_AppearanceRead__> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/studio/character-appearances/characters/{character_id}',
            path: {
                'character_id': characterId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Post Appearance
     * 保存新版本，不改写旧图或角色。
     * @returns ApiResponse_AppearanceRead_ Successful Response
     * @throws ApiError
     */
    public static postAppearanceApiV1StudioCharacterAppearancesCharactersCharacterIdPost({
        characterId,
        requestBody,
    }: {
        characterId: string,
        requestBody: AppearanceCreate,
    }): CancelablePromise<ApiResponse_AppearanceRead_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/character-appearances/characters/{character_id}',
            path: {
                'character_id': characterId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Put Appearance
     * 更新本镜头选用版本。
     * @returns ApiResponse_dict_ Successful Response
     * @throws ApiError
     */
    public static putAppearanceApiV1StudioCharacterAppearancesShotsShotIdCharactersCharacterIdPut({
        shotId,
        characterId,
        requestBody,
    }: {
        shotId: string,
        characterId: string,
        requestBody: AppearanceSelection,
    }): CancelablePromise<ApiResponse_dict_> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/api/v1/studio/character-appearances/shots/{shot_id}/characters/{character_id}',
            path: {
                'shot_id': shotId,
                'character_id': characterId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
}
