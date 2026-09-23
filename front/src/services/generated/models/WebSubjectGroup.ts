/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { MediaReference } from './MediaReference';
/**
 * Keep multiple views/media explicitly assigned to one subject during manual handoff.
 */
export type WebSubjectGroup = {
    name: string;
    media: Array<MediaReference>;
};
