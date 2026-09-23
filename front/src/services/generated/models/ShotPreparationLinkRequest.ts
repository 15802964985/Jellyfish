/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ShotPreparationLinkEntityType } from './ShotPreparationLinkEntityType';
/**
 * 明确关联目标与可选候选，支持不同名称资产的人工确认。
 */
export type ShotPreparationLinkRequest = {
    /**
     * 要确认的当前镜头候选 ID
     */
    candidate_id?: (number | null);
    /**
     * 项目 ID
     */
    project_id: string;
    /**
     * 章节 ID
     */
    chapter_id: string;
    /**
     * 准备页关联的实体类型
     */
    entity_type: ShotPreparationLinkEntityType;
    /**
     * 要关联的实体 ID
     */
    linked_entity_id: string;
};
