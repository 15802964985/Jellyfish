/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { WebModelEvidence } from './WebModelEvidence';
/**
 * Read-only merged directory; old successes never re-enable a disabled entry.
 */
export type WebCatalogRead = {
    revision?: number;
    models: Array<WebModelEvidence>;
    capabilities_verified?: boolean;
    allow_manual_name?: boolean;
};
