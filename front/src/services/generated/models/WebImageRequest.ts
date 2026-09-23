/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ImageEditRegion } from './ImageEditRegion';
/**
 * Freeze an image slot independently from shot video versions.
 */
export type WebImageRequest = {
    account_id?: (string | null);
    platform?: 'doubao' | 'jimeng' | 'kling' | 'wanxiang' | 'yuanbao' | 'hailuo' | 'zhipu';
    execution_mode?: 'browser' | 'manual';
    requested_model?: string;
    request_id: string;
    prompt: string;
    reference_file_ids?: Array<string>;
    external_transfer_confirmed: boolean;
    target_type: 'actor' | 'character' | 'scene' | 'prop' | 'costume' | 'frame' | 'lab_image';
    entity_id: string;
    edit_region?: (ImageEditRegion | null);
    slot_id?: (number | null);
    expected_version: number;
};
