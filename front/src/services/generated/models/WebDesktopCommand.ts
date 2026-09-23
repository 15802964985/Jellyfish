/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Account-specific launch state is separate from platform login and model capabilities.
 */
export type WebDesktopCommand = {
    command_id: string;
    account_id: string;
    platform: 'doubao' | 'jimeng' | 'kling' | 'wanxiang' | 'yuanbao' | 'hailuo' | 'zhipu';
    action: 'login' | 'runner';
    state: 'queued' | 'starting' | 'opened' | 'closed' | 'failed';
    message?: string;
};
