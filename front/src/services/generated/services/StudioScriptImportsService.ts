/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ApiResponse_list_ScriptImportRead__ } from '../models/ApiResponse_list_ScriptImportRead__';
import type { ApiResponse_ScriptImportCommitResult_ } from '../models/ApiResponse_ScriptImportCommitResult_';
import type { ApiResponse_ScriptImportRead_ } from '../models/ApiResponse_ScriptImportRead_';
import type { ScriptImportCommitRequest } from '../models/ScriptImportCommitRequest';
import type { ScriptImportCreate } from '../models/ScriptImportCreate';
import type { ScriptImportReviewUpdate } from '../models/ScriptImportReviewUpdate';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class StudioScriptImportsService {
    /**
     * Create Script Import Api
     * @returns ApiResponse_ScriptImportRead_ Successful Response
     * @throws ApiError
     */
    public static createScriptImportApiApiV1StudioScriptImportsPost({
        requestBody,
    }: {
        requestBody: ScriptImportCreate,
    }): CancelablePromise<ApiResponse_ScriptImportRead_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/script-imports',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * List Script Imports Api
     * @returns ApiResponse_list_ScriptImportRead__ Successful Response
     * @throws ApiError
     */
    public static listScriptImportsApiApiV1StudioScriptImportsGet({
        projectId,
    }: {
        projectId: string,
    }): CancelablePromise<ApiResponse_list_ScriptImportRead__> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/studio/script-imports',
            query: {
                'project_id': projectId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Get Script Import Api
     * @returns ApiResponse_ScriptImportRead_ Successful Response
     * @throws ApiError
     */
    public static getScriptImportApiApiV1StudioScriptImportsImportIdGet({
        importId,
    }: {
        importId: string,
    }): CancelablePromise<ApiResponse_ScriptImportRead_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/studio/script-imports/{import_id}',
            path: {
                'import_id': importId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Commit Script Import Api
     * @returns ApiResponse_ScriptImportCommitResult_ Successful Response
     * @throws ApiError
     */
    public static commitScriptImportApiApiV1StudioScriptImportsImportIdCommitPost({
        importId,
        requestBody,
    }: {
        importId: string,
        requestBody: ScriptImportCommitRequest,
    }): CancelablePromise<ApiResponse_ScriptImportCommitResult_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/script-imports/{import_id}/commit',
            path: {
                'import_id': importId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Update Script Import Review Api
     * @returns ApiResponse_ScriptImportRead_ Successful Response
     * @throws ApiError
     */
    public static updateScriptImportReviewApiApiV1StudioScriptImportsImportIdReviewPatch({
        importId,
        requestBody,
    }: {
        importId: string,
        requestBody: ScriptImportReviewUpdate,
    }): CancelablePromise<ApiResponse_ScriptImportRead_> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/api/v1/studio/script-imports/{import_id}/review',
            path: {
                'import_id': importId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
}
