/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { EntityDeleteImpactGroup } from './EntityDeleteImpactGroup';
/**
 * Concrete relationship summary shown before unlink-and-delete.
 */
export type EntityDeleteImpactRead = {
    entity_type: 'actor' | 'character' | 'scene' | 'prop' | 'costume';
    entity_id: string;
    entity_name: string;
    relation_count: number;
    has_relations: boolean;
    groups?: Array<EntityDeleteImpactGroup>;
};
