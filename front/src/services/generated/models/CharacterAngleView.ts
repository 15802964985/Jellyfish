/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * 当前角色或所关联演员的有效角度图片，不混入历史生成候选。
 */
export type CharacterAngleView = {
    file_id: string;
    image_id: number;
    source_type: 'character' | 'actor';
    source_id: string;
    view_angle: string;
    label: string;
};
