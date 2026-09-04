/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ApiResponse_AsyncTaskCreateRead_ } from '../models/ApiResponse_AsyncTaskCreateRead_';
import type { ApiResponse_list_ScriptImportRead__ } from '../models/ApiResponse_list_ScriptImportRead__';
import type { ApiResponse_ScriptImportCommitResult_ } from '../models/ApiResponse_ScriptImportCommitResult_';
import type { ApiResponse_ScriptImportMatchesRead_ } from '../models/ApiResponse_ScriptImportMatchesRead_';
import type { ApiResponse_ScriptImportMediaPlanRead_ } from '../models/ApiResponse_ScriptImportMediaPlanRead_';
import type { ApiResponse_ScriptImportRead_ } from '../models/ApiResponse_ScriptImportRead_';
import type { ScriptImportAnalyzeRequest } from '../models/ScriptImportAnalyzeRequest';
import type { ScriptImportCommitRequest } from '../models/ScriptImportCommitRequest';
import type { ScriptImportCreate } from '../models/ScriptImportCreate';
import type { ScriptImportMediaPlanRequest } from '../models/ScriptImportMediaPlanRequest';
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
     * Get Script Import Matches Api
     * @returns ApiResponse_ScriptImportMatchesRead_ Successful Response
     * @throws ApiError
     */
    public static getScriptImportMatchesApiApiV1StudioScriptImportsImportIdMatchesGet({
        importId,
    }: {
        importId: string,
    }): CancelablePromise<ApiResponse_ScriptImportMatchesRead_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/studio/script-imports/{import_id}/matches',
            path: {
                'import_id': importId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Plan Script Import Media Api
     * @returns ApiResponse_ScriptImportMediaPlanRead_ Successful Response
     * @throws ApiError
     */
    public static planScriptImportMediaApiApiV1StudioScriptImportsImportIdPlanMediaPost({
        importId,
        requestBody,
    }: {
        importId: string,
        requestBody: ScriptImportMediaPlanRequest,
    }): CancelablePromise<ApiResponse_ScriptImportMediaPlanRead_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/script-imports/{import_id}/plan-media',
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
    /**
     * Analyze Script Import Api
     * Explicitly opt in to sending the parsed script to the configured text model.
     * @returns ApiResponse_AsyncTaskCreateRead_ Successful Response
     * @throws ApiError
     */
    public static analyzeScriptImportApiApiV1StudioScriptImportsImportIdAnalyzePost({
        importId,
        requestBody,
    }: {
        importId: string,
        requestBody: ScriptImportAnalyzeRequest,
    }): CancelablePromise<ApiResponse_AsyncTaskCreateRead_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/script-imports/{import_id}/analyze',
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
