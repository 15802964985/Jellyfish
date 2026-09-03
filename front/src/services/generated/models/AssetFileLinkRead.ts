/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { FileRead } from './FileRead';
/**
 * 包含文件元数据的资产附件读取结果。
 */
export type AssetFileLinkRead = {
    id: number;
    entity_type: string;
    entity_id: string;
    file_id: string;
    resource_role: string;
    sort_index: number;
    is_primary: boolean;
    enabled: boolean;
    note: string;
    file: FileRead;
};

