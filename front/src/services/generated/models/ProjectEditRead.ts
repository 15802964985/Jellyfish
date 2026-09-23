/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { EditCharacterReference } from './EditCharacterReference';
import type { ProjectEditPlan } from './ProjectEditPlan';
/**
 * 服务端工程与当前素材目录分开返回。
 */
export type ProjectEditRead = {
    revision: number;
    plan: ProjectEditPlan;
    warnings?: Array<string>;
    character_references?: Array<EditCharacterReference>;
};
