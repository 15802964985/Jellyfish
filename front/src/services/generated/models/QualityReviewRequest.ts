/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Opt-in review with separately selected images, never a guarantee of visual correctness.
 */
export type QualityReviewRequest = {
    model_id: string;
    prompt: string;
    external_and_billing_confirmed: boolean;
    retry_request_id?: (string | null);
    image_file_ids?: Array<string>;
};
