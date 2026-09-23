# 生成准备架构重构计划

## 2026-09-23 图片与视频手工素材采用（工作树待提交批次）

发布完成（2026-09-23）：仅更新 API/front，正式 7788 页面及真实新接口只读验收通过，9 个业务入口、0 页面异常、0 真实写入；没有替换用户现有图片/视频。新 API 镜像 sha256:5a11c9e34f248c5575587aa70a953bcb0cd3b07f54f77703dc22676737b263f7，front sha256:3c3faab5b7e29bf0defc7c6dcf5586afb5f5f9128d51aca25da69f748a8929e1，资源 index-CneNH27v.js；OpenAPI 与线上完全一致。启动标签 latest/web-flow-20260923 已同步，rollback-manual-media-20260923 保留；worker/beat 与数据库未改。本批仍未提交。


覆盖资产管理演员/场景/道具/服装卡片、五类资产（含项目角色）各角度详情、项目工作台五类资产卡片，以及分镜工作室首帧/关键帧/尾帧和当前视频。新增“修改图片 / 修改视频”：从文件管理选择或上传素材→预览→确认采用；上传本身不修改业务对象，取消后文件仍可在文件管理复用。资产卡片快捷修改当前展示的正面/封面槽位，项目卡片修改正面图，其他角度从详情修改；原图片/视频文件保留，不发起模型任务。

共用 ManualMediaButton 与现有 MediaFilePicker/FilePreviewModal、generated 文件客户端；新增 media-assets/manual-selection 的 GET 快照与 POST 手工采用接口，业务放 services/studio/manual_media.py。服务核对七类目标归属、图片/视频类型，原子比较并递增槽位/视频版本；空槽位在明确采用时创建，不能仅打开窗口就写入。手工采用使用 API/网页发布器相同版本字段，旧生成不能覆盖用户新选择；冲突必须重新核对。镜头信息确认状态、时长、提示词不因采用而更改；镜头/项目角色/共享资产项目引用同步，原文件不删除，不伪造生成候选记录。既有“参考素材”关联用途保持独立。

验证：48 项后端回归通过（9 项新手工采用、39 项既有网页任务/交接），OpenAPI/generated 已同步，tsc 与生产构建通过（保留原大包提示）。7 类目标隔离浏览器验证覆盖文件选择、上传预览、显式采用、409 冲突、对象切换和窄屏；实际路由覆盖资产列表/详情、项目工作台五类资产和工作室帧图/视频，测试项目没有道具/服装关联时只在浏览器响应内补关系，不写入生产。无真实生成/收费、无生产素材替换；生产正式读取验收和部署状态见 local-reports/manual-media-20260923/runtime.json。

映射 LC-005/006/007（复用/预览/用户入口）、LC-009/012（契约、目标与版本保护）、LC-014/015（验证、文档与成片素材）；PL-004 本次入口阶段完成，原架构收尾与其他全部未关闭计划保持，不关闭 PL-020 网页生成真实验收。源码备份 backups/manual-media-20260923；无数据库结构/迁移、无 Git 提交或清理。


## 背景

当前图片生成、视频生成、资产图片生成都逐步暴露出同一类问题：

- 基础真值与最终提交内容混用
- 预览与提交使用的上下文不完全一致
- 页面内部状态分散，容易出现 `stale / loading / submit` 语义混乱

为避免在多个入口重复修同类问题，生成链需要统一收敛到同一套“生成准备”架构。

## 目标模型

统一使用四层模型：

1. `Base Draft`
   - 可持久化、可编辑的业务真值
2. `Context`
   - 本次生成的动态上下文
3. `Derived Preview`
   - 基于 `Base Draft + Context` 推导出的预览结果
4. `Submission Payload`
   - 真正提交给模型的最终载荷

## 范围

本次计划覆盖：

1. 分镜帧图片生成链
2. 视频提示词预览与提交链
3. 资产图片生成链

本次不纳入：

1. 任务中心
2. 脚本处理类任务
3. 分镜编辑页提取确认流

## 已完成阶段

### Phase 1：shared + frame 样板

- 新增 `studio/generation/shared`
- 新增 `studio/generation/frame`
- 关键帧图片链先按 `Base / Context / Derived / Submission` 拆分
- 旧 API 路径保持不变，先替换内部服务调用

### Phase 2：前端统一 draft hook

- 新增 `useGenerationDraft`
- 分镜帧图片弹窗先接入统一状态机

### Phase 3：视频生成链迁移

- 视频预览与提交统一迁到 `derive -> submit`
- 保证 readiness、preview、submit 共享同一套上下文规则

### Phase 4：资产图片链迁移

- 角色 / 演员 / 场景 / 道具 / 服装图片生成统一收敛

## 当前进展

- 已完成：关键帧图片最终提示词渲染与提交链统一 render 兜底
- 已完成：`generation/shared + generation/frame` 服务目录搭建
- 已完成：前端 `useGenerationDraft` 抽象，并接入关键帧提示词预览与提交链
- 已完成：`generation/video` 服务目录搭建，视频 preview / submit 共享同一份 reference context
- 已完成：`generation/asset_image` 服务目录搭建，角色 / 演员 / 场景 / 道具 / 服装图片统一接入 render / submit 结构
- 已完成：`AssetEditPageBase` 接入 `useGenerationDraft`，资产图片前端已统一到 draft / context / derived / submit 语义

## 剩余收尾

当前主链迁移已完成，后续仅剩小规模收尾事项：

1. 继续压缩 `ChapterStudio` 内部围绕关键帧 / 视频 draft 的局部辅助逻辑
2. 在后续合适时机处理仓库现有前端类型遗留问题
3. 结合后续需求再评估是否需要继续抽离更通用的生成 UI 组件
