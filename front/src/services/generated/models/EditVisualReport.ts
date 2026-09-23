/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { EditVisualEvidence } from './EditVisualEvidence';
/**
 * 仅成功且有正文的历史报告，保留准确的来源与适用状态。
 */
export type EditVisualReport = {
    task_id: string;
    created_at: string;
    model_name: string;
    revision: number;
    clip_id: string;
    matches_current: boolean;
    text: string;
    evidence: EditVisualEvidence;
};
