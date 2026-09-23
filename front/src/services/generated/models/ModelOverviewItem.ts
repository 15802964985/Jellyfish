/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ModelModeContract } from './ModelModeContract';
import type { ModelOverviewConfiguration } from './ModelOverviewConfiguration';
/**
 * A catalogue or saved model, separating execution support from account setup.
 */
export type ModelOverviewItem = {
    key: string;
    provider_key: string;
    provider_name: string;
    model_name: string;
    category: 'text' | 'image' | 'video' | 'audio';
    integration: 'integrated' | 'unverified';
    configuration_status: 'configured' | 'needs_attention' | 'not_configured';
    mode_contracts?: Array<ModelModeContract>;
    scenario_keys?: Array<string>;
    limitations?: Array<string>;
    configurations?: Array<ModelOverviewConfiguration>;
    provider_ids?: Array<string>;
    official_documentation?: (string | null);
    verification?: string;
};
