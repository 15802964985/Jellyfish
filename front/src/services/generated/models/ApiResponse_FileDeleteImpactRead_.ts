/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { FileDeleteImpactRead } from './FileDeleteImpactRead';
export type ApiResponse_FileDeleteImpactRead_ = {
    /**
     * 与 HTTP 状态码一致
     */
    code?: number;
    /**
     * 提示信息
     */
    message?: string;
    /**
     * 实际数据
     */
    data?: (FileDeleteImpactRead | null);
    /**
     * 附加元信息
     */
    meta?: (Record<string, any> | null);
};
