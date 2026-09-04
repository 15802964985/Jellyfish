/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ScriptSourceSpan } from './ScriptSourceSpan';
export type ScriptDocumentBlock = {
    id: string;
    kind: 'heading' | 'paragraph' | 'table' | 'blockquote' | 'list' | 'separator';
    semantic_kind?: 'document_title' | 'overview' | 'chapter' | 'theme' | 'scene_description' | 'camera' | 'duration' | 'voiceover' | 'subtitle' | 'prompt_hint_zh' | 'prompt_hint_en' | 'prompt_summary' | 'voiceover_summary' | 'audio_plan' | 'production_note' | 'asset_bible' | 'unknown';
    level?: (number | null);
    raw_text: string;
    clean_text: string;
    span: ScriptSourceSpan;
    confidence?: number;
    duplicate_of?: (string | null);
    metadata?: Record<string, any>;
};

