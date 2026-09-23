/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { VideoSubjectMediaReference } from './VideoSubjectMediaReference';
/**
 * 镜头视频渲染允许编辑的提示词、模板与参考帧。
 */
export type ShotVideoPromptRenderBody = {
    reference_mode: 'first' | 'last' | 'key' | 'first_last' | 'first_last_key' | 'text_only' | 'subjects';
    prompt?: (string | null);
    subjects?: Array<VideoSubjectMediaReference>;
    image_file_ids?: Array<string>;
    template_id?: (string | null);
    /**
     * 预览所用视频模型版本；提前编译同一版本的厂商提示词规范
     */
    model_revision_id?: (string | null);
};
