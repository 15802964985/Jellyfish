/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ParsedScriptChapter } from './ParsedScriptChapter';
import type { ScriptDocumentBlock } from './ScriptDocumentBlock';
export type ScriptDocumentParseResult = {
    source_format: string;
    encoding: string;
    parser_version: string;
    document_profile: 'screenplay' | 'shot_list' | 'story_outline' | 'novel_text' | 'prompt_pack' | 'asset_bible' | 'audio_script' | 'mixed' | 'unknown';
    title?: (string | null);
    metadata?: Record<string, any>;
    blocks?: Array<ScriptDocumentBlock>;
    project_block_ids?: Array<string>;
    auxiliary_block_ids?: Array<string>;
    chapters?: Array<ParsedScriptChapter>;
    warnings?: Array<string>;
};

