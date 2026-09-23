/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { WebModelPolicy } from './WebModelPolicy';
/**
 * Compare-and-swap catalog edits avoid silently overwriting another settings page.
 */
export type WebCatalogWrite = {
    expected_revision: number;
    models: Array<WebModelPolicy>;
};
