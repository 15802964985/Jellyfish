/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ShotAudioTrackType } from './ShotAudioTrackType';
/**
 * 把音频资产作为可选音轨加入镜头。
 */
export type ShotAudioTrackCreate = {
    audio_asset_id: string;
    dialog_line_id?: (number | null);
    track_type: ShotAudioTrackType;
    start_ms?: number;
    end_ms?: (number | null);
    volume?: number;
    fade_in_ms?: number;
    fade_out_ms?: number;
    loop?: boolean;
    sort_index?: number;
};

