/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * 导入草稿/历史列表摘要，避免列表接口返回完整解析正文。
 */
export type ScriptImportSummaryRead = {
    id: string;
    project_id: string;
    file_id: string;
    file_name: string;
    title: string;
    status: string;
    is_saved?: boolean;
    source_format: string;
    parser_version: string;
    document_profile: 'screenplay' | 'shot_list' | 'story_outline' | 'novel_text' | 'prompt_pack' | 'asset_bible' | 'audio_script' | 'mixed' | 'unknown';
    chapter_count?: number;
    committed_chapter_count?: number;
    created_at: string;
    updated_at: string;
};
