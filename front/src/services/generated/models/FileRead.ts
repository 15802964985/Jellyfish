/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { FileTypeEnum } from './FileTypeEnum';
export type FileRead = {
    /**
     * 文件 ID
     */
    id: string;
    /**
     * 文件类型
     */
    type: FileTypeEnum;
    /**
     * 文件名/标题
     */
    name: string;
    /**
     * 缩略图 URL/路径
     */
    thumbnail?: string;
    /**
     * 标签
     */
    tags?: Array<string>;
    /**
     * 上传时原始文件名
     */
    original_name?: string;
    /**
     * MIME 类型
     */
    mime_type?: string;
    /**
     * 文件大小（字节）
     */
    size_bytes?: number;
    /**
     * 音视频时长（毫秒）
     */
    duration_ms?: (number | null);
    /**
     * 图片/视频宽度
     */
    width?: (number | null);
    /**
     * 图片/视频高度
     */
    height?: (number | null);
    /**
     * SHA-256 校验值
     */
    checksum?: string;
};

