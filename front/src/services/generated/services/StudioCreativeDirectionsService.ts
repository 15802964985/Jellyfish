/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ApiResponse_CreativeCatalog_ } from '../models/ApiResponse_CreativeCatalog_';
import type { ApiResponse_CreativePromptRead_ } from '../models/ApiResponse_CreativePromptRead_';
import type { ApiResponse_CreativeRead_ } from '../models/ApiResponse_CreativeRead_';
import type { ApiResponse_list_CreativeContextOption__ } from '../models/ApiResponse_list_CreativeContextOption__';
import type { ApiResponse_TemplateContextRead_ } from '../models/ApiResponse_TemplateContextRead_';
import type { CreativePromptInput } from '../models/CreativePromptInput';
import type { CreativeWrite } from '../models/CreativeWrite';
import type { TemplateContextInput } from '../models/TemplateContextInput';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class StudioCreativeDirectionsService {
    /**
     * Get Creative Catalog
     * 返回互相独立的分类与可编辑快捷组合。
     * @returns ApiResponse_CreativeCatalog_ Successful Response
     * @throws ApiError
     */
    public static getCreativeCatalogApiV1StudioCreativeDirectionsCatalogGet(): CancelablePromise<ApiResponse_CreativeCatalog_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/studio/creative-directions/catalog',
        });
    }
    /**
     * Get Context Options
     * 免费查询试渲染业务对象。
     * @returns ApiResponse_list_CreativeContextOption__ Successful Response
     * @throws ApiError
     */
    public static getContextOptionsApiV1StudioCreativeDirectionsContextOptionsScopeGet({
        scope,
        q = '',
    }: {
        scope: 'global' | 'project' | 'chapter' | 'shot' | 'actor' | 'character' | 'scene' | 'prop' | 'costume' | 'lab',
        q?: string,
    }): CancelablePromise<ApiResponse_list_CreativeContextOption__> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/studio/creative-directions/context-options/{scope}',
            path: {
                'scope': scope,
            },
            query: {
                'q': q,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Preview Template
     * 不创建任务的模板上下文试渲染。
     * @returns ApiResponse_TemplateContextRead_ Successful Response
     * @throws ApiError
     */
    public static previewTemplateApiV1StudioCreativeDirectionsTemplatePreviewPost({
        requestBody,
    }: {
        requestBody: TemplateContextInput,
    }): CancelablePromise<ApiResponse_TemplateContextRead_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/creative-directions/template-preview',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Get Creative Direction
     * 只读解析本层覆盖和实际生效来源。
     * @returns ApiResponse_CreativeRead_ Successful Response
     * @throws ApiError
     */
    public static getCreativeDirectionApiV1StudioCreativeDirectionsScopeEntityIdGet({
        scope,
        entityId,
    }: {
        scope: 'global' | 'project' | 'chapter' | 'shot' | 'actor' | 'character' | 'scene' | 'prop' | 'costume' | 'lab',
        entityId: string,
    }): CancelablePromise<ApiResponse_CreativeRead_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/studio/creative-directions/{scope}/{entity_id}',
            path: {
                'scope': scope,
                'entity_id': entityId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Put Creative Direction
     * 按预期版本保存，失败由事务回滚，不触发收费生成。
     * @returns ApiResponse_CreativeRead_ Successful Response
     * @throws ApiError
     */
    public static putCreativeDirectionApiV1StudioCreativeDirectionsScopeEntityIdPut({
        scope,
        entityId,
        requestBody,
    }: {
        scope: 'global' | 'project' | 'chapter' | 'shot' | 'actor' | 'character' | 'scene' | 'prop' | 'costume' | 'lab',
        entityId: string,
        requestBody: CreativeWrite,
    }): CancelablePromise<ApiResponse_CreativeRead_> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/api/v1/studio/creative-directions/{scope}/{entity_id}',
            path: {
                'scope': scope,
                'entity_id': entityId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Preview Creative Prompt
     * 与生成门禁共用编译器，预览不触发付费操作。
     * @returns ApiResponse_CreativePromptRead_ Successful Response
     * @throws ApiError
     */
    public static previewCreativePromptApiV1StudioCreativeDirectionsScopeEntityIdPreviewPost({
        scope,
        entityId,
        requestBody,
    }: {
        scope: 'global' | 'project' | 'chapter' | 'shot' | 'actor' | 'character' | 'scene' | 'prop' | 'costume' | 'lab',
        entityId: string,
        requestBody: CreativePromptInput,
    }): CancelablePromise<ApiResponse_CreativePromptRead_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/studio/creative-directions/{scope}/{entity_id}/preview',
            path: {
                'scope': scope,
                'entity_id': entityId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
}
