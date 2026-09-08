/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { TaskStatus } from './TaskStatus';
/**
 * 项目成片异步任务创建结果。
 */
export type ProjectVideoExportTaskRead = {
    task_id: string;
    status: TaskStatus;
    reused?: boolean;
};
