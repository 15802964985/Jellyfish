/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type ShotAudioCuePlan = {
    candidate_id: string;
    audio_type: 'dialogue' | 'voiceover' | 'sfx' | 'bgm' | 'ambient' | 'subtitle' | 'silence';
    chapter_index?: (number | null);
    shot_index?: (number | null);
    speaker?: (string | null);
    text: string;
    start_seconds?: (number | null);
    end_seconds?: (number | null);
    evidence?: Array<Record<string, string>>;
    confidence?: number;
};

