/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { VideoSubjectMediaReference } from './VideoSubjectMediaReference';
/**
 * 被检查的图片/视频输入版本；预检文本模型与目标生成模型严格分开。
 */
export type ReviewGenerationContext_Input = {
    shot_id?: (string | null);
    draft_prompt?: (string | null);
    stage?: 'before' | 'after';
    output_file_id?: (string | null);
    source_fingerprint?: (string | null);
    model_revision_id?: (string | null);
    reference_mode?: string;
    subjects?: Array<VideoSubjectMediaReference>;
    image_file_ids?: Array<string>;
    ratio?: (string | null);
    seconds?: (number | null);
    resolution?: (string | null);
    generate_audio?: (boolean | null);
};
