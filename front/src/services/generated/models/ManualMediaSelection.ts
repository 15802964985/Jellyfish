/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Freeze the viewed target version so selecting media cannot overwrite newer work.
 */
export type ManualMediaSelection = {
    target_type: 'actor' | 'character' | 'scene' | 'prop' | 'costume' | 'frame' | 'shot';
    entity_id: string;
    slot_id?: (number | null);
    frame_type?: 'first' | 'key' | 'last';
    file_id: string;
    expected_version: number;
};
