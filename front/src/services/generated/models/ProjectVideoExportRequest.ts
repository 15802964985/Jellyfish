/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * 成片导出选项；默认要求所有镜头已有视频。
 */
export type ProjectVideoExportRequest = {
    /**
     * 是否允许跳过尚无视频的镜头
     */
    allow_partial?: boolean;
    /**
     * 是否把镜头对白作为可开关字幕轨写入 MP4
     */
    include_subtitles?: boolean;
};
