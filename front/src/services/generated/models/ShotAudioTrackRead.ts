/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AudioAssetRead } from './AudioAssetRead';
import type { ShotAudioTrackType } from './ShotAudioTrackType';
/**
 * 镜头音轨及可直接试听的音频资产。
 */
export type ShotAudioTrackRead = {
    id: number;
    shot_id: string;
    audio_asset_id: string;
    dialog_line_id: (number | null);
    track_type: ShotAudioTrackType;
    start_ms: number;
    end_ms: (number | null);
    volume: number;
    fade_in_ms: number;
    fade_out_ms: number;
    loop: boolean;
    sort_index: number;
    audio_asset: AudioAssetRead;
};

