/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * 只对已保存工程抽帧，调用模型之前先预览外发材料。
 */
export type EditVisualPrepare = {
    expected_revision: number;
    clip_id: string;
    baseline_file_ids?: (Array<string> | null);
    sample_mode?: 'start' | 'bounds' | 'continuity';
};
