/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Separate local execution support from official source coverage for one operation.
 */
export type ModelModeContract = {
    key: string;
    title: string;
    implementation: 'integrated' | 'unverified';
    requirement: string;
    reason: string;
    parameters?: Record<string, any>;
    evidence_status: 'model_source_bound' | 'protocol_only' | 'missing';
    source_url?: (string | null);
    verification?: string;
};
