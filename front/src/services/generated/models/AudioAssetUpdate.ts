/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AudioAssetCategory } from './AudioAssetCategory';
/**
 * 更新音频资产业务元信息；文件本身保持不可变。
 */
export type AudioAssetUpdate = {
    name?: (string | null);
    category?: (AudioAssetCategory | null);
    description?: (string | null);
    transcript?: (string | null);
    tags?: (Array<string> | null);
    actor_id?: (string | null);
    character_id?: (string | null);
    language?: (string | null);
    duration_ms?: (number | null);
};
