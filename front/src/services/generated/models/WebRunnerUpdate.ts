/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * 执行器报告已核对的网页阶段，不能据此伪造成功产物。
 */
export type WebRunnerUpdate = {
    binding_version?: 1 | 2;
    user_message_id?: (string | null);
    stage: 'preparing' | 'submitting' | 'submitted' | 'needs_user' | 'submission_unknown' | 'downloading' | 'awaiting_user';
    conversation_url?: (string | null);
    message_id?: (string | null);
    reason?: string;
    paused?: boolean;
    recovery_epoch?: number;
};
