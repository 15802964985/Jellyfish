/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ModelCategoryKey } from './ModelCategoryKey';
/**
 * 文本模型真实连通性测试结果。
 */
export type ModelConnectionTestRead = {
    /**
     * 是否调用成功
     */
    ok: boolean;
    /**
     * 供应商 ID
     */
    provider_id: string;
    /**
     * 实际测试的模型 ID
     */
    model_id: string;
    /**
     * 实际请求的模型名称
     */
    model_name: string;
    /**
     * 模型类别
     */
    category: ModelCategoryKey;
    /**
     * 调用耗时（毫秒）
     */
    latency_ms: number;
    /**
     * 模型响应摘要
     */
    response_preview?: string;
};

