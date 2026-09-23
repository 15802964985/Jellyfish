/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ProjectEditPlan } from './ProjectEditPlan';
/**
 * 保存必须提供所编辑的修订号，防止不同页面相互覆盖。
 */
export type ProjectEditSave = {
    expected_revision: number;
    plan: ProjectEditPlan;
};
