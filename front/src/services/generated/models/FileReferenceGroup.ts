/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * 某类业务引用的计数与可定位明细，不包含任务或配置原文。
 */
export type FileReferenceGroup = {
    kind: string;
    label: string;
    count: number;
    /**
     * 最多20条关联定位信息
     */
    items?: Array<string>;
};
