/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * One configured model with an explicit exclusion reason and its executable controls.
 */
export type VideoEditModelRead = {
    model_id: string;
    revision_id?: (string | null);
    provider: string;
    provider_name: string;
    model_name: string;
    available: boolean;
    reason?: string;
    resolutions?: Array<string>;
    default_resolution?: (string | null);
    durations?: Array<number>;
    default_seconds?: (number | null);
    max_images?: number;
    timed_images?: boolean;
    source_label?: string;
    image_label?: string;
    instructions?: string;
    source_url?: string;
};
