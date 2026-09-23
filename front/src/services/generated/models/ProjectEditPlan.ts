/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { EditAudioClip } from './EditAudioClip';
import type { EditSubtitle } from './EditSubtitle';
import type { EditVideoClip } from './EditVideoClip';
/**
 * 完整剪辑工程快照，服务端保存且直接用于本地编码。
 */
export type ProjectEditPlan = {
    clips?: Array<EditVideoClip>;
    audio?: Array<EditAudioClip>;
    subtitles?: Array<EditSubtitle>;
    resolution?: 720 | 1080;
};
