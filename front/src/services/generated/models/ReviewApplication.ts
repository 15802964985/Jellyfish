/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ReviewGenerationContext_Output } from './ReviewGenerationContext_Output';
/**
 * 明确应用到生成草稿的持久记录；不等同已生成视频。
 */
export type ReviewApplication = {
    prompt: string;
    before_prompt: string;
    image_file_ids: Array<string>;
    generation_context?: (ReviewGenerationContext_Output | null);
    applied_at: string;
    active?: boolean;
};
