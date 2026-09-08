/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ModelCategoryKey } from './ModelCategoryKey';
/**
 * 可从供应商目录导入的一项模型，不包含任何密钥或供应商配置。
 */
export type ProviderModelCandidate = {
    /**
     * 供应商模型名称
     */
    name: string;
    /**
     * 模型类别
     */
    category: ModelCategoryKey;
    /**
     * 供应商能力说明
     */
    description?: string;
    /**
     * 建议写入模型配置的默认参数
     */
    params?: Record<string, any>;
    /**
     * 候选来自供应商实时 API 或 Jellyfish 维护的官方目录
     */
    source?: 'provider_api' | 'provider_catalog';
    /**
     * Jellyfish 已映射并允许该模型执行的操作
     */
    capabilities?: Array<'text_generation' | 'text_to_image' | 'image_to_image' | 'text_to_video' | 'image_to_video' | 'reference_to_video' | 'video_edit' | 'text_to_speech'>;
};

