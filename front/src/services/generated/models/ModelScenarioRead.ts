/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ScenarioModelChoice } from './ScenarioModelChoice';
/**
 * Scenario requirements, explanatory guidance and current account candidates.
 */
export type ModelScenarioRead = {
    key: string;
    title: string;
    requirement: string;
    guidance: string;
    choices?: Array<ScenarioModelChoice>;
};
