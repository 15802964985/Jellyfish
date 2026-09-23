/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { WebDesktopCommand } from './WebDesktopCommand';
/**
 * Report local helper availability without exposing its authentication secret.
 */
export type WebDesktopStatus = {
    online: boolean;
    observed_at?: (string | null);
    commands?: Array<WebDesktopCommand>;
};
