# 参考素材"从文件管理选择 / 上传"统一接入方案

> 状态：**方案稿，待用户决策**。不动代码。
> 关联记忆：MEMORY.md "资产管理 thumbnail 排序红线" + daily log 09-23 10:16 起。

## 0. 现状一句话

资产管理 / 项目工作台 / 分镜工作室三处的"图片/视频生成"通道，**当前 reference_file_ids 全部由后端 /render 隐式塞入**，前端无任何"用户选择 / 上传"入口；只有分镜帧生成在 `FrameReferenceSelector` 已复用 `MediaFilePicker` 做了"从文件库补选"，但视频批处理、视频单帧 / 角色生成、资产卡片快速生成**全都没有**。

## 1. 三场景精确缺口

| 场景 | 文件入口 | 当前 reference 来源 | 缺口 |
|------|----------|---------------------|------|
| **资产管理卡片快速生成** | `AssetImageCard.tsx:160` `prepareWeb` | `draft.images` ← `renderPrompt(assetId, slotId)` **服务端硬绑定** prop 的"推荐图" | 缺：用户上传 / 库选入口 |
| **资产管理详情页提示词预览** | `AssetEditPageBase.tsx:225-256` `useGenerationDraft` | `context.images` + `useSuggestedImages` 开关 | `useSuggestedImages` 已存在但 UI 未暴露开关；需挂 MediaFilePicker |
| **资产管理**（API 通道 / Web 通道） | `assetAdapters.ts:33-47` | `media.references = payload.images.map(...)` | 已具备通用 references 提交能力；只需给 `payload.images` 注入"用户选择的 file_ids" |
| **分镜工作室 · 帧批生成** | `ChapterStudio.tsx:1144 prepareWebBatch` | `frame_reference_selections[frameType]` ← `FrameReferenceSelector`（已有 MediaFilePicker "从文件库补选"） | **已具备**"库选"；缺"上传新图" |
| **分镜工作室 · 视频批生成** | `ChapterStudio.tsx:1268 runBatchGenerateVideos` | 仅 `first_frame` 单图（`reference_mode='first'`），强制单图 | 缺：多参考 + 用户库选 / 上传 |
| **分镜工作室 · 视频编辑** | `VideoEditPanel.tsx` | `references.length` 上限校验已存在 | 缺：MediaFilePicker 入口未挂 |
| **项目工作台** | `ProjectWorkbench/index.tsx` | **无图/视频生成入口**，只是 tabs 导航 | 不需要改 |

**结论**：**6 个具体改造点**（卡片快速生成 / 详情预览 / 帧批"上传"补全 / 视频批"多参考+库选+上传" / 视频编辑"挂入口" / 详情预览开关 UI），其中帧批"库选"已具备。

## 2. 后端契约（接入新功能必须遵守的硬约束）

来源：`backend/app/services/studio/files.py`、`app/services/generation/files/resolver.py`、`app/services/generation/web_generation.py`、`app/core/contracts/media.py`、`app/core/contracts/web_generation.py`。

| 限制 | 数值 | 影响 |
|------|------|------|
| `reference_file_ids` 上限（Web） | 图片 ≤10、视频 ≤10 + 5 组主体（每组 ≤10） | 前端要按场景限流 |
| `MediaReference` 字段 | `{file_id, media_kind, ordinal}`，`extra="forbid"` | 多字段直接 422 |
| 类型错配 | `MediaReference.media_kind != FileItem.type` → FileResolutionError | 上传音频当图 reference 必失败 |
| `VideoMediaInput.subjects[].name` | `casefold` 去重（大小写不敏感） | 与 `web_generation` 路径的 strip-only 不一致，前端**不要假定等价** |
| `WebVideoRequest.reference_mode` 与数量强校验 | `text=0`/`first_frame=1`/`first_last_frames=2`/`reference_images≤10`/`subjects` 与 groups 一致 | UI 必须按模式控制可选数量 |
| `expected_version` CAS | 只校验 slot.version_id，**不影响 FileItem 引用** | 上传新参考图不会触发 CAS 失败 |
| `frozen_reference_content` 双重 SHA-256 | 提交期 + worker 期各一次比对 | 用户改参考图后必须重新提交任务，**否则 worker 拿不到旧字节** |
| 上传大小 / 类型 | `MAX_UPLOAD_BYTES=500MB` + 扩展名白名单 + 非空 | 前端按 500MB 上限 + 仅 image/video 接受 |
| 上传→引用时序 | 单一事务落库，201 即可引用；无瞬时态 | 前端**先 await 上传完成 → 再提交任务**即可 |

## 3. 复用组件现状

来源：`front/src/pages/aiStudio/files/MediaFilePicker.tsx`、`AssetAttachmentsPanel.tsx`、`front/src/services/studioEntities.ts` 等。

### 3.1 现有可复用组件

- **`MediaFilePicker`**（files/MediaFilePicker.tsx）—— 模态选择器，支持 `kind: 'image'|'video'|'audio'`，**单选模式**，选中即返回 `FileRead`。
- **`AssetAttachmentsPanel`** —— 已用 `Upload.Dragger` + 库选 Modal（自研版本，不复用 MediaFilePicker）。**两步**：上传 → 写 AssetFileLink 关联。
- **`Upload.Dragger`**（antd）—— 已用于 AssetAttachmentsPanel。
- **`FilePreviewModal`** —— 预览弹层，已被多处复用。
- **`FrameReferenceSelector`** —— 帧参考图选择器（已挂 MediaFilePicker），是**唯一现成的样板**。

### 3.2 现有缺口

- MediaFilePicker **无 multiple 模式** → 三场景多数要"多选"，需扩展或包一层 wrapper
- MediaFilePicker **无未关联过滤** → 项目工作台想"项目内参考"只能用 `listFilesApi(project_id=...)`
- MediaFilePicker **无 upload 入口** → 用户要先上传再选，需另开 Upload 按钮或在 Picker Modal 内嵌入 Dragger
- `AssetAttachmentsPanel` 的"上传"是非通用（强耦合 AssetFileLink）

## 4. 改造方案（3 层：公共组件 → 各场景接入 → 后端可选补强）

### 4.1 L1 公共组件（建议必须做，1 个新组件 + 1 个扩展 + 1 个 hook）

#### ① `useUploadFile()` hook —— **新写**
- 路径：`front/src/hooks/useUploadFile.ts`（新建 `hooks/` 目录）
- 封装 `StudioFilesService.uploadFileApiApiV1StudioFilesUploadPost({ name, formData: { file } })`
- 返回 `{ upload, uploading, error, uploadedFile }`
- 与 entity 关联**解耦**（上传本身是裸的，无 parent_entity_type）

#### ② `MediaFilePicker` 扩展 —— **小改**
- 新增 `multiple?: boolean` + `onSelect` 改为 `(files: FileRead[]) => void`（兼容单选 via `files[0]`）
- 新增 `accept?: ('image'|'video'|'audio')[]` 数组支持
- 新增 `embeddedUpload?: boolean` —— 当 true 时在 Modal 内嵌 Dragger，用户可边选边上传，**上传成功自动 onSelect 并回填到 selectedIds**
- 现有 6 个调用点保持兼容（无 `multiple` 走单选）

#### ③ `ReferenceImageEditor` 组件 —— **新写**
- 路径：`front/src/components/ReferenceImageEditor.tsx`
- 功能：紧凑的"已选 file_ids 列表（缩略图 + 删除）+ MediaFilePicker 触发按钮 + 嵌入上传按钮"
- Props：`{ value: string[]; onChange: (ids: string[]) => void; kind: 'image'|'video'; max?: number; projectScope?: string; }`
- 封装 4.1①②，**一站式**给三场景接入
- 设计参考 `FrameReferenceSelector` 但**更通用**

### 4.2 L2 三场景接入（基于 4.1 的 3 个公共组件）

#### 场景 A · 资产管理卡片快速生成
- `AssetImageCard.tsx`：在通道选择 Modal (166-169) 内、`GenerationChannelActions` 上方**挂入 `<ReferenceImageEditor value={extras} onChange={setExtras} kind='image' max={10} />`**
- `prepareWeb` 把 `extras` 合并进 `reference_file_ids`（`[...draft.images, ...extras]`）
- `handleQuickGenerate`（API 通道）把 `extras` 合并进传给 `createGenerationTask` 的 `images` 数组
- 数量上限：图片 ≤10（Web 通道），API 通道也按 ≤10 限流（与后端契约对齐）

#### 场景 B · 资产管理详情页提示词预览
- `AssetEditPageBase.tsx`：在 promptPreview Modal 内、`useSuggestedImages` 开关**作为 Button 露出**（默认 false，UI 直观提示"使用建议图" / "自定义参考图"）
- 开启时挂 `<ReferenceImageEditor value={customImages} onChange={setCustomImages} kind='image' max={10} />`
- 与现有 `context.images` 配合：`context.images` 已是 `useGenerationDraft` 的事实源，只需 `onChange` 同步

#### 场景 C · 分镜工作室帧批生成
- `FrameReferenceSelector.tsx`：在"从文件库补选"按钮旁**新增"上传新图"按钮**（复用 `useUploadFile` + `MediaFilePicker.embeddedUpload`），不需新建 ReferenceImageEditor
- 最小改动，**只补"上传"能力**；库选已具备

#### 场景 D · 分镜工作室视频批生成
- `ChapterStudio.tsx:1268 runBatchGenerateVideos`：当前硬编码 `reference_mode='first'`，单图
- 改造：
  1. `VideoReferenceSelector`（**新子组件**）：复用 `ReferenceImageEditor`，kind='image'，max=10
  2. `runBatchGenerateVideos` 根据用户选择模式动态决定 `reference_mode` + `image_file_ids` 或 `subject_groups`
  3. 视频模式强校验：`text→0` / `first→1` / `first_last→2` / `reference_images→≤10` / `subjects→5 组×10`

#### 场景 E · 分镜工作室视频编辑
- `VideoEditPanel.tsx`：references 已存在但 UI 未挂 Picker。挂 `<ReferenceImageEditor kind='image' max={9} value={refs} onChange={setRefs} />`（注意 video edit 上限 9）
- 校验复用 `references.length` 已有规则

#### 场景 F · 项目工作台
- **不改**。`ProjectWorkbench` 当前无图/视频生成入口，本身就是 tabs 导航。如果未来要在工作台加"快速生成分镜帧"，复用场景 C 的 `FrameReferenceSelector` 模式即可。

### 4.3 L3 后端可选补强（**非必需**，待评估）

如要让"项目管理只显示项目内参考"，后端需扩 list API：

- `GET /api/v1/studio/files` 增加 `unlinked_only=true`（无 asset_files / file_usages 关联）—— 项目工作台场景才有用
- 或增加 `tags_in[]` 多标签过滤 —— 当前 tags 在 PATCH 阶段才写

**当前判断**：**L3 不做**。前端用 `projectScope` 传 `project_id` 给 `listFilesApi` 已经能拿到项目内文件；项目工作台场景暂不动。

## 5. 风险点与边界

| 风险 | 规避 |
|------|------|
| 视频模式参考图数量强校验触发 4xx | UI 按模式上限动态显示 `max`，提交前校验 |
| 上传后立即引用 —— SHA-256 双校验 | UI 上明确"上传完成后才能加入参考列表"（`useUploadFile` 返回 uploadedFile 后再 push 到 value） |
| FileItem 类型错配（音频当图 reference） | `ReferenceImageEditor` kind 强约束为 image / video，picker 内只显示同 kind |
| `MediaReference` extra 字段 422 | 提交时严格只构造 `{file_id, media_kind, ordinal}` |
| 多选 backspace 误删参考图 | Picker 已有"禁用重复添加"语义，`ReferenceImageEditor` 复用 |
| 现有 6 个 MediaFilePicker 调用点回归 | `multiple` 默认 false + `onSelect` 兼容单选返回 array 旧合约改 `files[0]`；type check 单测必跑 |
| PL-020⑦⑧⑨ 行为不回归 | 6 场景都不改后端 reference 处理逻辑；只在调用方多拼几个 file_id，worker 端 reconcile 链路不变 |

## 6. 不做的事清单

| 提案 | 不做的理由 |
|------|----------|
| ❌ 后端"未关联文件过滤" `unlinked_only` | L3 非必需；前端 `project_id` 范围已够 |
| ❌ 改 `MediaFilePicker` 兼容 document kind | 三场景用不到；超出需求范围 |
| ❌ 全量迁移 AssetAttachmentsPanel 上传逻辑到新 hook | 上传是公共，关联是 asset 级特有；解耦更稳 |
| ❌ 新建"项目管理"独立入口 | 与现有 `ProjectWorkbench` 入口冲突；待真实需求来再说 |
| ❌ 视频模式 UI 立刻支持主体 groups（每组命名） | 用户文本提示 + UI 已经够复杂；分两期做 |
| ❌ 全局"未关联我的素材"列表页 | L3 不做；3 场景需求不需要 |

## 7. 改造工作量估算

| 项 | 内容 | 行数估算 | 难度 |
|----|------|---------|------|
| 4.1① | `useUploadFile` hook | ~40 行新 | 🟢 易 |
| 4.1② | `MediaFilePicker` 扩展 | ~20 行新增 + 兼容 | 🟢 易 |
| 4.1③ | `ReferenceImageEditor` 组件 | ~120 行新 | 🟡 中 |
| 4.2A | 资产管理卡片快速生成 | ~25 行新 | 🟢 易 |
| 4.2B | 资产管理详情页开关 + 编辑器 | ~15 行新 | 🟢 易 |
| 4.2C | 帧批"上传"补全 | ~10 行新 | 🟢 易 |
| 4.2D | 视频批生成（最复杂） | ~80 行新（包 VideoReferenceSelector 子组件） | 🔴 难 |
| 4.2E | 视频编辑挂入口 | ~15 行新 | 🟢 易 |
| 4.2F | — | 0 | — |
| 测试 | 6 个场景的组件单测 + 1 个端到端 | ~250 行新 | 🟡 中 |
| 台账 / 文档 | daily log + 二开台账 + MEMORY | ~80 行 | 🟢 易 |

**总计**：~655 行前端新代码 + ~60 行测试 + 文档。**后端零改动**。

## 8. 推荐落地顺序（避免大爆炸）

1. **L1 公共组件**：`useUploadFile` + `MediaFilePicker` 扩展 + `ReferenceImageEditor` —— 一次提交，**先把底座打好**。
2. **场景 A 资产管理卡片** —— 最小接入，验证底座可用，**最先有用户感知**。
3. **场景 C 帧批"上传"补全** —— 最小补全，验证上传链路。
4. **场景 B 资产管理详情页开关** —— 让"参考图模式"切换可见。
5. **场景 E 视频编辑挂入口** —— 视频场景里最简单的一个。
6. **场景 D 视频批生成** —— 最复杂，**放最后**；需要先确认视频模式 UX（text_only vs first_frame vs reference_images 的 UI 选项形态）。

每一步都有可验证产物；任一步失败都不影响前面已部署的能力。

## 9. 用户决策清单（必答）

1. **L1 公共组件**（`useUploadFile` + `MediaFilePicker` 扩展 + `ReferenceImageEditor`）是否同意？是否同意放到 `front/src/hooks/` 和 `front/src/components/`？
2. **4.2 A-E 五场景**是否全部要？还是要按场景分批？（建议全做，但用户拍板）
3. **场景 D 视频批生成**是否本期就做？（强烈建议是；如不做则留下"视频批仍硬编码 first_frame"的技术债）
4. **L3 后端补强**（unlinked_only 等）是否本期不做？默认否。
5. **部署路径**：每次走 `docker compose build front` + `up -d --no-deps front`？**无后端改动**，无需 hotfix 风险。

## 10. 关联文档

- 当前 front 实现：`AssetImageCard.tsx` / `AssetEditPageBase.tsx` / `assetAdapters.ts` / `ChapterStudio.tsx` / `FrameReferenceSelector.tsx` / `VideoEditPanel.tsx` / `MediaFilePicker.tsx` / `AssetAttachmentsPanel.tsx`
- 后端契约：`backend/app/services/studio/files.py` / `backend/app/services/generation/files/resolver.py` / `backend/app/services/generation/web_generation.py` / `backend/app/core/contracts/media.py` / `backend/app/core/contracts/web_generation.py`
- 现有测试覆盖：`backend/tests/services/generation/files/test_file_resolver.py` / `backend/tests/test_files_api_responses.py`
- 二次开发变更清单：本批插入 §"参考素材统一接入方案（2026-09-23 方案稿）"