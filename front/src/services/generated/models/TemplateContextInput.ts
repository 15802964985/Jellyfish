/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * 免费试渲染已保存模板，显式区分上下文与手工试填变量。
 */
export type TemplateContextInput = {
    template_id: string;
    scope: 'global' | 'project' | 'chapter' | 'shot' | 'actor' | 'character' | 'scene' | 'prop' | 'costume' | 'lab';
    entity_id: string;
    variables?: Record<string, string>;
};
