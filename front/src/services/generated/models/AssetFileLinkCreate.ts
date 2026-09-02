/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * 将已有文件关联为业务资产的可选参考。
 */
export type AssetFileLinkCreate = {
    file_id: string;
    resource_role?: string;
    sort_index?: number;
    is_primary?: boolean;
    enabled?: boolean;
    note?: string;
};

