/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Change a rule version only after checking the evidence version shown to the user.
 */
export type ModelRuleAction = {
    action: 'rollback' | 'resume';
    expected_sha256: string;
    target_sha256?: (string | null);
};
