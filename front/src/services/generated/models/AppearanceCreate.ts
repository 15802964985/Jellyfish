/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AppearanceView } from './AppearanceView';
import type { CreativeFields } from './CreativeFields';
/**
 * 显式保存造型；省略图片时快照当前已采用角色图，空列表则不复制。
 */
export type AppearanceCreate = {
    name: string;
    description?: string;
    costume_id?: (string | null);
    creative_direction?: CreativeFields;
    views?: (Array<AppearanceView> | null);
};
