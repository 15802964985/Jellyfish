# Jellyfish 二次开发全量变更清单

> 用途：这是本地二开迁移的主台账。后续每次新增、修改或删除二开能力，必须与代码在同一批次更新本文；下次吸收作者 GitHub 更新时，以本文逐项做“采用上游、保留本地、兼容合并、重新实现、淘汰”判断。

## 1. 基线与可复现边界

| 项目 | 当前记录 |
| --- | --- |
| 作者仓库 | `https://github.com/Forget-C/Jellyfish.git` |
| 作者迁移基线 | `codex/0718`，本地共同基线提交 `508f2c7` |
| 本地稳定分支 | `local/stable-codex-0718` |
| 本次功能清单核对 HEAD | `7a85955`（本轮文档固化前的功能 HEAD） |
| 本地 Fork | `https://github.com/15802964985/Jellyfish.git` |
| 正式代码目录 | `E:\JellyfishNew` |
| 统计范围 | `git diff 508f2c7..local/stable-codex-0718` |

提交号用于审计，不代表以后只能迁移这些 commit。作者代码变化后必须按业务能力重新落位，不能无条件 cherry-pick。

精确复核命令：

```powershell
Set-Location "E:\JellyfishNew"
git log --reverse --oneline 508f2c7..local/stable-codex-0718
git diff --stat 508f2c7..local/stable-codex-0718
git diff --name-status 508f2c7..local/stable-codex-0718
```

首次整理时相对基线共涉及 179 个文件，约新增 9229 行、删除 844 行。文件级真值以上述 Git 命令为准；本文负责解释这些改动为什么存在、迁移时必须保留什么结果。

## 2. 二开能力总表

### LC-001 中文化、E 盘部署与本机安全边界

- 新增/修改：中文界面与中文配置手册；本地前后端 Dockerfile；安全 Compose 覆盖；Nginx 代理修正；忽略本地环境和构建文件。
- 关键位置：`deploy/docker/*.local.Dockerfile`、`deploy/compose/docker-compose.secure-local.yml`、`deploy/compose/docker-compose.yml`、`deploy/docker/nginx.conf`、`.gitignore`、`.dockerignore`。
- 必须保留：正式目录为 `E:\JellyfishNew`；Docker/WSL 数据位于 E 盘；业务端口只监听本机；`.env`、API Key、数据库密码不进入 Git 和日志。
- 升级策略：吸收作者新增环境变量和镜像变化，再把本机安全覆盖适配到新版；禁止用旧 `.env` 覆盖新版示例。

### LC-002 全局数据刷新、CRUD、分页和页面高度

- 新增/修改：项目、章节、演员、角色、场景、道具、提示词和模型等新增/修改/删除后的刷新；非系统数据可编辑和删除；跨页加载工具；章节分页和可视高度修复。
- 关键位置：`front/src/services/loadAllPaginated.ts`、`ProjectLobby.tsx`、`ProjectWorkbench/hooks/useProjectData.ts`、`projectDataEvents.ts`、各资产 Tab、`PromptTemplateManager.tsx`、模型管理各 Tab、章节页面。
- 后端配合：项目、章节、实体、提示词路由的删除/查询语义和响应一致性。
- 必须保留：数据变更后立即看到最新结果；系统内置记录保持保护；列表多时不截断且分页可达。

### LC-003 任务中心和异步交互可靠性

- 新增/修改：任务完成后仍持久可查；默认展示进行中；全部状态和任务类型筛选；轮询降频；更大的可视区域；筛选和分页固定；下拉层级修复；反复收起/打开不永久加载。
- 新增/修改：章节“角色混淆检查”“智能精简”等异步任务创建、分派、取消及编辑框 loading 释放；失败任务可见，不再只出现 `Failed to fetch`。
- 关键位置：`TaskCenter.tsx`、`TaskRuntimeProvider.tsx`、`taskUiStore.ts`、`taskCopy.ts`、`film/task_status.py`、生成 outbox/任务注册与时间戳迁移。
- 必须保留：任务中心是通用任务列表，不变成业务详情页；终态、筛选、分页、取消和刷新恢复都可验证。

### LC-004 剧本文件导入与智能拆解入口

- 新增/修改：项目工作台支持 TXT、Markdown、PDF、DOCX；解析正文后保存/创建章节并进入智能拆解流程；修正章节拆分任务关联。
- 关键位置：`scriptImport.ts`、`ChaptersTab.tsx`、`script_processing.py`、`chapterDivisionTasks.ts`。
- 必须保留：导入与手工录入并存；格式/大小错误有明确提示；原始正文不因拆解失败丢失。

### LC-005 全局文件管理与未关联素材复用

- 新增/修改：所有上传先形成全局文件记录；上传时可以不关联资产；以后可从文件管理搜索、分类、分页选择并关联；下载和安全删除。
- 新增/修改：文件元数据在 MySQL，二进制在 RustFS；删除前检查资产附件、音频资产、镜头音轨等引用。
- 关键位置：`FileManager.tsx`、`FilePreviewModal.tsx`、`studio/files.py`、`services/studio/files.py`、`file_usages.py`、`core/storage.py`。
- 必须保留：“仅上传”有实际意义；底层文件和资产关系分离；仍被引用时拒绝误删。

### LC-006 图片、视频、音频和文档预览修复

- 新增/修改：图片按完整比例展示并支持放大；视频通过可流式读取的响应和 MIME/Range 语义在网页播放；音频试听；TXT/MD/PDF/DOCX 的元数据、下载及受支持正文提取。
- 关键位置：`FilePreviewModal.tsx`、`FileManager.tsx`、文件路由和存储服务；后端增加文档解析依赖。
- 必须保留：网页预览与下载的同一文件内容一致；视频不能下载正常但网页黑屏；超大/不支持文件有边界提示。

### LC-007 资产附件、可选关联和柔性引用

- 新增/修改：演员、角色、场景、道具、服装可关联图片、视频、音频和文档；支持用途、参考说明、主参考、排序、参与推荐开关和解除关联。
- 新增/修改：关联不是硬性要求；无素材继续文字生成；用户显式选择优先于自动推荐；不支持的媒体不发送给模型。
- 关键位置：`AssetAttachmentsPanel.tsx`、`AssetEditPageBase.tsx`、`studio/media_assets.py`、`services/studio/media_assets.py`、`asset_reference_context.py`、`image_task_references.py`、`shot_assets.py`。
- 必须保留：解除关联只删关系不删底层文件；素材说明/文档是软上下文，不要求机械复刻。

### LC-008 配音音效库、镜头音轨与可选合成

- 新增/修改：资产管理增加“配音音效”Tab；支持角色配音、旁白、背景音乐、环境声、音效、转场音的上传、试听、搜索、分页、编辑和删除。
- 新增/修改：镜头可选择音频资产形成音轨，配置开始时间、音量、循环等；视频成功后可用 FFmpeg 非阻塞合成。
- 关键位置：`AudioAssetsTab.tsx`、`ShotAudioTracksPanel.tsx`、`studio_media_assets.py`、`media_composition.py`、`generated_video.py`。
- 必须保留：没有音轨时完全沿用原视频；音频合成失败不删除或覆盖已成功的视频结果。

### LC-009 数据模型、API 与 Alembic 迁移

- 新增实体：`AssetFileLink`、`AudioAsset`、`ShotAudioTrack` 及用途、类别、轨道类型等枚举和 Schema。
- 本地 revision：`e2a6c8f4d901_add_rich_media_assets.py`；扩展 `d8f4a1e9b702_add_unified_generation_foundation.py`；新增 `f4b8d2c6a103_fix_generation_timestamp_defaults.py`。
- 新增/修改 API：文件详情/预览/选择、资产附件 CRUD、音频资产 CRUD、镜头音轨 CRUD、模型目录/能力/连接测试、任务状态等；同步生成前端 OpenAPI client。
- 必须保留：旧数据库可安全 baseline/reconciliation；统一生成表时间默认值正确；迁移和系统 seed 幂等；用户数据和自定义模板不被 seed 覆盖。

### LC-010 模型供应商目录、默认模型和真实连接测试

- 新增/修改：供应商优先的模型新增流程；按供应商显示文本、图片、视频类别和候选模型；允许手工 Model ID；默认模型解析和设置刷新。
- 新增/修改：供应商连接测试和文本模型快速测试走最小真实请求，返回阶段化诊断；修复修改密钥后仍使用旧凭据、管理页无响应等问题。
- 关键位置：`model_catalog.py`、`llm/manage.py`、`llm/resolver.py`、`llm/testing.py`、`ModelsTab.tsx`、`ProvidersTab.tsx`、`SettingsTab.tsx`。
- 必须保留：目录展示能力与真实执行适配器一致；图片/视频不在管理页误触高费用测试；同一供应商的通用/图片/视频 Base URL 能正确分流。

### LC-011 文本、图片和视频供应商执行适配

- 阿里百炼：文本走兼容接口；补齐图片生成、Wan/HappyHorse 视频能力、任务提交/轮询/结果解析及模型家族素材限制。
- 火山引擎：补齐目录与 Seedream/Seedance 模型级能力约束，保留其执行协议边界。
- Vidu：补齐 Q 系列比例、时长、主体/参考素材能力和 payload。
- OpenAI：校正图片和 Sora 视频模型、时长、尺寸、单首帧约束，避免发送未声明字段。
- 可灵：登记图片/视频供应商及模型能力，保持专用鉴权和执行边界。
- 关键位置：`core/integrations/{aliyun,volcengine,vidu,openai,kling}`、统一 `image_capabilities.py`、`video_capabilities.py`、任务执行器和 `generation/gate.py`。
- 必须保留：不能因“供应商可新增”就宣称业务已打通；目录、门禁、适配器、异步轮询、产物归档和测试矩阵必须同时成立。

### LC-012 统一生成链路兼容和任务快照安全

- 新增/修改：本地能力接入作者 generation contracts、submission、outbox、runtime、publisher、artifact 架构，不恢复旧图片任务/提示词链路。
- 新增/修改：媒体以稳定 `file_id` 冻结，Worker 执行时再解析；任务 payload 不保存 API Key、供应商临时凭据或大段 base64。
- 新增/修改：Beat 周期分派 outbox；创建、执行、完成、失败、取消均可审计并被任务中心查询。
- 必须保留：API 成功创建任务不等于执行成功；Worker、Beat、门禁、适配器和产物归档需要端到端验证。

### LC-013 生产提示词模板和业务编排

- 新增/修改：系统默认模板扩充到 10 个生产模板，覆盖资产/场景图片、镜头视频及实际使用的默认类别；系统 seed 幂等且不覆盖用户模板。
- 新增/修改：资产图片把结构化信息、视觉规格、参考素材说明和文档软上下文渲染成最终执行提示词；镜头视频按相邻镜头、动作因果、空间/视线连续、角色/场景/道具/服装及对白形成单镜头指令。
- 新增/修改：Wan 使用单镜头与有序“图/视频”映射；Vidu 使用命名主体；其他供应商不强加专有语法；实验室自由提示词保持原样。
- 关键位置：`backend/sql/001-init-prompt-template.sql`、`generation/prompts/renderers.py`、`generation/prompt_profiles.py`、`asset_image/build_base.py` 及提示词架构文档。
- 必须保留：模板要进入真实 preview/submission/worker 链路；冻结的 `execution_prompt`、规则快照和最终 API 请求一致。

### LC-014 文档、测试和运维流程

- 新增/修改：中文版配置使用手册；架构/计划文档；模型、素材、任务、迁移、存储和提示词专项测试；上游更新 SOP。
- 后端覆盖重点：阿里适配器、模型目录、视频能力、连接测试、媒体资产、文件服务、迁移、时间戳、供应商执行矩阵、提示词 profile 和 seed。
- 前端验证重点：TypeScript、生产构建，以及项目/章节/任务/模型/文件/资产/音视频流程烟测。
- 必须保留：代码、API、generated client、迁移、测试、架构事实和用户手册在同一次交付中一致。

## 3. 未完成、部分完成和待续做计划台账

下列计划不是“当前已经完整交付的能力”，但属于二开连续性的一部分。上游升级时必须与 LC-001 至 LC-014 一起审计：先判断作者新版是否已经实现，再决定继续、合并、改写、暂缓或取消。升级完成后，应从这些计划继续下一步系统优化，不能因为代码迁移成功就把计划视为自动完成。

| 计划 ID | 来源计划 | 当前状态 | 已完成部分 | 升级后待继续/重新评估 |
| --- | --- | --- | --- | --- |
| PL-001 | Alembic 统一数据库迁移 | 部分完成 | 初始 schema、旧库安全 baseline、Compose migrate/seed、系统模板保护已落地 | seed 从遗留 SQL 收敛为版本化数据包；完成发布周期观察后移除 `init_db.py` 和遗留 SQL；先检查作者新版是否已完成同类收敛 |
| PL-002 | 实验室历史输入回填与重试 | 部分完成 | 文本/图片/视频的提示词、模型、图片参考、视频帧和主体素材可恢复，已有版本化输入快照 | 模板 ID/变量无损恢复；图片全部可选参数快照；模型或文件失效的细粒度诊断 |
| PL-003 | 实验室会话持久化 | P0/P1 完成，P2 待条件 | 会话 CRUD、历史分页、URL 定位、任务消息回写、结果恢复和稳定 sequence 已完成 | 身份体系落地后做归属、鉴权、审计、保留、归档和产物 GC；重新审计游标分页、请求幂等键和可靠派发是否已被新版统一生成链覆盖 |
| PL-004 | 生成准备架构重构 | 主链完成，收尾待做 | frame/video/asset image 的 shared、draft、derive、submit 主链已统一 | 压缩 `ChapterStudio` 局部辅助逻辑；治理前端类型遗留；按实际复用价值评估通用生成 UI，而非为抽象而抽象 |
| PL-005 | 富媒体资产增强 | 主链完成，增强待做 | 上传、全局复用、预览、可选关联、生成引用、音频库、镜头音轨和 FFmpeg 合成已完成 | ffprobe 元数据；OCR/可编辑摘要；供应商能力持续校准；后台缩略图；波形时间线/拖拽/静音；项目权限和多用户隔离 |
| PL-006 | 提示词与 Agent 后续编排 | P0 完成，P1-P3 待做 | 10 个生产系统模板、镜头帧模板、视频连续性、Wan/Vidu profile 已接入 | P1 文本 Agent 模板版本化；P2 音频结构计划进入模型原生/后期合成真实链路；P3 有契约的组合工作流和经许可、安全审查的外部 Skill |
| PL-007 | 供应商生成链路补全 | P0-P3 完成，P4 待人工 | 模型目录、能力一致性约束、阿里模型家族及其他供应商首批适配和 Mock 测试完成 | 获得逐供应商付费许可后做 text/image/video 最小真实样例，验证任务、取消、超时、错误、产物下载和 RustFS，再更新真实验收矩阵 |
| PL-008 | 任务异步化与取消 | 主线完成，增强按需 | 主线脚本接口已任务化、可恢复、可请求/协作式取消；预备接口已有后端 | 若出现真实页面再接 `merge-entities`/`analyze-variants`；只有明确业务需要才做运行句柄或强终止；持续收口同步兼容入口 |
| PL-009 | 整体开发规划 | 持续进行 | 核心流程和数据架构已基本稳定，多项结构、交互和提示词工作已分拆推进 | 继续按“结构治理 → 流程体验 → 提示词专项 → 够用的剪辑能力”复盘；以具体子计划和验收为准，避免用宏观描述代替任务 |

详细来源：

- `site/content/docs/plans/alembic-unified-migration-plan.md`
- `site/content/docs/plans/experiment-history-retry.md`
- `site/content/docs/plans/experiment-session-persistence-plan.md`
- `site/content/docs/plans/generation-workspace-refactor.md`
- `site/content/docs/plans/media-assets.md`
- `site/content/docs/plans/prompt-orchestration-roadmap.md`
- `site/content/docs/plans/provider-generation-integration-plan.md`
- `site/content/docs/plans/task-async-cancellation-plan.md`
- `site/content/docs/plans/development-plan.md`

已经完整结束的 `local-customization-port-to-codex-0718`、`unified-asset-image-template-plan` 和 `unified-generation-orchestration-plan` 保留为历史决策，不进入待续做清单；若作者新版导致其验收条件重新失效，必须重新打开为新的 PL 条目，而不是悄悄修改“已完成”结论。

### 计划状态同步规则

1. 阶段开始、完成、暂缓、取消或验收失败时，同时更新来源计划和本节对应 PL 行。
2. “代码已写”“Mock 已通过”“真实业务已验收”是不同状态，不能合并写成“已完成”。
3. 暂缓必须写明依赖条件，例如身份体系、用户付费许可或上游 API 稳定性。
4. 上游升级的迁移决策台账必须同时包含全部 LC 能力和全部未关闭 PL 计划。
5. 升级验收结束后先复核每个 PL：作者是否已实现、前置条件是否满足、优先级是否变化，再确定下一阶段优化顺序。
6. 新计划如果只完成 Phase 1/2，必须新增或更新 PL 条目，列出已完成阶段、未完成阶段、继续入口和验收条件。

## 4. 本地提交与变更主题映射

| 提交 | 主题 |
| --- | --- |
| `80cde51` | 中文化、列表/刷新/任务中心、剧本导入、富媒体、模型管理和本地部署等首轮综合二开 |
| `ebb3957` | Fork、上游同步、备份和验证操作手册 |
| `79d2c1f` | 从旧 main 二开迁移到作者 `codex/0718` 的计划 |
| `9d48d64` | 把本地业务能力迁移到 `codex/0718` 统一生成架构 |
| `31c6a26` | 旧数据库 Alembic baseline 安全处理 |
| `c2d50cd` | MySQL migration 和 RustFS 上传生产安全修复 |
| `93e150d` | 供应商模型目录和章节异步任务创建修复 |
| `3aea1a7` | outbox/Beat 分派和取消后 loading 释放 |
| `d834b0c` | 供应商生成链路补全计划 |
| `538122b` | 文本/图片/视频供应商执行适配及能力矩阵补全 |
| `a6cfdf9` | 未关联文件复用、媒体网页预览和生成引用完善 |
| `7a85955` | 生产系统提示词模板、连续性编排和供应商 prompt profile |
| `daf9a61` | 首次固化二开全量台账、能力摘要和上游智能迁移 SOP |

后续每个二开提交必须在本表追加一行，并同步上方对应 LC 条目；若删除或被上游替代，也要记录原因，不直接抹去历史。

## 5. 迁移时不能机械复制的内容

- `front/openapi.json` 和 `front/src/services/generated/`：先合并后端契约，再整体生成。
- 锁文件：先正确合并依赖声明，再用锁定的包管理器生成。
- `.env`：逐项映射到新版配置，不复制进仓库，不输出秘密值。
- Alembic：保留作者和本地 revision 图，必要时新增 merge revision，不重写已执行历史。
- 模型目录和供应商参数：以届时官方 API、作者新版适配器和本地业务测试三方核对。
- 临时 Bug 补丁：若作者已修复，采用作者实现并移除本地重复代码。
- 已废弃接口/任务链：迁移业务意图到新扩展点，不为少改代码恢复旧架构。

## 6. 后续二开和阶段计划自动同步模板

每次变更在本文追加：

```text
变更 ID：LC-xxx 或现有 LC-xxx
日期 / 本地提交：
用户需求与业务结果：
新增、修改、删除内容：
前端位置：
后端位置：
数据库 revision / seed：
API / OpenAPI / generated client：
配置与部署影响：
兼容与回退：
自动测试：
运行烟测：
手册与架构文档：
下次上游迁移建议：采用 / 保留 / 兼容 / 重实现 / 待比较
关联计划 ID / 当前阶段：
本次完成阶段：
仍未完成阶段、阻塞条件和继续入口：
```

更新提交前执行 `git diff --name-status <上次清单提交>..HEAD`，确认所有功能变化都能映射到某个 LC 条目。无法说明用途的文件差异必须先审查，不能直接归入“其他”。

## 7. 与标准升级流程的关系

- 架构摘要：`site/content/docs/architecture/local-customization-inventory.md`
- 强制流程：`site/content/docs/guide/upstream-upgrade-sop.md`
- 用户操作：`docs/Jellyfish-中文版配置使用手册.md` 第 9 节

下一次收到“检查 GitHub 最新代码并同步更新”指令后，先复制本清单 LC-001 至 LC-014 和所有未关闭 PL 条目形成迁移决策台账，再对作者最新代码逐项取长补短；全部验收通过后，更新基线、HEAD、统计、提交映射、能力条目和计划状态，并从仍未关闭的 PL 计划确定下一步优化工作。
