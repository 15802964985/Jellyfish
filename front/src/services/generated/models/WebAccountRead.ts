/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { WebAccountReadiness } from './WebAccountReadiness';
/**
 * Show actual pairing/availability without exposing the local profile identity.
 */
export type WebAccountRead = {
    id: string;
    display_name: string;
    platform: string;
    enabled: boolean;
    session_state: string;
    supported_models: Array<string>;
    supported_video_models?: Array<string>;
    online: boolean;
    observed_at?: (string | null);
    active_task_id?: (string | null);
    readiness?: (WebAccountReadiness | null);
};
