/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Body_handoff_result_api_v1_studio_web_generation_tasks__task_id__handoff_result_post } from '../models/Body_handoff_result_api_v1_studio_web_generation_tasks__task_id__handoff_result_post';
import type { Body_official_export_api_v1_studio_web_generation_tasks__task_id__official_export_post } from '../models/Body_official_export_api_v1_studio_web_generation_tasks__task_id__official_export_post';
import type { Body_result_api_v1_studio_web_generation_tasks__task_id__result_post } from '../models/Body_result_api_v1_studio_web_generation_tasks__task_id__result_post';
import type { Body_results_api_v1_studio_web_generation_tasks__task_id__results_post } from '../models/Body_results_api_v1_studio_web_generation_tasks__task_id__results_post';
import type { WebAccountHeartbeat } from '../models/WebAccountHeartbeat';
import type { WebAccountRead } from '../models/WebAccountRead';
import type { WebAccountWrite } from '../models/WebAccountWrite';
import type { WebBatchRequest } from '../models/WebBatchRequest';
import type { WebCatalogRead } from '../models/WebCatalogRead';
import type { WebCatalogWrite } from '../models/WebCatalogWrite';
import type { WebDesktopCommand } from '../models/WebDesktopCommand';
import type { WebDesktopLaunch } from '../models/WebDesktopLaunch';
import type { WebDesktopPoll } from '../models/WebDesktopPoll';
import type { WebDesktopStatus } from '../models/WebDesktopStatus';
import type { WebExecutionRead } from '../models/WebExecutionRead';
import type { WebExportAdoption } from '../models/WebExportAdoption';
import type { WebHandoffProgress } from '../models/WebHandoffProgress';
import type { WebImageRequest } from '../models/WebImageRequest';
import type { WebRecoveryRequest } from '../models/WebRecoveryRequest';
import type { WebRunnerUpdate } from '../models/WebRunnerUpdate';
import type { WebTaskRead } from '../models/WebTaskRead';
import type { WebUnsentRelease } from '../models/WebUnsentRelease';
import type { WebVideoRequest } from '../models/WebVideoRequest';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class StudioWebGenerationService {
    /**
     * Recover Original
     * Resume the original paused task explicitly without creating another generation.
     * @returns WebTaskRead Successful Response
     * @throws ApiError
     */
    public static recoverOriginalApiV1StudioWebGenerationTasksTaskIdRecoverPost({
        taskId,
        requestBody,
    }: {
        taskId: string,
        requestBody: WebRecoveryRequest,
    }): CancelablePromise<WebTaskRead> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/web-generation/tasks/{task_id}/recover',
            path: {
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
     * Submit Image
     * Accept an explicit browser image request without waiting for generation.
     * @returns WebTaskRead Successful Response
     * @throws ApiError
     */
    public static submitImageApiV1StudioWebGenerationImagesPost({
        requestBody,
    }: {
        requestBody: WebImageRequest,
    }): CancelablePromise<WebTaskRead> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/web-generation/images',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Submit Video
     * Accept a frozen browser video job; no model call runs inside the HTTP request.
     * @returns WebTaskRead Successful Response
     * @throws ApiError
     */
    public static submitVideoApiV1StudioWebGenerationVideosPost({
        requestBody,
    }: {
        requestBody: WebVideoRequest,
    }): CancelablePromise<WebTaskRead> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/web-generation/videos',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Claim
     * Let the local executor claim one persisted pending task.
     * @returns any Successful Response
     * @throws ApiError
     */
    public static claimApiV1StudioWebGenerationRunnerClaimPost({
        xWebAccount,
        xClaimToken,
        xWebModality = 'image',
        authorization = '',
    }: {
        xWebAccount: string,
        xClaimToken: string,
        xWebModality?: 'image' | 'video' | 'any',
        authorization?: string,
    }): CancelablePromise<(Record<string, any> | null)> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/web-generation/runner/claim',
            headers: {
                'x-web-account': xWebAccount,
                'x-claim-token': xClaimToken,
                'x-web-modality': xWebModality,
                'authorization': authorization,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Read
     * Restore the browser task's status after navigation or refresh.
     * @returns WebTaskRead Successful Response
     * @throws ApiError
     */
    public static readApiV1StudioWebGenerationTasksTaskIdGet({
        taskId,
    }: {
        taskId: string,
    }): CancelablePromise<WebTaskRead> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/studio/web-generation/tasks/{task_id}',
            path: {
                'task_id': taskId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Report
     * Record a platform receipt or request user intervention.
     * @returns WebTaskRead Successful Response
     * @throws ApiError
     */
    public static reportApiV1StudioWebGenerationTasksTaskIdStagePost({
        taskId,
        xTaskToken,
        requestBody,
        authorization = '',
    }: {
        taskId: string,
        xTaskToken: string,
        requestBody: WebRunnerUpdate,
        authorization?: string,
    }): CancelablePromise<WebTaskRead> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/web-generation/tasks/{task_id}/stage',
            path: {
                'task_id': taskId,
            },
            headers: {
                'x-task-token': xTaskToken,
                'authorization': authorization,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Result
     * Archive the downloaded image and safely publish to its frozen target.
     * @returns WebTaskRead Successful Response
     * @throws ApiError
     */
    public static resultApiV1StudioWebGenerationTasksTaskIdResultPost({
        taskId,
        xTaskToken,
        formData,
        authorization = '',
    }: {
        taskId: string,
        xTaskToken: string,
        formData: Body_result_api_v1_studio_web_generation_tasks__task_id__result_post,
        authorization?: string,
    }): CancelablePromise<WebTaskRead> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/web-generation/tasks/{task_id}/result',
            path: {
                'task_id': taskId,
            },
            headers: {
                'x-task-token': xTaskToken,
                'authorization': authorization,
            },
            formData: formData,
            mediaType: 'multipart/form-data',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Results
     * Accept all originals from the same task receipt in one transactional publication.
     * @returns WebTaskRead Successful Response
     * @throws ApiError
     */
    public static resultsApiV1StudioWebGenerationTasksTaskIdResultsPost({
        taskId,
        xTaskToken,
        formData,
        authorization = '',
    }: {
        taskId: string,
        xTaskToken: string,
        formData: Body_results_api_v1_studio_web_generation_tasks__task_id__results_post,
        authorization?: string,
    }): CancelablePromise<WebTaskRead> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/web-generation/tasks/{task_id}/results',
            path: {
                'task_id': taskId,
            },
            headers: {
                'x-task-token': xTaskToken,
                'authorization': authorization,
            },
            formData: formData,
            mediaType: 'multipart/form-data',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Accounts
     * Account management uses safe aliases and actual runner availability.
     * @returns WebAccountRead Successful Response
     * @throws ApiError
     */
    public static accountsApiV1StudioWebGenerationAccountsGet(): CancelablePromise<Array<WebAccountRead>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/studio/web-generation/accounts',
        });
    }
    /**
     * Create Account
     * Create an unpaired identity; this does not sign in or purchase anything.
     * @returns WebAccountRead Successful Response
     * @throws ApiError
     */
    public static createAccountApiV1StudioWebGenerationAccountsPost({
        requestBody,
    }: {
        requestBody: WebAccountWrite,
    }): CancelablePromise<WebAccountRead> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/web-generation/accounts',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Update Account
     * Enable/disable future dispatch without reassigning active tasks.
     * @returns WebAccountRead Successful Response
     * @throws ApiError
     */
    public static updateAccountApiV1StudioWebGenerationAccountsAccountIdPatch({
        accountId,
        requestBody,
    }: {
        accountId: string,
        requestBody: WebAccountWrite,
    }): CancelablePromise<WebAccountRead> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/api/v1/studio/web-generation/accounts/{account_id}',
            path: {
                'account_id': accountId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Account Heartbeat
     * Only the trusted local worker can attest login and exact supported model.
     * @returns WebAccountRead Successful Response
     * @throws ApiError
     */
    public static accountHeartbeatApiV1StudioWebGenerationAccountsAccountIdHeartbeatPost({
        accountId,
        requestBody,
        authorization = '',
    }: {
        accountId: string,
        requestBody: WebAccountHeartbeat,
        authorization?: string,
    }): CancelablePromise<WebAccountRead> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/web-generation/accounts/{account_id}/heartbeat',
            path: {
                'account_id': accountId,
            },
            headers: {
                'authorization': authorization,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Resume
     * Restore the same binding using its locally persisted task credential.
     * @returns any Successful Response
     * @throws ApiError
     */
    public static resumeApiV1StudioWebGenerationTasksTaskIdResumePost({
        taskId,
        xTaskToken,
        authorization = '',
    }: {
        taskId: string,
        xTaskToken: string,
        authorization?: string,
    }): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/web-generation/tasks/{task_id}/resume',
            path: {
                'task_id': taskId,
            },
            headers: {
                'x-task-token': xTaskToken,
                'authorization': authorization,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Reference
     * Transfer frozen media to the Windows worker without exposing storage keys.
     * @returns any Successful Response
     * @throws ApiError
     */
    public static referenceApiV1StudioWebGenerationTasksTaskIdReferencesOrdinalGet({
        taskId,
        ordinal,
        xTaskToken,
        authorization = '',
    }: {
        taskId: string,
        ordinal: number,
        xTaskToken: string,
        authorization?: string,
    }): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/studio/web-generation/tasks/{task_id}/references/{ordinal}',
            path: {
                'task_id': taskId,
                'ordinal': ordinal,
            },
            headers: {
                'x-task-token': xTaskToken,
                'authorization': authorization,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Target
     * Read the current version immediately before freezing a web generation request.
     * @returns any Successful Response
     * @throws ApiError
     */
    public static targetApiV1StudioWebGenerationTargetsTargetTypeEntityIdSlotIdGet({
        targetType,
        entityId,
        slotId,
    }: {
        targetType: string,
        entityId: string,
        slotId: number,
    }): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/studio/web-generation/targets/{target_type}/{entity_id}/{slot_id}',
            path: {
                'target_type': targetType,
                'entity_id': entityId,
                'slot_id': slotId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Platforms
     * Expose channel-specific verification states instead of implying all accounts can run.
     * @returns any Successful Response
     * @throws ApiError
     */
    public static platformsApiV1StudioWebGenerationPlatformsGet(): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/studio/web-generation/platforms',
        });
    }
    /**
     * Handoff Image
     * Prepare a frozen manual task; this endpoint never operates a platform website.
     * @returns WebTaskRead Successful Response
     * @throws ApiError
     */
    public static handoffImageApiV1StudioWebGenerationHandoffImagesPost({
        requestBody,
    }: {
        requestBody: WebImageRequest,
    }): CancelablePromise<WebTaskRead> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/web-generation/handoff/images',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Handoff Video
     * Prepare a manual video handoff independently of the unverified browser video adapter.
     * @returns WebTaskRead Successful Response
     * @throws ApiError
     */
    public static handoffVideoApiV1StudioWebGenerationHandoffVideosPost({
        requestBody,
    }: {
        requestBody: WebVideoRequest,
    }): CancelablePromise<WebTaskRead> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/web-generation/handoff/videos',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Handoff Jobs
     * List recent recoverable handoffs without loading their prompts into task center.
     * @returns any Successful Response
     * @throws ApiError
     */
    public static handoffJobsApiV1StudioWebGenerationHandoffJobsGet({
        targetType,
        entityId,
        slotId,
    }: {
        targetType?: (string | null),
        entityId?: (string | null),
        slotId?: (number | null),
    }): CancelablePromise<Array<Record<string, any>>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/studio/web-generation/handoff/jobs',
            query: {
                'target_type': targetType,
                'entity_id': entityId,
                'slot_id': slotId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Handoff Manifest
     * Expose only frozen business inputs and safe account aliases.
     * @returns any Successful Response
     * @throws ApiError
     */
    public static handoffManifestApiV1StudioWebGenerationTasksTaskIdHandoffGet({
        taskId,
    }: {
        taskId: string,
    }): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/studio/web-generation/tasks/{task_id}/handoff',
            path: {
                'task_id': taskId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Handoff Progress
     * Persist a manual platform submission without fabricating success.
     * @returns WebTaskRead Successful Response
     * @throws ApiError
     */
    public static handoffProgressApiV1StudioWebGenerationTasksTaskIdHandoffProgressPost({
        taskId,
        requestBody,
    }: {
        taskId: string,
        requestBody: WebHandoffProgress,
    }): CancelablePromise<WebTaskRead> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/web-generation/tasks/{task_id}/handoff-progress',
            path: {
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
     * Handoff Result
     * Validate the declared receipt and archive the original media in one transaction.
     * @returns WebTaskRead Successful Response
     * @throws ApiError
     */
    public static handoffResultApiV1StudioWebGenerationTasksTaskIdHandoffResultPost({
        taskId,
        formData,
    }: {
        taskId: string,
        formData: Body_handoff_result_api_v1_studio_web_generation_tasks__task_id__handoff_result_post,
    }): CancelablePromise<WebTaskRead> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/web-generation/tasks/{task_id}/handoff-result',
            path: {
                'task_id': taskId,
            },
            formData: formData,
            mediaType: 'multipart/form-data',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Release Unsent
     * Release only a manually confirmed unsent handoff and its account reservation.
     * @returns WebTaskRead Successful Response
     * @throws ApiError
     */
    public static releaseUnsentApiV1StudioWebGenerationTasksTaskIdReleaseUnsentPost({
        taskId,
        requestBody,
    }: {
        taskId: string,
        requestBody: WebUnsentRelease,
    }): CancelablePromise<WebTaskRead> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/web-generation/tasks/{task_id}/release-unsent',
            path: {
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
     * Official Export
     * Import an official clean download while preserving the originally generated file.
     * @returns any Successful Response
     * @throws ApiError
     */
    public static officialExportApiV1StudioWebGenerationTasksTaskIdOfficialExportPost({
        taskId,
        formData,
    }: {
        taskId: string,
        formData: Body_official_export_api_v1_studio_web_generation_tasks__task_id__official_export_post,
    }): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/web-generation/tasks/{task_id}/official-export',
            path: {
                'task_id': taskId,
            },
            formData: formData,
            mediaType: 'multipart/form-data',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Web Artifacts
     * Show original and official-export variants in the business workbench.
     * @returns any Successful Response
     * @throws ApiError
     */
    public static webArtifactsApiV1StudioWebGenerationTasksTaskIdArtifactsGet({
        taskId,
    }: {
        taskId: string,
    }): CancelablePromise<Array<Record<string, any>>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/studio/web-generation/tasks/{task_id}/artifacts',
            path: {
                'task_id': taskId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Handoff Reference
     * Download version-checked frozen references; never serve a silently changed input.
     * @returns any Successful Response
     * @throws ApiError
     */
    public static handoffReferenceApiV1StudioWebGenerationTasksTaskIdHandoffReferencesOrdinalGet({
        taskId,
        ordinal,
        download = false,
    }: {
        taskId: string,
        ordinal: number,
        download?: boolean,
    }): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/studio/web-generation/tasks/{task_id}/handoff-references/{ordinal}',
            path: {
                'task_id': taskId,
                'ordinal': ordinal,
            },
            query: {
                'download': download,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Adopt Web Export
     * Explicitly use an official export only if its own original is still selected.
     * @returns any Successful Response
     * @throws ApiError
     */
    public static adoptWebExportApiV1StudioWebGenerationTasksTaskIdArtifactsArtifactIdAdoptPost({
        taskId,
        artifactId,
        requestBody,
    }: {
        taskId: string,
        artifactId: string,
        requestBody: WebExportAdoption,
    }): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/web-generation/tasks/{task_id}/artifacts/{artifact_id}/adopt',
            path: {
                'task_id': taskId,
                'artifact_id': artifactId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Platform Models
     * Return website model choices with provenance separately from API provider models.
     * @returns WebCatalogRead Successful Response
     * @throws ApiError
     */
    public static platformModelsApiV1StudioWebGenerationPlatformsPlatformModelsModalityGet({
        platform,
        modality,
    }: {
        platform: string,
        modality: string,
    }): CancelablePromise<WebCatalogRead> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/studio/web-generation/platforms/{platform}/models/{modality}',
            path: {
                'platform': platform,
                'modality': modality,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Save Platform Models
     * Persist explicit operator policy without altering website or API accounts.
     * @returns WebCatalogRead Successful Response
     * @throws ApiError
     */
    public static savePlatformModelsApiV1StudioWebGenerationPlatformsPlatformModelsModalityPut({
        platform,
        modality,
        requestBody,
    }: {
        platform: string,
        modality: 'image' | 'video',
        requestBody: WebCatalogWrite,
    }): CancelablePromise<WebCatalogRead> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/api/v1/studio/web-generation/platforms/{platform}/models/{modality}',
            path: {
                'platform': platform,
                'modality': modality,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Browser Batch
     * Queue each frozen browser item atomically; mixed execution modes cannot leak into the queue.
     * @returns WebTaskRead Successful Response
     * @throws ApiError
     */
    public static browserBatchApiV1StudioWebGenerationBatchPost({
        requestBody,
    }: {
        requestBody: WebBatchRequest,
    }): CancelablePromise<Array<WebTaskRead>> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/web-generation/batch',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Handoff Batch
     * Accept one transaction; each result remains bound to its own target and request ID.
     * @returns WebTaskRead Successful Response
     * @throws ApiError
     */
    public static handoffBatchApiV1StudioWebGenerationHandoffBatchPost({
        requestBody,
    }: {
        requestBody: WebBatchRequest,
    }): CancelablePromise<Array<WebTaskRead>> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/web-generation/handoff/batch',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Desktop Status
     * Display helper status; fetching it never opens a browser.
     * @returns WebDesktopStatus Successful Response
     * @throws ApiError
     */
    public static desktopStatusApiV1StudioWebGenerationDesktopStatusGet(): CancelablePromise<WebDesktopStatus> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/studio/web-generation/desktop/status',
        });
    }
    /**
     * Desktop Launch
     * Queue an explicit account operation and return immediately.
     * @returns WebDesktopCommand Successful Response
     * @throws ApiError
     */
    public static desktopLaunchApiV1StudioWebGenerationAccountsAccountIdDesktopPost({
        accountId,
        requestBody,
    }: {
        accountId: string,
        requestBody: WebDesktopLaunch,
    }): CancelablePromise<WebDesktopCommand> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/web-generation/accounts/{account_id}/desktop',
            path: {
                'account_id': accountId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Desktop Poll
     * Authenticated Windows helper pulls commands; no inbound host port is exposed.
     * @returns WebDesktopCommand Successful Response
     * @throws ApiError
     */
    public static desktopPollApiV1StudioWebGenerationDesktopPollPost({
        requestBody,
        authorization = '',
    }: {
        requestBody: WebDesktopPoll,
        authorization?: string,
    }): CancelablePromise<Array<WebDesktopCommand>> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/web-generation/desktop/poll',
            headers: {
                'authorization': authorization,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Execution Status
     * Return live reasons for a disabled executor without launching or generating.
     * @returns WebExecutionRead Successful Response
     * @throws ApiError
     */
    public static executionStatusApiV1StudioWebGenerationExecutionStatusGet({
        platform,
        modality,
        model = '',
        accountId,
        batch = false,
        localEdit = false,
        referenceMode,
        durationSeconds,
        aspectRatio,
        resolution,
        sourceVideo = false,
    }: {
        platform: string,
        modality: 'image' | 'video',
        model?: string,
        accountId?: (string | null),
        batch?: boolean,
        localEdit?: boolean,
        referenceMode?: (string | null),
        durationSeconds?: (number | null),
        aspectRatio?: (string | null),
        resolution?: (string | null),
        sourceVideo?: boolean,
    }): CancelablePromise<WebExecutionRead> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/studio/web-generation/execution-status',
            query: {
                'platform': platform,
                'modality': modality,
                'model': model,
                'account_id': accountId,
                'batch': batch,
                'local_edit': localEdit,
                'reference_mode': referenceMode,
                'duration_seconds': durationSeconds,
                'aspect_ratio': aspectRatio,
                'resolution': resolution,
                'source_video': sourceVideo,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
}
