/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ScriptDocumentParseResult } from './ScriptDocumentParseResult';
export type ScriptImportRead = {
    id: string;
    project_id: string;
    file_id: string;
    status: string;
    is_saved?: boolean;
    source_format: string;
    content_hash: string;
    parser_version: string;
    document_profile: 'screenplay' | 'shot_list' | 'story_outline' | 'novel_text' | 'prompt_pack' | 'asset_bible' | 'audio_script' | 'mixed' | 'unknown';
    parse_result: ScriptDocumentParseResult;
    analysis_result?: Record<string, any>;
    review_state?: Record<string, any>;
    commit_result?: Record<string, any>;
    error_message?: string;
    created_at: string;
    updated_at: string;
};
