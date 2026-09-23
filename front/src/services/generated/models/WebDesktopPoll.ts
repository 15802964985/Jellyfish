/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { WebDesktopReport } from './WebDesktopReport';
/**
 * Outbound-only helper heartbeat and bounded command acknowledgements.
 */
export type WebDesktopPoll = {
    host_id: string;
    reports?: Array<WebDesktopReport>;
};
