/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ApiResponse_dict_ } from '../models/ApiResponse_dict_';
import type { ApiResponse_DocumentationEvidence_ } from '../models/ApiResponse_DocumentationEvidence_';
import type { ApiResponse_ImageGenerationOptionsRead_ } from '../models/ApiResponse_ImageGenerationOptionsRead_';
import type { ApiResponse_list_ModelScenarioRead__ } from '../models/ApiResponse_list_ModelScenarioRead__';
import type { ApiResponse_list_ProviderSupportedRead__ } from '../models/ApiResponse_list_ProviderSupportedRead__';
import type { ApiResponse_ModelConnectionTestRead_ } from '../models/ApiResponse_ModelConnectionTestRead_';
import type { ApiResponse_ModelIntegrationAuditRead_ } from '../models/ApiResponse_ModelIntegrationAuditRead_';
import type { ApiResponse_ModelOverviewRead_ } from '../models/ApiResponse_ModelOverviewRead_';
import type { ApiResponse_ModelRead_ } from '../models/ApiResponse_ModelRead_';
import type { ApiResponse_ModelSettingsRead_ } from '../models/ApiResponse_ModelSettingsRead_';
import type { ApiResponse_NoneType_ } from '../models/ApiResponse_NoneType_';
import type { ApiResponse_PaginatedData_ModelRead__ } from '../models/ApiResponse_PaginatedData_ModelRead__';
import type { ApiResponse_PaginatedData_ProviderRead__ } from '../models/ApiResponse_PaginatedData_ProviderRead__';
import type { ApiResponse_ProviderCredentialsRead_ } from '../models/ApiResponse_ProviderCredentialsRead_';
import type { ApiResponse_ProviderModelCatalogRead_ } from '../models/ApiResponse_ProviderModelCatalogRead_';
import type { ApiResponse_ProviderModelImportResult_ } from '../models/ApiResponse_ProviderModelImportResult_';
import type { ApiResponse_ProviderRead_ } from '../models/ApiResponse_ProviderRead_';
import type { ApiResponse_VideoGenerationOptionsRead_ } from '../models/ApiResponse_VideoGenerationOptionsRead_';
import type { GenerationDefaultsUpdate } from '../models/GenerationDefaultsUpdate';
import type { ModelCategoryKey } from '../models/ModelCategoryKey';
import type { ModelCreate } from '../models/ModelCreate';
import type { ModelRuleAction } from '../models/ModelRuleAction';
import type { ModelSettingsUpdate } from '../models/ModelSettingsUpdate';
import type { ModelSyncSettings } from '../models/ModelSyncSettings';
import type { ModelUpdate } from '../models/ModelUpdate';
import type { ProviderCreate } from '../models/ProviderCreate';
import type { ProviderModelImportRequest } from '../models/ProviderModelImportRequest';
import type { ProviderUpdate } from '../models/ProviderUpdate';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class LlmService {
    /**
     * 模型接口同步状态
     * Return only supported/configured scope and official-source change records.
     * @returns ApiResponse_dict_ Successful Response
     * @throws ApiError
     */
    public static getModelSyncReportApiV1LlmModelSyncGet(): CancelablePromise<ApiResponse_dict_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/llm/model-sync',
        });
    }
    /**
     * 手动检查模型接口更新
     * Queue the same distributed-lease-protected scan used by startup and Beat.
     * @returns ApiResponse_dict_ Successful Response
     * @throws ApiError
     */
    public static triggerModelSyncApiV1LlmModelSyncPost(): CancelablePromise<ApiResponse_dict_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/llm/model-sync',
        });
    }
    /**
     * 保存模型默认生成规格
     * Save only the explicitly selected default through the model revision service.
     * @returns ApiResponse_dict_ Successful Response
     * @throws ApiError
     */
    public static setGenerationDefaultApiV1LlmModelsModelIdGenerationDefaultsPatch({
        modelId,
        requestBody,
    }: {
        modelId: string,
        requestBody: GenerationDefaultsUpdate,
    }): CancelablePromise<ApiResponse_dict_> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/api/v1/llm/models/{model_id}/generation-defaults',
            path: {
                'model_id': modelId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * 回退或恢复官方兼容规则
     * Apply a version-checked rule action; never rewrite provider endpoint or credentials.
     * @returns ApiResponse_dict_ Successful Response
     * @throws ApiError
     */
    public static changeModelRuleApiV1LlmModelSyncSourceIdRulesPost({
        sourceId,
        requestBody,
    }: {
        sourceId: string,
        requestBody: ModelRuleAction,
    }): CancelablePromise<ApiResponse_dict_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/llm/model-sync/{source_id}/rules',
            path: {
                'source_id': sourceId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * 设置模型接口检查周期
     * Update cadence without modifying model defaults, endpoints or source trust policy.
     * @returns ApiResponse_dict_ Successful Response
     * @throws ApiError
     */
    public static updateModelSyncSettingsApiV1LlmModelSyncSettingsPatch({
        requestBody,
    }: {
        requestBody: ModelSyncSettings,
    }): CancelablePromise<ApiResponse_dict_> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/api/v1/llm/model-sync/settings',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * 读取当前生成模型规格和计费依据
     * Use saved exact model configuration to expose implemented choices without provider generation.
     * @returns ApiResponse_dict_ Successful Response
     * @throws ApiError
     */
    public static getGenerationSpecificationApiV1LlmGenerationSpecificationGet({
        category,
        modelId,
        ratio,
        references,
        editing = false,
    }: {
        category: 'image' | 'video',
        modelId?: (string | null),
        ratio?: (string | null),
        references?: number,
        editing?: boolean,
    }): CancelablePromise<ApiResponse_dict_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/llm/generation-specification',
            query: {
                'category': category,
                'model_id': modelId,
                'ratio': ratio,
                'references': references,
                'editing': editing,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Get Model Overview
     * Read registered model support and saved configurations without inference or remote discovery.
     * @returns ApiResponse_ModelOverviewRead_ Successful Response
     * @throws ApiError
     */
    public static getModelOverviewApiV1LlmModelOverviewGet({
        domesticOnly = true,
    }: {
        domesticOnly?: boolean,
    }): CancelablePromise<ApiResponse_ModelOverviewRead_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/llm/model-overview',
            query: {
                'domestic_only': domesticOnly,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Get Model Scenarios
     * Read capability-aware guidance without inference, quota purchase or configuration changes.
     * @returns ApiResponse_list_ModelScenarioRead__ Successful Response
     * @throws ApiError
     */
    public static getModelScenariosApiV1LlmModelScenariosGet({
        domesticOnly = true,
    }: {
        domesticOnly?: boolean,
    }): CancelablePromise<ApiResponse_list_ModelScenarioRead__> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/llm/model-scenarios',
            query: {
                'domestic_only': domesticOnly,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Get Model Official Documentation
     * 显式读取注册的官方文档，不向网站发送模型配置、密钥或剧本。
     * @returns ApiResponse_DocumentationEvidence_ Successful Response
     * @throws ApiError
     */
    public static getModelOfficialDocumentationApiV1LlmModelsModelIdOfficialDocumentationGet({
        modelId,
    }: {
        modelId: string,
    }): CancelablePromise<ApiResponse_DocumentationEvidence_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/llm/models/{model_id}/official-documentation',
            path: {
                'model_id': modelId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Get Model Integration Audit
     * 按最新保存配置进行免费接入核查，不外发密钥、剧本或调用生成接口。
     * @returns ApiResponse_ModelIntegrationAuditRead_ Successful Response
     * @throws ApiError
     */
    public static getModelIntegrationAuditApiV1LlmModelsModelIdIntegrationAuditGet({
        modelId,
    }: {
        modelId: string,
    }): CancelablePromise<ApiResponse_ModelIntegrationAuditRead_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/llm/models/{model_id}/integration-audit',
            path: {
                'model_id': modelId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * 列出模型供应商（分页）
     * @returns ApiResponse_PaginatedData_ProviderRead__ Successful Response
     * @throws ApiError
     */
    public static listProvidersApiV1LlmProvidersGet({
        q,
        order,
        isDesc = false,
        page = 1,
        pageSize = 10,
    }: {
        /**
         * 关键字，过滤 name/description
         */
        q?: (string | null),
        /**
         * 排序字段：name, created_at, updated_at
         */
        order?: (string | null),
        /**
         * 是否倒序
         */
        isDesc?: boolean,
        /**
         * 页码
         */
        page?: number,
        /**
         * 每页条数
         */
        pageSize?: number,
    }): CancelablePromise<ApiResponse_PaginatedData_ProviderRead__> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/llm/providers',
            query: {
                'q': q,
                'order': order,
                'is_desc': isDesc,
                'page': page,
                'page_size': pageSize,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * 创建模型供应商
     * @returns ApiResponse_ProviderRead_ Successful Response
     * @throws ApiError
     */
    public static createProviderApiV1LlmProvidersPost({
        requestBody,
    }: {
        requestBody: ProviderCreate,
    }): CancelablePromise<ApiResponse_ProviderRead_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/llm/providers',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * 列出系统支持的供应商能力
     * @returns ApiResponse_list_ProviderSupportedRead__ Successful Response
     * @throws ApiError
     */
    public static listSupportedProvidersApiV1LlmProvidersSupportedGet({
        category,
    }: {
        /**
         * 按模型类别过滤：text/image/video/audio
         */
        category?: (ModelCategoryKey | null),
    }): CancelablePromise<ApiResponse_list_ProviderSupportedRead__> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/llm/providers/supported',
            query: {
                'category': category,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * 刷新供应商可导入模型列表
     * 由后端使用 Provider 密钥刷新目录，避免向浏览器暴露密钥。
     * @returns ApiResponse_ProviderModelCatalogRead_ Successful Response
     * @throws ApiError
     */
    public static getProviderModelCatalogApiV1LlmProvidersProviderIdModelsCatalogGet({
        providerId,
    }: {
        providerId: string,
    }): CancelablePromise<ApiResponse_ProviderModelCatalogRead_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/llm/providers/{provider_id}/models/catalog',
            path: {
                'provider_id': providerId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * 导入已选择的供应商模型
     * 批量导入模型；提交事务后才响应，保证保存后的立即查询可见。
     * @returns ApiResponse_ProviderModelImportResult_ Successful Response
     * @throws ApiError
     */
    public static importProviderModelsApiV1LlmProvidersProviderIdModelsImportPost({
        providerId,
        requestBody,
    }: {
        providerId: string,
        requestBody: ProviderModelImportRequest,
    }): CancelablePromise<ApiResponse_ProviderModelImportResult_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/llm/providers/{provider_id}/models/import',
            path: {
                'provider_id': providerId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * 获取当前默认图片模型的关键帧规格选项
     * @returns ApiResponse_ImageGenerationOptionsRead_ Successful Response
     * @throws ApiError
     */
    public static getImageGenerationOptionsApiV1LlmImageGenerationOptionsGet(): CancelablePromise<ApiResponse_ImageGenerationOptionsRead_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/llm/image-generation-options',
        });
    }
    /**
     * 获取当前默认视频模型的动态比例选项
     * @returns ApiResponse_VideoGenerationOptionsRead_ Successful Response
     * @throws ApiError
     */
    public static getVideoGenerationOptionsApiV1LlmVideoGenerationOptionsGet({
        modelId,
    }: {
        modelId?: (string | null),
    }): CancelablePromise<ApiResponse_VideoGenerationOptionsRead_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/llm/video-generation-options',
            query: {
                'model_id': modelId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * 获取供应商编辑凭据
     * 仅在编辑供应商时按需返回密钥，避免列表和普通详情接口泄露凭据。
     * @returns ApiResponse_ProviderCredentialsRead_ Successful Response
     * @throws ApiError
     */
    public static getProviderCredentialsApiV1LlmProvidersProviderIdCredentialsGet({
        providerId,
    }: {
        providerId: string,
    }): CancelablePromise<ApiResponse_ProviderCredentialsRead_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/llm/providers/{provider_id}/credentials',
            path: {
                'provider_id': providerId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * 获取单个模型供应商
     * @returns ApiResponse_ProviderRead_ Successful Response
     * @throws ApiError
     */
    public static getProviderApiV1LlmProvidersProviderIdGet({
        providerId,
    }: {
        providerId: string,
    }): CancelablePromise<ApiResponse_ProviderRead_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/llm/providers/{provider_id}',
            path: {
                'provider_id': providerId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * 更新模型供应商
     * @returns ApiResponse_ProviderRead_ Successful Response
     * @throws ApiError
     */
    public static updateProviderApiV1LlmProvidersProviderIdPatch({
        providerId,
        requestBody,
    }: {
        providerId: string,
        requestBody: ProviderUpdate,
    }): CancelablePromise<ApiResponse_ProviderRead_> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/api/v1/llm/providers/{provider_id}',
            path: {
                'provider_id': providerId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * 删除模型供应商
     * @returns ApiResponse_NoneType_ Successful Response
     * @throws ApiError
     */
    public static deleteProviderApiV1LlmProvidersProviderIdDelete({
        providerId,
    }: {
        providerId: string,
    }): CancelablePromise<ApiResponse_NoneType_> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/api/v1/llm/providers/{provider_id}',
            path: {
                'provider_id': providerId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * 真实测试供应商文本连接
     * @returns ApiResponse_ModelConnectionTestRead_ Successful Response
     * @throws ApiError
     */
    public static testProviderConnectionApiV1LlmProvidersProviderIdTestConnectionPost({
        providerId,
    }: {
        providerId: string,
    }): CancelablePromise<ApiResponse_ModelConnectionTestRead_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/llm/providers/{provider_id}/test-connection',
            path: {
                'provider_id': providerId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * 列出模型（分页）
     * @returns ApiResponse_PaginatedData_ModelRead__ Successful Response
     * @throws ApiError
     */
    public static listModelsApiV1LlmModelsGet({
        providerId,
        category,
        q,
        order,
        isDesc = false,
        page = 1,
        pageSize = 10,
    }: {
        /**
         * 按供应商过滤
         */
        providerId?: (string | null),
        /**
         * 按模型类别过滤
         */
        category?: (ModelCategoryKey | null),
        /**
         * 关键字，过滤 name/description
         */
        q?: (string | null),
        /**
         * 排序字段：name, category, created_at, updated_at
         */
        order?: (string | null),
        /**
         * 是否倒序
         */
        isDesc?: boolean,
        /**
         * 页码
         */
        page?: number,
        /**
         * 每页条数
         */
        pageSize?: number,
    }): CancelablePromise<ApiResponse_PaginatedData_ModelRead__> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/llm/models',
            query: {
                'provider_id': providerId,
                'category': category,
                'q': q,
                'order': order,
                'is_desc': isDesc,
                'page': page,
                'page_size': pageSize,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * 创建模型
     * @returns ApiResponse_ModelRead_ Successful Response
     * @throws ApiError
     */
    public static createModelApiV1LlmModelsPost({
        requestBody,
    }: {
        requestBody: ModelCreate,
    }): CancelablePromise<ApiResponse_ModelRead_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/llm/models',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * 获取单个模型
     * @returns ApiResponse_ModelRead_ Successful Response
     * @throws ApiError
     */
    public static getModelApiV1LlmModelsModelIdGet({
        modelId,
    }: {
        modelId: string,
    }): CancelablePromise<ApiResponse_ModelRead_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/llm/models/{model_id}',
            path: {
                'model_id': modelId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * 更新模型
     * @returns ApiResponse_ModelRead_ Successful Response
     * @throws ApiError
     */
    public static updateModelApiV1LlmModelsModelIdPatch({
        modelId,
        requestBody,
    }: {
        modelId: string,
        requestBody: ModelUpdate,
    }): CancelablePromise<ApiResponse_ModelRead_> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/api/v1/llm/models/{model_id}',
            path: {
                'model_id': modelId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * 删除模型
     * @returns ApiResponse_NoneType_ Successful Response
     * @throws ApiError
     */
    public static deleteModelApiV1LlmModelsModelIdDelete({
        modelId,
    }: {
        modelId: string,
    }): CancelablePromise<ApiResponse_NoneType_> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/api/v1/llm/models/{model_id}',
            path: {
                'model_id': modelId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * 真实测试文本模型
     * @returns ApiResponse_ModelConnectionTestRead_ Successful Response
     * @throws ApiError
     */
    public static testModelApiV1LlmModelsModelIdTestPost({
        modelId,
    }: {
        modelId: string,
    }): CancelablePromise<ApiResponse_ModelConnectionTestRead_> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/v1/llm/models/{model_id}/test',
            path: {
                'model_id': modelId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * 获取模型全局设置（单例）
     * @returns ApiResponse_ModelSettingsRead_ Successful Response
     * @throws ApiError
     */
    public static getModelSettingsApiV1LlmModelSettingsGet(): CancelablePromise<ApiResponse_ModelSettingsRead_> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/v1/llm/model-settings',
        });
    }
    /**
     * 更新模型全局设置（单例）
     * @returns ApiResponse_ModelSettingsRead_ Successful Response
     * @throws ApiError
     */
    public static updateModelSettingsApiV1LlmModelSettingsPut({
        requestBody,
    }: {
        requestBody: ModelSettingsUpdate,
    }): CancelablePromise<ApiResponse_ModelSettingsRead_> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/api/v1/llm/model-settings',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
}
