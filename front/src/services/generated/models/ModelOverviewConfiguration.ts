/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * One saved configuration; multiple accounts never masquerade as a single verified model.
 */
export type ModelOverviewConfiguration = {
    model_id: string;
    provider_id: string;
    provider_name: string;
    status: 'configured' | 'needs_attention';
    reasons?: Array<string>;
    verification?: string;
};
