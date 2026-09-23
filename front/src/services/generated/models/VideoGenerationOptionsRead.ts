/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * 当前默认视频模型对应的生成参数选项。
 */
export type VideoGenerationOptionsRead = {
    /**
     * 供应商稳定键
     */
    provider: string;
    /**
     * 默认视频模型 ID
     */
    model_id: string;
    /**
     * 默认视频模型名称
     */
    model_name: string;
    /**
     * 当前模型允许的比例选项
     */
    allowed_ratios?: Array<string>;
    /**
     * 当前模型默认比例
     */
    default_ratio: string;
    /**
     * 是否支持纯文本生成视频
     */
    supports_text_to_video?: boolean;
    /**
     * 是否支持首帧参考
     */
    supports_first_frame?: boolean;
    /**
     * 是否支持尾帧参考
     */
    supports_last_frame?: boolean;
    /**
     * 关键帧数量上限
     */
    max_key_frames?: (number | null);
    /**
     * 是否必须提供首帧
     */
    requires_first_frame?: boolean;
    /**
     * 是否必须同时提供尾帧
     */
    requires_last_frame?: boolean;
    /**
     * 是否必须提供主体参考素材
     */
    requires_subject_reference?: boolean;
    /**
     * 离散时长选项；空表示连续范围
     */
    allowed_seconds?: Array<number>;
    /**
     * 连续时长下限
     */
    min_seconds?: (number | null);
    /**
     * 连续时长上限
     */
    max_seconds?: (number | null);
    /**
     * 是否支持参考主体图片
     */
    supports_subject_image_reference?: boolean;
    /**
     * 是否支持参考主体视频
     */
    supports_subject_video_reference?: boolean;
    /**
     * 是否支持主体参考音频/音色
     */
    supports_subject_audio_reference?: boolean;
    /**
     * 是否允许主体参考与首帧/尾帧/关键帧同时提交
     */
    supports_subject_reference_with_frame_reference?: boolean;
    /**
     * 主体数量上限
     */
    max_subjects?: (number | null);
    /**
     * 单主体图片上限
     */
    max_images_per_subject?: (number | null);
    /**
     * 单主体视频上限
     */
    max_videos_per_subject?: (number | null);
    /**
     * 单主体参考音频上限
     */
    max_audios_per_subject?: (number | null);
    /**
     * 单主体图片与视频共享槽位上限
     */
    max_media_per_subject?: (number | null);
    /**
     * 全部主体参考图片总数上限
     */
    max_total_subject_images?: (number | null);
    /**
     * 工作室主体图片链路已按精确协议核验
     */
    studio_subject_images_verified?: boolean;
    /**
     * 所有主体视频总数上限
     */
    max_total_subject_videos?: (number | null);
};
