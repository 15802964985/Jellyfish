/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ProjectTimelineClipRead } from './ProjectTimelineClipRead';
/**
 * 项目当前可交付视频的只读时间线。
 */
export type ProjectTimelineRead = {
    project_id: string;
    clips?: Array<ProjectTimelineClipRead>;
    total_shots: number;
    ready_shots: number;
    missing_shot_ids?: Array<string>;
    total_duration_seconds: number;
    export_ready: boolean;
    latest_export_file_id?: (string | null);
};
