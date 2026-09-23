/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Only the authenticated local executor can attest observed session capabilities.
 */
export type WebAccountHeartbeat = {
    profile_key: string;
    session_state: 'ready' | 'signed_in' | 'needs_login' | 'needs_verification' | 'limited' | 'offline';
    supported_models?: Array<string>;
};
