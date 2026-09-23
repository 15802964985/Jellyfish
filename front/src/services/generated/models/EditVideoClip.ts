/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * 固定源文件的非破坏性视频裁剪，审片标记绑定本片段。
 */
export type EditVideoClip = {
    id: string;
    shot_id: string;
    file_id: string;
    label: string;
    in_seconds?: number;
    out_seconds: number;
    volume?: number;
    review?: 'unchecked' | 'approved' | 'rework';
    review_note?: string;
    reference_signature?: string;
    transition?: 'cut' | 'fade' | 'dissolve' | 'wipeleft' | 'slideright' | 'fadeblack';
    transition_seconds?: number;
};
