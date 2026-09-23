/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { WebSubjectGroup } from './WebSubjectGroup';
/**
 * Web video input carries explicit reference roles and actual chosen specifications.
 */
export type WebVideoRequest = {
    account_id?: (string | null);
    platform?: 'doubao' | 'jimeng' | 'kling' | 'wanxiang' | 'yuanbao' | 'hailuo' | 'zhipu';
    execution_mode?: 'browser' | 'manual';
    requested_model: string;
    request_id: string;
    prompt: string;
    reference_file_ids?: Array<string>;
    external_transfer_confirmed: boolean;
    target_type?: 'shot' | 'lab_video' | 'shot_edit';
    entity_id: string;
    expected_version: number;
    duration_seconds: number;
    aspect_ratio: string;
    resolution?: (string | null);
    subject_groups?: Array<WebSubjectGroup>;
    source_video_file_id?: (string | null);
    preserve_instructions?: string;
    keep_audio?: boolean;
    reference_mode: 'text' | 'first_frame' | 'first_last_frames' | 'reference_images' | 'subjects';
};
