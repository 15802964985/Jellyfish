/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * 按章节、镜头顺序投影出的一个可播放视频片段。
 */
export type ProjectTimelineClipRead = {
    id: string;
    chapter_id: string;
    chapter_index: number;
    chapter_title: string;
    shot_id: string;
    shot_index: number;
    label: string;
    file_id: string;
    start_seconds: number;
    end_seconds: number;
    duration_seconds: number;
};
