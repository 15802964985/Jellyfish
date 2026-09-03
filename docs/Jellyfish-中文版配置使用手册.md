# Jellyfish 中文版配置使用手册

> 适用环境：Windows 10 + WSL2 + Docker Desktop，本机目录 `E:\JellyfishNew`
> 适用代码：作者 `codex/0718` 分支（基线 `508f2c7`）+ 本地二开集成分支
> 更新日期：2026-09-03
> 文档原则：不记录数据库密码、Redis 密码、对象存储密钥或模型 API Key

## 1. Jellyfish 是什么

Jellyfish 是一套 AI 短剧制作工作台。它把以下流程放在同一套系统中：

`剧本 → 章节 → 分镜拆解 → 角色/场景/道具确认 → 关键帧 → 视频生成 → 任务跟踪 → 素材复用`

Jellyfish 自己负责编排、数据管理和任务调度，不自带免费的生成模型。文本、图片和视频生成需要配置第三方模型 API，费用由对应模型供应商收取。

## 2. 本机部署信息

| 项目 | 本机配置 |
| --- | --- |
| Jellyfish 源码 | `E:\JellyfishNew` |
| Docker Desktop | `E:\Docker\Desktop` |
| Docker/WSL 数据 | `E:\Docker\DockerData` |
| 前端 | `http://127.0.0.1:7788` |
| 后端 API | `http://127.0.0.1:8000` |
| API 文档 | `http://127.0.0.1:8000/docs` |
| Jellyfish MySQL | `127.0.0.1:3306` |
| Jellyfish Redis | Windows 侧 `127.0.0.1:6380`，容器内 `redis:6379` |
| RustFS S3 API | `http://127.0.0.1:9000` |
| RustFS 控制台 | `http://127.0.0.1:9001` |

正式切换后以 Compose 中的 MySQL、Redis 和 RustFS 为 Jellyfish 运行依赖。Windows 原有 `127.0.0.1:6379` Redis 与容器 Redis 的宿主机映射必须错开；实际端口以 `deploy\compose\.env` 为准。

所有端口只绑定到 `127.0.0.1`，仅本机可以访问。

### 2.1 RustFS 控制台登录

打开 <http://127.0.0.1:9001>，登录字段与本机配置的对应关系如下：

| RustFS 登录项 | 本机配置来源 |
| --- | --- |
| 用户名 / Access Key | `E:\JellyfishNew\deploy\compose\.env` 中的 `RUSTFS_ACCESS_KEY` |
| 密码 / Secret Key | 同一文件中的 `RUSTFS_SECRET_KEY` |

本机使用的是部署时随机生成的密钥，不是示例文件中的 `rustfsadmin`。为避免密钥随源码、截图或文档泄漏，本手册不记录具体值。不要把 `deploy\compose\.env` 提交到 Git，也不要在控制台截图中暴露密钥。

后端启动时会幂等检查并创建 `.env` 中 `S3_BUCKET_NAME` 指定的 bucket。Docker 内网端点 `http://rustfs:9000` 会自动使用 path-style 寻址。若上传日志出现 `NoSuchBucket` 或尝试访问 `桶名.rustfs`，先确认正在运行的是本手册对应版本，再重启 `backend` 并检查启动日志；不要通过修改 hosts 文件绕过。

## 3. 日常启动与关闭

### 3.1 启动前检查

1. 启动 Docker Desktop。
2. 等待 Docker Desktop 显示 Engine running。
3. 打开 PowerShell。

### 3.2 启动 Jellyfish

在 PowerShell 中执行：

```powershell
$env:Path = "E:\Docker\Desktop\resources\bin;$env:Path"
Set-Location "E:\JellyfishNew"
docker compose `
  --env-file "E:\JellyfishNew\deploy\compose\.env" `
  -f "E:\JellyfishNew\deploy\compose\docker-compose.yml" `
  -f "E:\JellyfishNew\deploy\compose\docker-compose.secure-local.yml" `
  up -d
```

启动后访问：

- 主界面：<http://127.0.0.1:7788>
- 后端文档：<http://127.0.0.1:8000/docs>

### 3.3 查看运行状态

```powershell
$env:Path = "E:\Docker\Desktop\resources\bin;$env:Path"
Set-Location "E:\JellyfishNew"
docker compose `
  --env-file "E:\JellyfishNew\deploy\compose\.env" `
  -f "E:\JellyfishNew\deploy\compose\docker-compose.yml" `
  -f "E:\JellyfishNew\deploy\compose\docker-compose.secure-local.yml" `
  ps -a
```

正常状态：

- `front`、`backend`、`celery-worker`、`celery-beat` 为 `Up`。其中 Worker 执行任务，Beat 每 10 秒可靠投递数据库 outbox 中的待执行任务；缺少 Beat 时任务只会停留在“等待中”，不会调用模型。
- `mysql`、`redis` 为 `Up (healthy)`。
- `backend-migrate`、`backend-seed-system-data` 为 `Exited (0)`。前者运行 Alembic 迁移，后者写入系统内置数据；退出码 0 表示成功，不是故障。

### 3.4 停止 Jellyfish

```powershell
$env:Path = "E:\Docker\Desktop\resources\bin;$env:Path"
Set-Location "E:\JellyfishNew"
docker compose `
  --env-file "E:\JellyfishNew\deploy\compose\.env" `
  -f "E:\JellyfishNew\deploy\compose\docker-compose.yml" `
  -f "E:\JellyfishNew\deploy\compose\docker-compose.secure-local.yml" `
  stop
```

`stop` 不会删除项目数据。之后可以用相同配置执行 `start` 或 `up -d` 恢复。

> 不要执行 `docker compose down -v`。参数 `-v` 会删除数据库和对象存储卷，可能造成项目数据无法恢复。

## 4. 首次模型配置

打开模型管理页面：<http://127.0.0.1:7788/models>

当前版本的供应商适配能力：

| 供应商 | 文本 | 图片 | 视频 |
| --- | ---: | ---: | ---: |
| OpenAI | 支持 | 支持 | 支持 |
| 阿里百炼 | 支持 | 支持 | 支持 |
| 火山引擎 | 支持 | 支持 | 支持 |
| Vidu | 不支持 | 支持 | 支持 |
| 可灵 AI | 不支持 | 支持 | 支持 |

“支持”表示 Jellyfish 已有相应协议适配器，不代表同一 Model ID 能同时完成三类任务。每条模型记录只能选择一个类别，Model ID 必须确实具备该类别的能力。

### 4.1 本机当前模型配置快照

本机当前有两个活跃供应商，API Key 已配置但不会在接口和本手册中回显：

| 供应商 | 文本/通用 Base URL | 图片 Base URL | 视频 Base URL |
| --- | --- | --- | --- |
| 阿里百炼 | `https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1` | `https://token-plan.cn-beijing.maas.aliyuncs.com/api/v1` | `https://token-plan.cn-beijing.maas.aliyuncs.com/api/v1` |
| 火山引擎 | `https://ark.cn-beijing.volces.com/api/plan/v3` | 留空，回退到通用 URL | 留空，回退到通用 URL |

当前已录入模型：

| 供应商 | Model ID | 类别 | 当前用途 |
| --- | --- | --- | --- |
| 阿里百炼 | `qwen3.8-max` | 文本 | 当前默认文本模型 |
| 阿里百炼 | `wan2.7-image-pro` | 图片 | 可选图片模型 |
| 阿里百炼 | `happyhorse-1.1-i2v` | 视频 | 可选图生视频模型 |
| 火山引擎 | `doubao-seedream-5.0-lite` | 图片 | 当前默认图片模型 |
| 火山引擎 | `doubao-seedance-1.5-pro` | 视频 | 推荐设为默认视频模型 |
| 火山引擎 | `doubao-seedream-5.0-lite` | 视频 | 配置类别不匹配，不建议使用 |

当前全局设置为：文本默认 `qwen3.8-max`，图片默认 `doubao-seedream-5.0-lite`，视频默认值也指向了按“视频”类别录入的 `doubao-seedream-5.0-lite`，API 超时为 30 秒，日志级别为 `info`。

需要修正两项：

1. 把默认视频模型改为 `doubao-seedance-1.5-pro`；`doubao-seedream-5.0-lite` 是图片生成模型，不应作为视频模型。
2. 视频任务通常超过 30 秒。建议把全局 API 超时提高到 300 秒；异步任务仍会由后台轮询，但创建请求和中间网络请求也需要合理余量。

当前推荐组合：

- 文本：阿里百炼 `qwen3.8-max`。
- 图片：日常默认使用火山 `doubao-seedream-5.0-lite`；需要比较画面效果时可切换阿里 `wan2.7-image-pro`。
- 视频：日常默认使用火山 `doubao-seedance-1.5-pro`；需要图生视频对比时可选择阿里 `happyhorse-1.1-i2v`。

### 4.2 配置阿里百炼文本、图片和视频模型

先在阿里云百炼控制台开通模型服务、创建 API Key，并设置消费提醒。

在 Jellyfish 中进入“模型管理 → 供应商 → 添加供应商”：

| 字段 | 内容 |
| --- | --- |
| 名称 | `阿里百炼` |
| 文本/通用 Base URL | 标准百炼 Key 使用 `https://dashscope.aliyuncs.com/compatible-mode/v1`；本机 Token Plan 使用当前已配置地址 |
| 图片 Base URL | 标准百炼使用 `https://dashscope.aliyuncs.com/api/v1`；本机使用当前已配置的 Token Plan `/api/v1` 地址 |
| 视频 Base URL | 与图片 Base URL 相同 |
| API Key | 在本机页面粘贴百炼 API Key |
| API Secret | 留空 |
| 状态 | 活跃 |

Base URL 和 API Key 必须来自同一套服务。不要把标准 DashScope Key 与 Token Plan 地址混用，也不要把 Token Plan Key 填到标准 DashScope 地址。保存供应商后，“测试连接”会使用该供应商最近更新的文本模型发起低费用真实请求。

进入“模型”页分别添加模型：

| Model ID 示例 | 类别 | 说明 |
| --- | --- | --- |
| `qwen3.8-max` | 文本 | 剧本分析、角色检查、智能精简和提示词处理 |
| `wan2.7-image-pro` | 图片 | 文生图/参考图生成；走百炼图片接口 |
| `happyhorse-1.1-i2v` | 视频 | 图生视频；走百炼异步视频接口 |
| `happyhorse-1.1-t2v` | 视频 | 纯文本生成视频，3–15 秒 |
| `happyhorse-1.1-r2v` | 视频 | 参考图片/视频生成，2–10 秒 |

模型名称必须是供应商 API 接受的准确 Model ID，不要填写营销展示名称。文本模型可以设置 `{"temperature": 0.7}`；图片和视频参数优先在具体生成页面选择，未确认供应商是否接受的字段不要写进通用参数。

Token Plan 的 compatible-mode `/models` 可能不返回视频模型。当前版本会先尝试业务空间目录，再把实时结果与 Jellyfish 维护的官方目录合并，所以“阿里百炼 → 视频生成”应至少显示上述三个 HappyHorse 1.1 模型。条目会标注“实时目录”“官方目录”“已添加”；ASR、TTS 和实时语音模型不会再显示成文本模型。仍可手工输入 Model ID，但手工录入不等于该模型参数已经适配。

在视频实验室选择模型后，首帧、尾帧、关键帧、主体参考、画幅和时长会按该模型能力变化：t2v 不要求素材，i2v 必须选择首帧，r2v 必须选择参考图片或视频。HappyHorse r2v 和 Wan 2.7 还会显示“参考音频”，每个主体最多选择一条，音频必须与该主体的图片或视频一起使用，作为 `reference_voice` 音色参考。素材关联不是硬性要求；只有选择了素材且模型支持时才作为生成参考。

### 4.3 配置火山引擎文本、图片和视频模型

先在火山方舟控制台完成实名认证、开通对应模型、创建 API Key，并设置余额与用量提醒。

在“模型管理 → 供应商 → 添加供应商”中填写：

| 字段 | 内容 |
| --- | --- |
| 名称 | `火山引擎` |
| 文本/通用 Base URL | 标准方舟使用 `https://ark.cn-beijing.volces.com/api/v3`；本机按 Token Plan 使用当前已配置地址 |
| 图片 Base URL | 留空，默认回退到通用 URL |
| 视频 Base URL | 留空，默认回退到通用 URL |
| API Key | 在本机页面粘贴方舟 API Key |
| API Secret | 留空 |
| 状态 | 活跃 |

然后按实际能力分别添加模型：

1. 文本模型：填写豆包文本模型或推理接入点的准确 Model ID，类别选择“文本”。
2. 图片模型：本机为 `doubao-seedream-5.0-lite`，类别选择“图片”。
3. 视频模型：本机为 `doubao-seedance-1.5-pro`，类别选择“视频”。

不要因为同属“豆包”就复用类别：Seedream 用于图片，Seedance 用于视频。不同版本模型的 ID、尺寸、时长和比例能力可能不同，应以供应商控制台为准。

点击“添加模型”并选择火山引擎时，标准 Ark v3 会优先读取实时模型列表；本机 Token Plan 地址不提供 `/models`，遇到 404/405 时系统会自动显示内置的 `doubao-seed-2.0-lite`、`doubao-seedream-5.0-lite` 和 `doubao-seedance-1.5-pro`。这不会修改已保存的 Base URL、API Key 或计费通道；401/403 仍会直接提示，需检查密钥和模型权限。

### 4.4 配置默认模型

进入“模型管理 → 设置”：

- 默认文本生成模型：选择 `qwen3.8-max`。
- 默认图片生成模型：选择图片类别的 `doubao-seedream-5.0-lite`。
- 默认视频生成模型：选择 `doubao-seedance-1.5-pro`，不要选择同名的 Seedream 记录。
- API 超时：本机当前是 30 秒，建议调整为 300 秒，以覆盖图片和视频创建请求。
- 日志级别：日常使用选 `Info`，排障时临时改为 `Debug`。

保存后再开始剧本拆解和媒体生成。

### 4.5 测试方式与 API Key 安全

- 供应商“测试连接”和文本模型“测试生成”会发起真实的低费用文本请求。
- 图片、视频模型不在模型管理页直接试生成，应分别在图片工作台和视频工作台进行单任务测试，避免误触发高费用任务。
- 测试成功只证明本次请求可用，不代表所有比例、尺寸、参考图和时长参数都受该模型支持。

- 不要把 API Key 发到聊天、邮件、截图或 GitHub。
- 使用专门为 Jellyfish 创建的 Key，不要复用主账号管理密钥。
- 在供应商平台设置消费上限、余额提醒和调用告警。
- 当前版本不会在 API 响应中回显 Key，但 Key 保存在本地 Jellyfish 数据库中。能访问本机或 Docker 数据的人仍可能获得它。
- 当前界面的退出登录仍是占位功能，Jellyfish 不能作为带完整权限管理的公网服务使用。

## 5. 中文界面和基础设置

### 5.1 切换中文

在页面右上角语言菜单选择“中文”。语言选择保存在当前浏览器中。

### 5.2 系统设置

左侧进入“系统设置”，可以设置显示昵称和角色。当前这些字段主要用于界面展示，不构成真实的用户鉴权系统。

### 5.3 主要菜单

- 项目列表：创建和管理短剧项目。
- 资产管理：管理演员/角色图、场景、道具和服装资产。
- 提示词模板：维护可复用的图片、视频和分镜提示词。
- 模型管理：配置供应商、模型和全局默认模型。
- 系统设置：界面用户信息与偏好设置。
- 任务中心：查看文本、图片、视频异步任务的状态、耗时和结果。

## 6. 标准短剧制作流程

### 6.1 第一步：准备模型

在创建正式项目之前，至少配置一个默认文本模型。需要生成画面时，再配置默认图片和视频模型。

建议先做最小测试：

1. 文本模型完成一次短文本处理。
2. 图片模型生成一张测试图。
3. 视频模型只生成一个低成本测试片段。

测试成功后再批量运行，避免因模型 ID、余额、比例或权限错误造成大量失败任务。

### 6.2 第二步：建立提示词模板

进入“提示词模板”：

1. 先使用系统内置的演员、角色、场景、道具、服装、首帧、关键帧、尾帧和视频模板完成一次单镜头测试。
2. 需要定制时，不修改系统模板；复制思路新建同类别模板，设为默认后再预览验证。
3. 把稳定的画风、镜头语言和负面约束写入模板；项目特有的人物与剧情信息留在项目/镜头层。
4. 修改默认模板只影响之后的新渲染；已提交任务继续使用其冻结的最终提示词。

建议模板至少包含：

- 画面风格和时代背景。
- 人物一致性要求。
- 镜头景别、角度、运动方式。
- 画幅比例，如竖屏短剧常用 `9:16`。
- 禁止出现的字幕、水印、畸形手指和无关人物等约束。

当前生产链的实际使用关系如下：

| 模板类别 | 实际入口 | 作用 |
| --- | --- | --- |
| 演员/角色/道具/服装 | 资产详情生成图片 | 建立可复用身份或外观基准 |
| 场景正面/补充视角 | 场景详情生成图片 | 建立并补全稳定空间 |
| 首帧/关键帧/尾帧图片 | 章节生成工作台 | 分别控制触发、峰值和收束 |
| 视频提示词 | 视频提示词预览与视频生成 | 组织动作、运镜、对白和连续性 |

`分镜提示词`、`首/中/尾帧文案`、`配乐`、`音效`、`组合提示词`等类别当前并非全部接入生产调用链。可以在实验室试验，但不要仅因列表中存在就认为正式业务已经使用。系统暂不为未接通类别灌入默认模板，后续会先完成结构化任务、预览和快照，再开放系统默认值。

系统会按实际模型做少量必要适配：阿里百炼 Wan 2.7/3.x 的项目视频会自动加入单镜头声明，并按请求顺序生成“图1/视频1”参考映射；Vidu 的命名主体使用 `@主体名`。火山引擎等其他供应商不会被强行加入阿里或 Vidu 专有语法。适配发生在任务提交时，规则名保存在任务快照中；实验室自由提示词保持原样。

### 6.3 第三步：建立资产库

进入“资产管理”，优先建立会跨镜头复用的内容：

- 角色/演员：姓名、年龄、外观、服装和参考图。
- 场景：空间结构、时间、光线、色调和参考图。
- 道具：外观、材质、颜色和使用方式。
- 服装：所属角色、款式、颜色和适用场景。
- 配音音效：对白、旁白、配乐、环境声、音效和转场音频。

先建立核心人物和主场景，能显著降低后续跨镜头的人物漂移。

资产详情支持上传照片、视频、音频及 TXT/MD/PDF/DOCX 文档。上传默认只进入全局“文件管理”，不会自动绑定当前资产；文件的数据库记录保存在 MySQL，原始二进制保存在 RustFS 的 `files/` 对象路径中。以后需要使用时，进入任一资产详情的参考素材区域，点击“从文件管理选择”，即可按名称、类型和分页找到此前未关联的文件，再选择用途并关联。确实要立即用于当前资产时，也可在上传时勾选“上传后关联到当前资产”。

已关联素材可通过“参与推荐”开关随时停用，未关联或已停用不会阻塞文字生成。解除关联只删除资产关系，不删除全局文件；只有在“文件管理”中执行删除才会删除 MySQL 文件记录和 RustFS 原始对象，而且仍被资产或音频业务引用时会拒绝删除。

### 6.4 第四步：创建项目

进入“项目列表 → 新建项目”：

- 项目名称：使用清晰、唯一的名称。
- 项目简介：写明题材、时代、核心冲突和整体画风。
- 全局种子值：需要复现或统一风格时填写固定整数。
- 默认视频比例：竖屏通常选 `9:16`，横屏通常选 `16:9`。

### 6.5 第五步：创建章节并录入剧本

进入项目工作台：

1. 新建章节。
2. 粘贴完整剧本，或从项目工作台上传支持的剧本文档。
3. 检查人物名称是否统一。
4. 明确场景切换、对白和动作描述。
5. 保存原始剧本后再进行 AI 处理。

长剧本建议按章节拆分，避免一次提交过长导致成本增加或结构化结果不稳定。

### 6.6 第六步：AI 拆解分镜

在章节中执行分镜提取/拆解：

1. 发起文本处理任务。
2. 在任务中心观察状态。
3. 任务结束后检查镜头序号、标题、剧本摘录和摘要。
4. 必要时手动新建、编辑、排序或删除分镜。

不要直接接受所有 AI 结果。重点检查：

- 一个镜头中是否包含过多动作。
- 对白归属是否正确。
- 场景和时间是否发生隐式切换。
- 人物、道具、服装是否漏提取。

### 6.7 第七步：确认镜头候选信息

在分镜准备阶段：

1. 刷新或提取资产候选和对白候选。
2. 接受正确候选，忽略错误候选。
3. 优先关联已有角色、场景、道具和服装，避免重复创建。
4. 修正镜头标题、摘要、景别、动作和对白。
5. 完成必要项后将镜头推进到 ready 状态。

“准备完成”只表示镜头资料齐全，不代表图片或视频已经生成。

### 6.8 第八步：生成关键帧

进入章节生成工作台：

1. 选择一个 ready 镜头。
2. 检查关联角色、场景、道具、服装和参考图；只有明确关联并启用的图片才作为可选参考候选。
3. 选择首帧、关键帧或尾帧。
4. 编写基础提示词和镜头指令。
5. 先预览最终提示词，再确认生成。
6. 对结果标记“采用”或“废弃”。

每个镜头先生成少量候选图。确认人物和画风后再批量生成，可显著降低费用。

首帧、关键帧和尾帧现在会实际读取各自的默认图片模板，而不是只在“提示词模板”页面展示。新建同类别模板并设为默认后，重新点击提示词预览即可看到新模板生效；已经提交的任务不会被追溯修改。

### 6.9 第九步：生成视频

生成前检查：

- 默认视频模型已配置并测试成功。
- 镜头比例与模型支持能力一致。
- 已选择正确的关键帧/参考图。
- 视频提示词包含动作、运镜、节奏和时长方向。
- 供应商账户余额充足。

操作流程：

1. 打开视频提示词预览。
2. 检查生成快照中的首帧、尾帧、关键帧和显式启用的参考素材。
3. 修正提示词和画面运动描述。
4. 先对单个镜头发起测试任务。
5. 在任务中心等待完成。
6. 预览、下载并采用满意结果。
7. 单镜头流程稳定后再使用批量生成。

视频提示词按“上一镜头结束 → 当前触发 → 动作过程/峰值 → 当前结束 → 下一镜头目标”组织。关联素材是柔性参考：用于身份、外观、场景或动作一致性，不要求机械复刻；没有关联素材时仍可按文字生成。

视频生成通常是成本最高、耗时最长的环节。不要在模型或比例未经验证时直接批量提交。

如需配音或音效，先在“资产管理 → 配音音效”上传素材，再在章节工作台选中镜头，打开“音视频控制”，从素材库加入配乐、配音或音效，并设置开始时间、音量和循环。

音轨是可选后期增强：没有音轨时视频按原流程生成；有音轨时 Worker 在模型视频生成成功后使用 FFmpeg 合成新文件。原始视频不会被删除，合成失败也会回退原视频，不会让已经成功的模型生成任务变成失败。

### 6.10 第十步：任务和素材管理

任务中心用于：

- 查看排队、运行、成功和失败任务。
- 查看运行耗时和生成结果。
- 取消仍在运行且支持取消的任务。
- 返回对应项目、章节或镜头。

生成结果会进入文件/媒体和镜头关联体系。对于重要结果，应及时下载到独立素材目录，不要只依赖容器数据。

## 7. 成本控制建议

- 文本：按输入/输出 Token 计费，长剧本应按章节处理。
- 图片：通常按张计费，先生成低数量候选。
- 视频：通常按视频 Token、时长、分辨率或任务规格计费，是主要成本项。
- 在供应商控制台设置日限额、月限额、余额提醒和异常调用告警。
- 项目测试期使用性价比较高的模型；最终关键镜头再切换高质量模型。
- 固定人物参考图、画风模板和种子值，减少反复重生成。
- 失败任务也可能产生部分费用，应先排查失败原因再重试。

## 8. 日志与故障排查

以下命令均在 PowerShell 中执行。

先设置 Docker 命令路径：

```powershell
$env:Path = "E:\Docker\Desktop\resources\bin;$env:Path"
Set-Location "E:\JellyfishNew"
```

### 8.1 查看全部服务状态

```powershell
docker compose `
  --env-file "E:\JellyfishNew\deploy\compose\.env" `
  -f "E:\JellyfishNew\deploy\compose\docker-compose.yml" `
  -f "E:\JellyfishNew\deploy\compose\docker-compose.secure-local.yml" `
  ps -a
```

### 8.2 查看后端日志

```powershell
docker compose `
  --env-file "E:\JellyfishNew\deploy\compose\.env" `
  -f "E:\JellyfishNew\deploy\compose\docker-compose.yml" `
  -f "E:\JellyfishNew\deploy\compose\docker-compose.secure-local.yml" `
  logs --tail 200 backend
```

### 8.3 查看任务队列日志

```powershell
docker compose `
  --env-file "E:\JellyfishNew\deploy\compose\.env" `
  -f "E:\JellyfishNew\deploy\compose\docker-compose.yml" `
  -f "E:\JellyfishNew\deploy\compose\docker-compose.secure-local.yml" `
  logs --tail 200 celery-worker
```

### 8.4 常见故障

#### 页面打不开

1. 确认 Docker Desktop 正在运行。
2. 执行 `ps -a`，确认 `front` 为 Up。
3. 访问 `http://127.0.0.1:7788`，不要使用错误端口。
4. 查看 `front` 日志。

#### API 返回 500 或任务失败

1. 查看 `backend` 和 `celery-worker` 日志。
2. 检查默认模型是否已设置。
3. 检查 Model ID、Base URL 和 API Key。
4. 检查供应商余额、权限、地域和限流。

#### Redis 端口疑问

Windows 原有 Redis 使用 `127.0.0.1:6379`。Jellyfish 专用 Redis 在容器内部仍使用 6379，但 Windows 侧映射为 `127.0.0.1:6380`，两者互不影响。

#### Docker Hub 拉取失败

本机部署已通过以下本地 Dockerfile 使用镜像前缀：

- `deploy/docker/backend.local.Dockerfile`
- `deploy/docker/front.local.Dockerfile`

启动和升级必须同时加载 `docker-compose.secure-local.yml`，否则可能绕过本地镜像和安全端口配置。

## 9. GitHub Fork、本地二开与上游更新

本节适用于当前二开仓库。作者默认分支 `main` 较旧，当前开发基线是 `codex/0718`；不要把二开提交直接写入 `main` 或作者跟踪分支，也不要用 ZIP 覆盖 `E:\JellyfishNew`。

```text
作者 Forget-C/Jellyfish codex/0718（upstream/codex/0718）
          └── integration/codex-0718-local-port（迁移验证分支）
                └── local/stable-codex-0718（验证通过后的本地稳定分支）
```

约定：`upstream` 指向作者仓库；`origin` 指向自己的 Fork。

### 9.1 一次性安装和登录 GitHub CLI

本机目前没有 `gh`，打开普通 PowerShell：

```powershell
winget install --id GitHub.cli --source winget
```

关闭整个终端窗口，重新打开后执行：

```powershell
gh --version
gh auth login --hostname github.com --git-protocol https --web
gh auth setup-git
gh auth status --hostname github.com
```

浏览器已登录不代表命令行已登录。不要使用 `--show-token`，不要在命令、聊天或截图中保存 Token。

### 9.2 自动 Fork、配置远程并首次推送

以下远程配置只执行一次：

```powershell
Set-Location "E:\JellyfishNew"
gh repo fork Forget-C/Jellyfish --clone=false
$GitHubUser = gh api user --jq .login
git remote rename origin upstream
git remote add origin "https://github.com/$GitHubUser/Jellyfish.git"
git remote -v
```

预期 `origin` 是自己的 Fork，`upstream` 是 `https://github.com/Forget-C/Jellyfish.git`。如果提示远程已存在，停止重复执行，先用 `git remote -v` 检查。

确认环境文件不会上传，然后推送：

```powershell
git check-ignore deploy/compose/.env
git status --short
git branch --show-current
git push -u origin local/stable-codex-0718
$ReleaseTag = "local-stable-codex-0718-$(Get-Date -Format 'yyyyMMdd-HHmm')"
git tag -a $ReleaseTag -m "Jellyfish codex/0718 本地二开稳定版"
git push origin $ReleaseTag
```

`git check-ignore` 应输出 `deploy/compose/.env`，`git status --short` 应为空。Fork 只备份代码，不包含 MySQL、RustFS 和 `.env`。

### 9.3 每次更新前检查和备份

先确认任务中心没有执行中或排队任务：

```powershell
Set-Location "E:\JellyfishNew"
git switch local/stable-codex-0718
git status --short
$env:Path = "E:\Docker\Desktop\resources\bin;$env:Path"
$ComposeFiles = @(
  "--env-file", "E:\JellyfishNew\deploy\compose\.env",
  "-f", "E:\JellyfishNew\deploy\compose\docker-compose.yml",
  "-f", "E:\JellyfishNew\deploy\compose\docker-compose.secure-local.yml"
)
```

工作区必须为空。9.3 至 9.8 建议在同一个 PowerShell 窗口连续执行；如果中途重新打开终端，应重新执行上面的 `$ComposeFiles` 定义。记录更新前数据数量：

```powershell
docker compose @ComposeFiles exec -T mysql sh -lc 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" -N -e "SELECT ''projects'',COUNT(*) FROM projects; SELECT ''chapters'',COUNT(*) FROM chapters; SELECT ''models'',COUNT(*) FROM models; SELECT ''providers'',COUNT(*) FROM providers; SELECT ''generation_tasks'',COUNT(*) FROM generation_tasks; SELECT ''files'',COUNT(*) FROM files;"'
```

创建备份目录并备份 MySQL：

```powershell
$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$BackupRoot = "E:\JellyfishBackups\$Stamp"
New-Item -ItemType Directory -Path $BackupRoot -Force
docker compose @ComposeFiles exec -T mysql sh -lc 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --triggers "$MYSQL_DATABASE" | gzip -c > /tmp/jellyfish-before-update.sql.gz'
docker compose @ComposeFiles cp mysql:/tmp/jellyfish-before-update.sql.gz "$BackupRoot\jellyfish-before-update.sql.gz"
```

备份 RustFS 和配置：

```powershell
docker run --rm `
  -v jellyfish_rustfs_data:/source:ro `
  --mount "type=bind,source=$BackupRoot,target=/backup" `
  alpine sh -lc "tar -czf /backup/rustfs-data.tar.gz -C /source ."
Copy-Item "E:\JellyfishNew\deploy\compose\.env" "$BackupRoot\compose.env.backup"
Copy-Item "E:\JellyfishNew\deploy\compose\docker-compose.secure-local.yml" "$BackupRoot\docker-compose.secure-local.yml"
Get-ChildItem $BackupRoot
```

至少应看到数据库、RustFS 和两份配置备份。备份含密码，不要上传 GitHub。

### 9.4 获取作者代码并同步 Fork codex/0718

```powershell
git fetch --all --prune
git rev-parse upstream/codex/0718
git rev-list --left-right --count local/stable-codex-0718...upstream/codex/0718
git log --oneline --decorate --graph --max-count=20 --all
```

`rev-list` 左侧是本地独有提交数，右侧是作者新增提交数；右侧为 `0` 时无需更新。

```powershell
$GitHubUser = gh api user --jq .login
gh repo sync "$GitHubUser/Jellyfish" --source Forget-C/Jellyfish --branch codex/0718
```

如果同步冲突，不要添加 `--force`。本地二开只保存在 `local/*` 分支，Fork 的 `codex/0718` 只跟随作者。每次更新前在 GitHub 分支页核对作者最新活跃分支；若作者已把开发线合回 `main` 或建立更新分支，应先评估分支关系再改变基线。

### 9.5 临时分支合并和冲突处理

禁止直接合并到稳定分支：

```powershell
$UpdateId = Get-Date -Format "yyyyMMdd-HHmm"
$IntegrationBranch = "integration/upstream-$UpdateId"
git switch local/stable-codex-0718
git switch -c $IntegrationBranch
git merge --no-ff upstream/codex/0718
```

有冲突时：

```powershell
git status
git diff --name-only --diff-filter=U
```

解决原则：

1. 手写前后端以作者新架构为基础，重新嵌入本地功能，不能简单全部选择本地。
2. `front/openapi.json` 和 `front/src/services/generated/` 不手工拼接；先解决后端接口，再重新生成。
3. 先正确合并 `package.json`，再用 `pnpm install` 生成锁文件。
4. 保留 E 盘、本机监听及 `docker-compose.secure-local.yml`，同时吸收作者新增参数。
5. `.env` 不参与合并，不能被示例配置覆盖。
6. 数据库变更统一使用 Alembic revision；合并时先检查 `down_revision` 与迁移头，若作者新增迁移造成分叉，应创建 merge revision，不能覆盖作者迁移。
7. 作者删除或重构的接口，应按其替代链路迁移本地能力，不恢复整套旧接口。

每解决一个文件执行 `git add 文件路径`。全部解决后运行 `git status` 和 `git commit`。无法判断时：

```powershell
git merge --abort
git switch local/stable-codex-0718
```

不要使用 `git reset --hard`。如果作者重构了接口，必须把本地功能迁移到新架构并补测试；不要为了减少冲突恢复作者已经删除的旧路由。

### 9.6 重新生成客户端并测试

先用集成分支构建独立后端测试镜像并运行完整测试：

```powershell
Set-Location "E:\JellyfishNew"
docker build -f deploy/docker/backend.local.Dockerfile -t jellyfish-backend-update-test .
docker run --rm jellyfish-backend-update-test uv run --group dev pytest -q
```

如果后端 API、路由或 Schema 有变化，切换前先从刚构建的测试镜像直接导出 OpenAPI，避免误读仍在 8000 端口运行的旧服务：

```powershell
docker run --rm `
  --mount "type=bind,source=E:\JellyfishNew\front,target=/front" `
  jellyfish-backend-update-test `
  uv run python -c "import json; from pathlib import Path; from app.main import app; Path('/front/openapi.json').write_text(json.dumps(app.openapi(), ensure_ascii=False), encoding='utf-8')"
Set-Location "E:\JellyfishNew\front"
pnpm install --frozen-lockfile
pnpm run openapi:gen
pnpm run build
```

这样生成的是集成分支的新接口，而不是当前仍在运行的旧容器接口。新后端正式运行到 8000 端口后还必须执行一次 `pnpm run openapi:update`，并用 `git diff --exit-code front/openapi.json front/src/services/generated` 确认服务契约与已生成客户端一致。如果冻结安装失败，先检查 `package.json` 冲突，再运行 `pnpm install` 并核对锁文件；pnpm 要求放行依赖安装脚本时，只批准项目锁定的必要包，不要启用全局无限制脚本。

任何测试或构建失败都不要迁移数据库。若重新生成产生合理修改：

```powershell
git add -A
git status
git commit -m "chore: resolve upstream integration and regenerate clients"
```

没有修改时跳过提交；提交前确认 `.env` 未出现。

### 9.7 构建、迁移、重启及自动验证

测试通过且备份存在后：

```powershell
Set-Location "E:\JellyfishNew"
docker compose @ComposeFiles up -d --build
docker compose @ComposeFiles ps -a
docker compose @ComposeFiles logs --tail 200 backend-migrate backend-seed-system-data backend celery-worker front
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8000/health
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8000/openapi.json
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:7788/
```

必须满足：

- `backend-migrate` 和 `backend-seed-system-data` 均为 `Exited (0)`。
- MySQL、Redis 为 `healthy`。
- 后端、Worker、Beat、前端均为 `Up`。
- 三个 HTTP 请求均返回 `200`。
- 日志无迁移失败、表不存在、Traceback 或前端启动失败。
- `generation_dispatch_outbox` 等统一生成表的 `created_at`、`updated_at` 默认值为 `CURRENT_TIMESTAMP`；否则章节智能操作会在创建任务时回滚，任务中心也不会产生记录。
- `celery-beat` 日志应周期出现 `task.dispatch_generation_outbox` 调度；新任务通常在下一个10秒周期内获得 `executor_task_id`。若任务长期为 `pending` 且 outbox 的 `dispatched_at` 为空，应先检查 Beat，而不是修改模型密钥。

重新执行 9.3 的数量 SQL，确认项目、章节、模型、供应商、任务和文件没有异常减少。浏览器按 `Ctrl + F5`，人工验证：

1. 项目、章节、分页及增删改刷新。
2. 模型默认设置、连接测试和文本调用。
3. 任务中心全部状态、类型筛选、分页、收起和展开。
4. 剧本上传和智能拆解。
5. 资产附件上传、停用、排序和解除关联。
6. 配音音效上传、试听及镜头音轨。
7. 图片生成使用或全部取消推荐图。
8. 先用单个低成本镜头验证视频和音轨合成，再批量生成。

不要执行带 `-v` 的 `docker compose down`。

### 9.8 验证通过后固化并推送

```powershell
git status --short
$IntegrationBranch = git branch --show-current
git switch local/stable-codex-0718
git merge --ff-only $IntegrationBranch
git push origin local/stable-codex-0718
$ReleaseTag = "local-stable-codex-0718-$(Get-Date -Format 'yyyyMMdd-HHmm')"
git tag -a $ReleaseTag -m "Jellyfish 上游更新合并验证版"
git push origin $ReleaseTag
```

确认 Fork 能看到稳定分支和标签后才算完成。

### 9.9 更新失败和回退

尚未迁移数据库时，执行 `git merge --abort` 并切回稳定分支即可。已经迁移数据库时，不要自行恢复 SQL、删表或删卷；保留日志和备份，再判断只回退代码还是停服恢复 MySQL、RustFS。恢复数据库会覆盖现有数据，必须再次人工确认。

### 9.10 官方参考

- GitHub CLI Windows 安装：<https://github.com/cli/cli/blob/trunk/docs/install_windows.md>
- GitHub CLI 登录：<https://cli.github.com/manual/gh_auth_login>
- 自动 Fork：<https://cli.github.com/manual/gh_repo_fork>
- 同步 Fork：<https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/working-with-forks/syncing-a-fork>
- 合并冲突：<https://docs.github.com/en/get-started/using-git/resolving-merge-conflicts-after-a-git-merge>

任何情况下都不要把 API Key、数据库密码、`.env`、SQL 备份或 RustFS 备份推送到 GitHub。

## 10. 备份与恢复原则

需要备份三类内容：

1. 源码和本地部署覆盖文件：`E:\JellyfishNew`。
2. 数据库：项目、章节、分镜、模型和任务记录。
3. RustFS 对象：上传图片、参考图、生成图片和视频。

Docker 数据位于 `E:\Docker\DockerData` 的 WSL 虚拟磁盘中，但不建议只依赖复制正在运行的虚拟磁盘作为业务备份。

推荐策略：

- 每周进行一次数据库逻辑备份。
- 重要视频和图片生成后立即另存到普通素材目录。
- 更新代码或修改数据库结构前做一次完整备份。
- 恢复操作、删除卷或替换 WSL 虚拟磁盘前必须人工确认。

## 11. 当前版本限制

- Jellyfish 不自带免费模型，需要第三方 API。
- 当前没有完整的登录、权限和多用户隔离机制。
- 不应直接暴露到公网或不可信局域网。
- 截帧、合并分镜等部分剪辑按钮仍属于实验或 Mock 状态；镜头音频素材与音轨已持久化并可在视频生成完成后自动合成。
- 模型供应商可能调整 Model ID、价格和 API 参数，应以供应商官方控制台为准。
- API Key 虽然不会从读取接口回显，但当前保存在本地数据库中，应保护 Docker 数据和 Windows 账户。

## 12. 安全操作清单

以下操作必须先确认目标和备份，再执行：

- 删除项目、章节、分镜或素材。
- 删除模型供应商或更换 API Key。
- 执行带 `-v` 的 Docker Compose 删除命令。
- 删除 `E:\Docker\DockerData` 或 WSL 虚拟磁盘。
- 修改 Windows 防火墙并将 Jellyfish 开放到局域网/公网。
- 使用数据库 root 账户连接外部数据库。
- 覆盖 `.env`、安全覆盖 Compose 文件或本地 Dockerfile。

## 13. 快速检查清单

开始制作前：

- [ ] Docker Desktop 正常运行。
- [ ] Jellyfish 所有长期服务为 Up。
- [ ] MySQL 和 Redis 为 healthy。
- [ ] 文本、图片、视频默认模型已按需要设置。
- [ ] API Key 有效且余额充足。
- [ ] 项目画幅比例正确。
- [ ] 核心角色和场景参考资产已建立。

批量生成前：

- [ ] 单个文本任务测试成功。
- [ ] 单张图片测试成功。
- [ ] 单个视频测试成功。
- [ ] Model ID 和比例与供应商能力一致。
- [ ] 已设置供应商消费告警。

更新或维护前：

- [ ] 没有运行中的生成任务。
- [ ] 重要素材已另存。
- [ ] 数据库和对象存储已备份。
- [ ] 已检查 Git 状态。
- [ ] 不会删除 Docker volumes。

---

项目主页：<https://github.com/Forget-C/Jellyfish>
本地前端：<http://127.0.0.1:7788>
本地 API 文档：<http://127.0.0.1:8000/docs>
资产管理除演员、角色、场景、道具和服装外，还提供“配音音效”页。音频可按角色配音、旁白、背景音乐、环境声、音效和转场音分类，并支持试听、搜索、分页、编辑和删除。

进入任一演员、角色、场景、道具或服装的详情页，可在“参考素材（照片 / 视频 / 文档 / 音频）”区域上传：

- 图片：JPG、PNG、WebP、GIF。
- 视频：MP4、MOV、MKV、AVI、WebM。
- 音频：MP3、WAV、M4A、AAC、OGG、FLAC。
- 文档：TXT、Markdown、PDF、DOCX。

上传可以选择“仅上传”或“上传并关联”。仅上传的文件统一进入左侧“文件管理”；下次进入资产详情，点击“从文件管理选择”，可搜索、按类型筛选、分页预览并重新关联，不需要重复上传。关联时选择素材用途并填写参考说明，例如“只参考动作，不参考人物脸部”。可以指定主参考图、调整顺序，或关闭“参与推荐”。解除关联不会删除底层文件；底层文件仍可在文件管理中查看。

图片缩略图采用完整适配而不是裁切，可通过“预览”查看大图。音频提供网页试听。TXT、Markdown、PDF 和 DOCX 提供只读预览，其中 DOCX 只提取正文；复杂排版仍以下载原件为准。视频预览支持 Range 分段加载；若上传的是 HEVC、MOV、MKV、AVI 等浏览器兼容性较差的格式，首次预览会按需生成 H.264/AAC MP4 缓存副本，下载仍是原始文件。

关联不是硬性要求。没有参考素材时仍按文字生成；有关联时按模型真实能力智能使用：资产图片生成读取启用的参考图片，并把素材说明/文档正文作为软提示词；分镜视频生成会从镜头关联的角色、演员、服装、场景和道具中读取启用素材，只有供应商模型支持对应图片、视频或参考音频时才传给 API。显式手工选择优先于自动推荐，不支持的素材不会强行发送。
