/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type ParsedScriptChapter = {
    index: number;
    title: string;
    start_seconds?: (number | null);
    end_seconds?: (number | null);
    target_duration_seconds?: (number | null);
    theme?: (string | null);
    screenplay_text: string;
    block_ids?: Array<string>;
    section_block_ids?: Record<string, Array<string>>;
    author_prompt_hints?: Record<string, Array<string>>;
    warnings?: Array<string>;
};
