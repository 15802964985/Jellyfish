/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CreativeRead } from './CreativeRead';
/**
 * 返回实际模板版本、变量和缺项，不冒充已经提交的生成任务。
 */
export type TemplateContextRead = {
    prompt: string;
    direction: CreativeRead;
    template_version: number;
    variables: Record<string, string>;
    missing: Array<string>;
};
