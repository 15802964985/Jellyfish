/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { TaskStatus } from './TaskStatus';
/**
 * AI 配音异步任务创建结果。
 */
export type ShotTtsTaskRead = {
    task_id: string;
    status: TaskStatus;
    reused?: boolean;
};
