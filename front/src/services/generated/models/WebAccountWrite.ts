/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Maintain a local account alias; browser login credentials never enter this DTO.
 */
export type WebAccountWrite = {
    display_name: string;
    platform?: 'doubao' | 'jimeng' | 'kling' | 'wanxiang' | 'yuanbao' | 'hailuo' | 'zhipu';
    enabled?: boolean;
};
