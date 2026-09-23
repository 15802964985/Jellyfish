/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Persist that the user has submitted on the platform, without inventing a result.
 */
export type WebHandoffProgress = {
    input_fingerprint: string;
    stage: 'submitted' | 'submission_unknown';
};
