/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ShotAudioTrackType } from './ShotAudioTrackType';
/**
 * 调整镜头音轨的位置、音量与淡入淡出。
 */
export type ShotAudioTrackUpdate = {
    dialog_line_id?: (number | null);
    track_type?: (ShotAudioTrackType | null);
    start_ms?: (number | null);
    end_ms?: (number | null);
    volume?: (number | null);
    fade_in_ms?: (number | null);
    fade_out_ms?: (number | null);
    loop?: (boolean | null);
    sort_index?: (number | null);
};

