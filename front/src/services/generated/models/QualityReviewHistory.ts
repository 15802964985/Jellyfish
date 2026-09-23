/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { QualityReviewRecord } from './QualityReviewRecord';
/**
 * 按镜头分页读取持久化记录，不调用外部模型。
 */
export type QualityReviewHistory = {
    items: Array<QualityReviewRecord>;
    /**
     * 同用途执行中任务，与可复用成功历史分开
     */
    active_tasks?: Array<QualityReviewRecord>;
    total: number;
    page: number;
    page_size: number;
    latest_applied?: (QualityReviewRecord | null);
};
