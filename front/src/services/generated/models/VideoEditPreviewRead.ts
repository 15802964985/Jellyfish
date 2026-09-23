/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { VideoEditOptions } from './VideoEditOptions';
/**
 * Free local preflight, chosen controls and conservative cost share the submit contract.
 */
export type VideoEditPreviewRead = {
    revision_id: string;
    seconds: number;
    width: number;
    height: number;
    has_audio: boolean;
    options: VideoEditOptions;
    estimate: Record<string, any>;
    warnings?: Array<string>;
};
