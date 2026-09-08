/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { MediaReference } from './MediaReference';
/**
 * Source video and optional images are editing inputs, never frame/subject substitutes.
 */
export type VideoEditMediaInput = {
    source: MediaReference;
    references?: Array<MediaReference>;
};
