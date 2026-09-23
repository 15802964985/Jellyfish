/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Policy, evidence and adapter readiness are deliberately independent.
 */
export type WebModelEvidence = {
    name: string;
    enabled?: boolean;
    is_default?: boolean;
    note?: string;
    excluded_account_ids?: Array<string>;
    source?: string;
    observed_at?: (string | null);
    automatic_supported?: boolean;
};
