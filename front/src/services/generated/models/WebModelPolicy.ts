/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Maintain a visible name and optional account exclusions, without invented balances.
 */
export type WebModelPolicy = {
    name: string;
    enabled?: boolean;
    is_default?: boolean;
    note?: string;
    excluded_account_ids?: Array<string>;
};
