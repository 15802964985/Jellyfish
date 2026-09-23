/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * 明确确认外发与费用后提交一次检查，重复同一请求可幂等复用。
 */
export type EditVisualSubmit = {
    evidence_id: string;
    model_id: string;
    model_revision_id: string;
    request_id: string;
    external_and_billing_confirmed: boolean;
};
