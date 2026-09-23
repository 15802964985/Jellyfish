/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * 返回本层和实际生效值、逐字段来源及差异警告。
 */
export type CreativeRead = {
    scope: 'global' | 'project' | 'chapter' | 'shot' | 'actor' | 'character' | 'scene' | 'prop' | 'costume' | 'lab';
    entity_id: string;
    revision: number;
    overrides: Record<string, any>;
    inherited?: Record<string, any>;
    effective: Record<string, any>;
    sources: Record<string, any>;
    appearances?: Record<string, any>;
    fingerprint: string;
    warnings?: Array<string>;
    provenance?: Record<string, any>;
    project_id?: (string | null);
};
