/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AudioAssetCategory } from './AudioAssetCategory';
/**
 * 使用已上传音频创建可复用音频资产。
 */
export type AudioAssetCreate = {
    name: string;
    category: AudioAssetCategory;
    file_id: string;
    description?: string;
    transcript?: string;
    tags?: Array<string>;
    actor_id?: (string | null);
    character_id?: (string | null);
    language?: string;
    duration_ms?: (number | null);
    /**
     * 可选：同步记录项目素材使用关系
     */
    project_id?: (string | null);
};

