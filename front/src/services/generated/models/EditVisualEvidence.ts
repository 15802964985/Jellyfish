/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { EditVisualImage } from './EditVisualImage';
/**
 * 服务端冻结的审片材料，不接收客户端自行编造的图文映射。
 */
export type EditVisualEvidence = {
    evidence_id: string;
    shot_contexts?: Record<string, any>;
    revision: number;
    clip_id: string;
    fingerprint: string;
    images: Array<EditVisualImage>;
    limitations: Array<string>;
    baseline_file_ids?: Array<string>;
    sample_mode?: 'start' | 'bounds' | 'continuity';
};
