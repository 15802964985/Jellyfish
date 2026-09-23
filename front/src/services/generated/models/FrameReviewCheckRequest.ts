/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ReviewGenerationContext_Input } from './ReviewGenerationContext_Input';
/**
 * 免费本地检查仅接受当前帧输入，不创建任务或调用供应商。
 */
export type FrameReviewCheckRequest = {
    scope: 'first' | 'key' | 'last';
    prompt?: string;
    generation_context: ReviewGenerationContext_Input;
};
