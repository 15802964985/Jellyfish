/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { VideoEditModelRead } from './VideoEditModelRead';
/**
 * Configured rows and importable protocol candidates, without secrets.
 */
export type VideoEditCatalogRead = {
    models: Array<VideoEditModelRead>;
    candidates: Array<Record<string, string>>;
};
