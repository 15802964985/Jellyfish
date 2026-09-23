/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * 当前镜头关联的人物基准，仅作人工对照，不代表视频像素检测。
 */
export type EditCharacterReference = {
    shot_id: string;
    character_id: string;
    name: string;
    description: string;
    actor_name?: (string | null);
    costume_name?: (string | null);
    image_file_id?: (string | null);
};
