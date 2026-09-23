/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * 轻量后台任务与业务回填状态；不包含浏览器Cookie或租约密钥。
 */
export type WebTaskRead = {
    task_id: string;
    status: string;
    stage: string;
    error?: string;
    result?: (Record<string, any> | null);
};
