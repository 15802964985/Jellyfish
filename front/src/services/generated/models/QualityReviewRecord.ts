/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { PromptRevisionResult } from './PromptRevisionResult';
import type { ReviewApplication } from './ReviewApplication';
import type { ReviewGenerationContext_Output } from './ReviewGenerationContext_Output';
/**
 * 只返回业务所需字段，禁止直接外传凭据、内部端点或完整任务payload。
 */
export type QualityReviewRecord = {
    task_id: string;
    status: string;
    created_at: string;
    action: string;
    scope: string;
    generation_context?: (ReviewGenerationContext_Output | null);
    prompt: string;
    image_file_ids: Array<string>;
    model_id?: (string | null);
    model_name?: string;
    generation_model_name?: string;
    source_task_id?: (string | null);
    reference_report_task_id?: (string | null);
    text?: string;
    error?: string;
    revision?: (PromptRevisionResult | null);
    application?: (ReviewApplication | null);
    source_fingerprint?: (string | null);
    optimization_status?: (string | null);
    optimization_task_id?: (string | null);
};
