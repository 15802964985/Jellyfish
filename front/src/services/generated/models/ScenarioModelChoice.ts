/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * A saved model matched against the actual backend capability and configuration.
 */
export type ScenarioModelChoice = {
    model_id: string;
    model_name: string;
    provider_name: string;
    provider_key: string;
    eligible: boolean;
    reasons?: Array<string>;
    official_documentation?: (string | null);
    quota_status?: string;
    verification?: string;
};
