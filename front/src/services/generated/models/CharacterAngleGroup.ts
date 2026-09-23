/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CharacterAngleView } from './CharacterAngleView';
/**
 * 按镜头关联的角色组织定妆图与演员基准，来源明确且由用户选用。
 */
export type CharacterAngleGroup = {
    character_id: string;
    name: string;
    actor_name?: (string | null);
    appearance_id?: (string | null);
    appearance_name?: (string | null);
    views?: Array<CharacterAngleView>;
};
