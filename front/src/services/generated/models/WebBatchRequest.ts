/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { WebImageRequest } from './WebImageRequest';
import type { WebVideoRequest } from './WebVideoRequest';
/**
 * Freeze independently identifiable business tasks in one atomic handoff batch.
 */
export type WebBatchRequest = {
    items: Array<(WebImageRequest | WebVideoRequest)>;
};
