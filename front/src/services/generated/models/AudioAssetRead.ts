/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AudioAssetCategory } from './AudioAssetCategory';
import type { FileRead } from './FileRead';
/**
 * 音频资产及其底层文件。
 */
export type AudioAssetRead = {
    id: string;
    name: string;
    category: AudioAssetCategory;
    file_id: string;
    description: string;
    transcript: string;
    tags: Array<string>;
    actor_id: (string | null);
    character_id: (string | null);
    language: string;
    duration_ms: (number | null);
    file: FileRead;
    usage_count?: number;
};
