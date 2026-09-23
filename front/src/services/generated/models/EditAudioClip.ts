/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * 带独立起点的配音、音乐或音效片段，可跨镜头重叠混音。
 */
export type EditAudioClip = {
    id: string;
    file_id: string;
    label: string;
    track?: 'voice' | 'music' | 'effect';
    start_seconds?: number;
    in_seconds?: number;
    duration_seconds: number;
    volume?: number;
};
