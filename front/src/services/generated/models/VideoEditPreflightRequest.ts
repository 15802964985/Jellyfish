/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { VideoEditMediaInput } from './VideoEditMediaInput';
/**
 * Local-only metadata check; consent to external transfer is not requested here.
 */
export type VideoEditPreflightRequest = {
    model_id: string;
    media: VideoEditMediaInput;
    reference_positions?: Array<number>;
};
