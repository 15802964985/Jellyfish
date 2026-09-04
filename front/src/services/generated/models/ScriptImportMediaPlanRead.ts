/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ScriptImportMediaPlanItem } from './ScriptImportMediaPlanItem';
export type ScriptImportMediaPlanRead = {
    model_id: string;
    model_name: string;
    provider_key: string;
    allowed_ratios?: Array<string>;
    default_ratio?: (string | null);
    supports_text_to_video: boolean;
    supports_first_frame: boolean;
    supports_last_frame: boolean;
    supports_subject_references: boolean;
    items?: Array<ScriptImportMediaPlanItem>;
    warnings?: Array<string>;
};

