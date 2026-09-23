/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ScriptImportCandidateDecision } from './ScriptImportCandidateDecision';
import type { ScriptImportChapterOverride } from './ScriptImportChapterOverride';
export type ScriptImportCommitRequest = {
    selected_chapter_indexes?: Array<number>;
    chapter_overrides?: Record<string, ScriptImportChapterOverride>;
    candidate_decisions?: Record<string, ScriptImportCandidateDecision>;
    include_shots?: boolean;
    include_audio_dialogue?: boolean;
    media_plan_model_id?: (string | null);
};
