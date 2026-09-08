/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ModelOverviewItem } from './ModelOverviewItem';
import type { ModelScenarioRead } from './ModelScenarioRead';
/**
 * Read-only catalogue and scenario definitions for the selection drawer.
 */
export type ModelOverviewRead = {
    models?: Array<ModelOverviewItem>;
    scenarios?: Array<ModelScenarioRead>;
    notices?: Array<string>;
};
