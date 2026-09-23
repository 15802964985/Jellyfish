/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * 可应用的完整提示词与变更解释；无法靠文本解决的问题单独保留。
 */
export type PromptRevisionResult = {
    revised_prompt: string;
    changes?: Array<string>;
    unresolved?: Array<string>;
};
