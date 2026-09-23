/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * 分镜参考条目，包括关联资产图片及主动补选的文件。
 */
export type ShotLinkedAssetItem = {
    /**
     * 实体类型：character/prop/scene/costume
     */
    type: ('character' | 'prop' | 'scene' | 'costume' | string);
    /**
     * 实体 ID（如 character_id/prop_id/scene_id/costume_id）
     */
    id: string;
    /**
     * 最佳缩略图对应的 image 行 ID（如 PropImage.id）；无图则为 null
     */
    image_id?: (number | null);
    /**
     * 最佳缩略图对应的文件 ID（files.id）；用于参考图输入；无图则为 null
     */
    file_id?: (string | null);
    /**
     * 实体名称
     */
    name: string;
    /**
     * 缩略图下载地址（/api/v1/studio/files/{file_id}/download）
     */
    thumbnail?: string;
};
