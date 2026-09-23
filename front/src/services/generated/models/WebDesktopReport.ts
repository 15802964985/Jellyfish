/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * A paired host reports only operations previously claimed by that host.
 */
export type WebDesktopReport = {
    command_id: string;
    state: 'opened' | 'closed' | 'failed';
    message?: string;
};
