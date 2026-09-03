---
title: 供应商生成链路补全计划
description: 审计模型目录、文本/图片/视频适配器与真实端到端验证，补齐供应商声明和业务能力之间的差距。
---

# 供应商生成链路补全计划

## 目标

让“供应商可添加”“模型可选择”“任务可执行”与“供应商 API 实际支持”保持一致。供应商注册表不再单独代表业务已打通；只有目录、能力约束、执行适配器、产物发布和验证链全部闭合，页面才展示对应能力。

## 2026-09-03 审计基线

| 供应商 | 注册类别 | 文本执行 | 图片执行 | 视频执行 | 模型目录 | 当前结论 |
| --- | --- | --- | --- | --- | --- | --- |
| OpenAI | text / image / video | OpenAI-compatible `ChatOpenAI` | `OpenAIImageApiAdapter` | `OpenAIVideoApiAdapter` | 实时 `/models` | 三类代码链已注册；图片、视频有 MockTransport 测试，尚未用本机真实账号验收 |
| 火山引擎 | text / image / video | OpenAI-compatible `ChatOpenAI` | `VolcengineImageApiAdapter` | `VolcengineVideoApiAdapter` | 实时 `/models`，Plan 404/405 时使用内置目录 | 三类代码链已注册；本机文本链可验证，图片、视频仍需最小付费烟雾测试 |
| 阿里百炼 | text / image / video | OpenAI-compatible `ChatOpenAI` | `AliyunImageApiAdapter` | `AliyunVideoApiAdapter` | 当前读取 Token Plan `/compatible-mode/v1/models` | 三类代码链已注册，但目录只返回文本和图片；视频家族参数映射仍需按官方模型拆分 |
| Vidu | image / video | 不声明支持 | `ViduImageApiAdapter` | `ViduVideoApiAdapter` | 内置官方目录 | 图片、视频代码链与 MockTransport 测试已存在；尚无本机真实账号验收 |
| 可灵 AI | image / video | 不声明支持 | `KlingImageApiAdapter` | `KlingVideoApiAdapter` | 内置官方目录 | 图片、视频代码链与 MockTransport 测试已存在；尚无本机真实账号验收 |

“代码链已注册”表示任务注册表能从统一 generation command 路由到对应 adapter，并不等于所有该供应商模型家族都已经正确映射，也不等于真实 API Key 已完成端到端验证。

## 已确认问题

### 阿里百炼视频下拉为空

本机 Token Plan 的 `/compatible-mode/v1/models` 当前返回 12 个模型：10 个文本、2 个图片、0 个视频。前端按 category 过滤后自然显示空列表。已有 `happyhorse-1.1-i2v` 是手工创建的数据库记录，不是目录接口返回值。

百炼完整模型目录与 Token Plan 权益列表包含 HappyHorse、Wan 等视频模型，但 Token Plan 的 `/api/v1/models` 在本机返回 404。因此不能仅把当前 URL 从 compatible-mode 改成 `/api/v1`；需要“实时目录 + 官方维护目录”的混合策略。

当前通用名称推断还会把 `qwen-audio-*` 当作 text，并且无法稳定识别 `happyhorse-*-i2v/t2v/r2v`。目录分类必须改为供应商权威元数据或显式模型映射，不能继续仅依赖名称中的 `image`、`video` 等少量关键词。

### 阿里视频适配器覆盖过宽

当前 `AliyunVideoApiAdapter` 对所有模型统一发送 `input.media`、`parameters.ratio/duration`。该结构适合 Wan 3.0 All-in-One，但 HappyHorse 文生、首帧生、参考生，以及 Wan 2.7/2.6 的输入字段与能力边界并不完全相同。现有单测证明当前代码按预期组包，不证明每个模型家族符合官方契约。

## 实施阶段

### P0：修复阿里目录与页面可选项

1. 为 `aliyun_bailian` 实现专用 catalog adapter。
2. 业务空间 `/api/v1/models` 可用时读取模型返回的模态/能力元数据。
3. Token Plan `/api/v1/models` 不可用时，将 compatible-mode 实时结果与维护的 Token Plan 官方目录合并。
4. 首批视频目录至少覆盖当前权益中的：
   - `happyhorse-1.1-t2v`
   - `happyhorse-1.1-i2v`
   - `happyhorse-1.1-r2v`
5. 排除当前没有业务类别的 ASR、TTS、Realtime Audio 模型，禁止将其错误标记为 text。
6. 页面保留手工输入；目录项显示“实时目录 / 官方目录 / 已添加”，已添加模型不应导致整个类别看起来为空。

验收：选择“阿里百炼 → 视频生成”至少出现 3 个 Token Plan 视频模型；图片与文本列表不回退；音频模型不再误入文本类别。

### P1：建立供应商声明与执行器一致性约束

1. 启动测试逐项核对 `ProviderSpec.supported_categories` 与 task adapter registry。
2. 声明 image/video 的供应商必须存在 adapter、capability resolver、任务执行器和结果解析测试。
3. 声明 text 的供应商必须明确其 OpenAI-compatible 地址与消息参数差异。
4. 模型目录候选增加能力标识，避免只凭 text/image/video 三个粗类别推断可用操作。

验收：增加供应商或类别但未注册完整链路时测试直接失败，页面不展示尚未闭合的能力。

### P2：按模型家族补全阿里视频契约

1. 拆分 Wan 3.0 All-in-One、HappyHorse、Wan 2.7/2.6 payload builder。
2. 分别映射文生、首帧、首尾帧、参考图/视频/音频、视频编辑能力。
3. 按家族声明 resolution、ratio、duration、seed、watermark、audio 和素材数量约束。
4. 不支持的素材组合在提交前给出中文提示，不把无效字段发送给供应商。
5. 保持素材关联可选：未选择素材时走文生；选择后仅按模型真实支持能力作为参考输入。
6. 统一轮询、取消、超时、临时 URL 下载和 RustFS 永久化。

验收：每个首批模型都有请求快照测试、状态解析测试、取消测试和发布测试；同一模型在实验室、资产生成和分镜工作室走相同 adapter。

### P3：补齐其他供应商的能力精度

1. OpenAI：限定 Sora 模型、时长、尺寸与单参考图约束。
2. 火山引擎：区分标准 Ark 与 Plan 地址，核对 Seedream/Seedance 版本参数。
3. Vidu：按 Q1/Q2/Q3 区分文生、首尾帧、多参考和音频能力。
4. 可灵：按图片与视频版本核对鉴权、任务状态和参考素材限制。
5. 前端根据选中模型的 capability 动态显示参数，隐藏不支持项。

验收：供应商能力矩阵、后端校验、前端控件和 adapter 请求体四者一致。

### P4：真实端到端验收与运维说明

1. 先执行不计费的目录、鉴权和参数校验。
2. 获得人工确认后，每个已配置供应商按 text/image/video 各执行一个最小样例；未配置账号的供应商标记为“代码已接入，真实调用未验证”。
3. 验证任务中心状态、取消、超时、错误信息、产物下载和 RustFS 持久化。
4. 把已验收矩阵同步到架构文档和《Jellyfish 中文版配置使用手册》。

真实生成会产生费用，必须逐供应商取得人工确认；测试默认不自动调用收费模型。

## 推荐执行顺序

先完成 P0，直接解决阿里视频无可选模型；随后完成 P1，防止以后再次出现“供应商声明超前于业务实现”。P2 是阿里视频真正可用的核心，不应只修下拉框后就宣称全部模型打通。P3、P4 按用户实际持有的账号和使用优先级推进。

## 完成标准

- 供应商页面、模型目录和生成页面展示同一能力真相。
- 所有展示为可用的类别都能从页面创建任务、经 outbox/Worker 执行并发布产物。
- 未支持的模型家族不能靠手工 category 绕过参数约束。
- 目录失败仍可手工录入，但页面明确标记验证状态。
- Mock、契约、任务、发布测试通过；真实付费烟雾测试结果单独记录。
