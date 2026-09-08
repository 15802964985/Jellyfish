/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ModelCategoryKey } from './ModelCategoryKey';
/**
 * 只读接入核查，不将目录、网络连通或适配器存在等同于业务验收。
 */
export type ModelIntegrationAuditRead = {
    model_id: string;
    model_name: string;
    provider_key: string;
    category: ModelCategoryKey;
    checked_at: string;
    adapter_registered: boolean;
    endpoint: string;
    official_documentation?: (string | null);
    documentation_status?: string;
    business_verification_status?: string;
    issues?: Array<string>;
    business_checks?: Array<string>;
};
