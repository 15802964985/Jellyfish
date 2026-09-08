/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * 从镜头对白创建可追踪的 AI 配音任务。
 */
export type ShotTtsTaskCreate = {
    /**
     * 语音模型 ID；为空时使用默认语音模型
     */
    model_id?: (string | null);
    /**
     * 可选覆盖文本；为空时按顺序合并镜头对白
     */
    text?: (string | null);
    /**
     * 音色；为空时使用模型参数 voice
     */
    voice?: (string | null);
    /**
     * 可选语气、语速或情绪指令
     */
    instruction?: (string | null);
    language_type?: string;
};
