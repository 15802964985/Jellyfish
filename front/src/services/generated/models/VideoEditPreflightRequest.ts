/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { VideoEditMediaInput } from './VideoEditMediaInput';
import type { VideoEditOptions } from './VideoEditOptions';
/**
 * Free local validation with editing-specific options and immutable model identity.
 */
export type VideoEditPreflightRequest = {
    model_id: string;
    media: VideoEditMediaInput;
    reference_positions?: Array<number>;
    options?: VideoEditOptions;
    keep_audio?: boolean;
    expected_revision_id?: (string | null);
};
