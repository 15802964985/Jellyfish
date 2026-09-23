/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Explicit editing consent and preserve instructions; no automatic crop or adoption.
 */
export type VideoEditOperationInput = {
    kind?: string;
    client_request_id: string;
    preserve_instructions?: string;
    keep_audio?: boolean;
    resolution?: (string | null);
    seconds?: (number | null);
    reference_positions?: Array<number>;
    external_transfer_confirmed: boolean;
    billing_confirmed: boolean;
};
