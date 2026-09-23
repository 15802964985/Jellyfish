/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ReviewGenerationContext_Input } from './ReviewGenerationContext_Input';
/**
 * 显式提交一次预检或基于已保存建议调整，不因读取历史产生模型调用。
 */
export type QualityReviewRequest = {
    model_id: string;
    prompt: string;
    external_and_billing_confirmed: boolean;
    retry_request_id?: (string | null);
    image_file_ids?: Array<string>;
    generation_context?: (ReviewGenerationContext_Input | null);
    scope?: 'video' | 'first' | 'key' | 'last';
    action?: 'review' | 'revise' | 'review_and_revise';
    source_task_id?: (string | null);
    reference_report_task_id?: (string | null);
    user_constraints?: string;
};
