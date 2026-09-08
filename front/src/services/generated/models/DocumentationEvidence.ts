/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Bounded, inert text extracted from a curated official source.
 */
export type DocumentationEvidence = {
    source_url?: (string | null);
    fetched_at: string;
    status: 'fetched' | 'unavailable' | 'unreadable' | 'not_registered';
    content_sha256?: (string | null);
    text?: string;
    message: string;
};
