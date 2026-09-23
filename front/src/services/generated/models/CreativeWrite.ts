/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CreativeFields } from './CreativeFields';
/**
 * 整份替换本层覆盖，版本检查防止另一页面的旧值覆盖新值。
 */
export type CreativeWrite = {
    expected_revision: number;
    overrides?: CreativeFields;
    project_id?: (string | null);
};
