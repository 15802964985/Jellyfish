/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { FileReferenceGroup } from './FileReferenceGroup';
/**
 * 删除前关联检查结果；删除请求仍需重新核对。
 */
export type FileDeleteImpactRead = {
    file_id: string;
    can_delete: boolean;
    reference_count: number;
    groups?: Array<FileReferenceGroup>;
};
