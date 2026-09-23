/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ReviewGenerationContext_Input } from './ReviewGenerationContext_Input';
/**
 * 记录用户应用的具体文本与参考上下文，不自动生成媒体。
 */
export type ApplyReviewRevisionRequest = {
    prompt: string;
    generation_context: ReviewGenerationContext_Input;
    before_prompt: string;
    image_file_ids?: Array<string>;
};
