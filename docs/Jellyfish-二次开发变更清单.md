# Jellyfish 二次开发全量变更清单

## 2026-09-08 新电脑部署与数据迁移说明（LC-001 / LC-014）

工作树待提交批次。新增 docs/Jellyfish-新电脑部署与数据迁移.md，主手册、Windows说明与升级 SOP 已设置入口。区分空库和旧数据恢复；覆盖旧机冻结/备份/校验、未提交二开、WSL/Docker与数据盘、新机配置、先恢复后迁移、延迟启动worker/beat、文件验收及双机/回滚/清理边界。迁移先恢复同版本，不顺带更新上游；日常脚本只适用于已创建容器。主手册补充 run --rm 后一次性容器不存在属正常。

本批仅文档，依据当前 Compose、Dockerfile、迁移入口及 Docker 官方安装/WSL/Compose说明核对；检查代码块 PowerShell 语法和文件链接，不代表新机部署/备份恢复演练通过。未安装软件、未迁移/重启、未推送或调用模型；既有 PL 待办不变。换电脑后需更新本记忆实际路径/版本/数据快照。

## 2026-09-08 启停说明统一（LC-001 / LC-014）

工作树待提交批次。直接改正中文手册第3节：日常启动/停止统一调用根目录 CMD 的共享 PowerShell 实现，不再推荐 compose up -d 作为 start 的等价替代；停止实际旧命令是 compose stop，不是 down。新增重启、加载 .env、代码部署、上游升级的边界表，修正“启动必须加载安全覆盖”的泛化说法，并为第9节全栈升级示例补充备份、隔离验证、迁移与数据容器重建范围的前置条件。

当前事实：日常脚本沿用已有容器环境与镜像，不加载修改后的 .env；运行状态查询加载 Compose 不等于配置生效。配置修改需要审查后重建受影响服务，数据库/存储凭据需协调变更。WINDOWS-SCRIPTS.md 同步；本批只改文档，不改脚本行为、不启停/重建/迁移/推送。验证为原章节与脚本对照、旧歧义检索及差异检查；既有12项模拟测试是前批证据，本批未重跑业务测试。所有 PL 待办保持。

## 2026-09-08 Windows 脚本复查修正（LC-001 / LC-014）

工作树待提交批次：共享脚本新增 API/页面 HTTP 就绪检查和最终容器复核，避免 running 即报成功；停止/提交前输入 YES 确认，自动化需显式 -Yes，Preview 始终只读；add 后再次检查实际索引敏感路径。三份根目录 CMD 入口路径与退出码处理正确，保留不变。详细用法见根目录 WINDOWS-SCRIPTS.md。

12 项隔离模拟测试、三项本机只读预览、UTF-8 BOM 检查通过。未实际启停、暂存、提交、推送、迁移或调用模型。停止仍需人工确认任务已结束；推送包含全部未忽略改动，文件名防护不能代替源码内容密钥审查。当前 personal origin 与固定分支通过本地预览，未验证远程登录权限。所有业务 PL 待办保持不变。

## 2026-09-08 Windows 一键脚本（LC-001 / LC-014）

工作树待提交批次。新增根目录 Start-Jellyfish.cmd、Stop-Jellyfish.cmd、Push-Jellyfish.cmd，以及 scripts/windows/Jellyfish.ps1、Test-Jellyfish.ps1、WINDOWS-SCRIPTS.md。从入口位置定位仓库，关键函数/操作含中文注释；脚本带 UTF-8 BOM 兼容 Windows PowerShell 5.1。

启停仅恢复/停止七个现有常驻容器，按数据服务健康→应用启动、应用→Worker→数据停止排序；不调用 Compose up、迁移、seed、构建或删除卷。按项目/服务标签查找且在操作前核对全部归属。现场 RustFS 仍标旧 E:\Jellyfish\deploy\compose，但使用 jellyfish_rustfs_data:/data 并与当前后端共享网络；脚本仅在每次核实这两项及当前后端目录后兼容该历史容器。

提交入口固定个人 origin https://github.com/15802964985/Jellyfish.git 与 local/stable-codex-0718，执行 add -A / staged diff check / 有差异才 commit / 普通 push。检查冲突和常见敏感文件路径，失败中止，不自动切分支、合并或强推；不代替源码密钥审查、业务测试及 LC/PL 语义同步，输出真实 HEAD 供提交追溯。

验证：三项生产现场只读 Preview、七项隔离模拟测试通过（启停/提交顺序、错误远程、敏感文件、diff失败、stop失败）。未实际启停、暂存、提交、推送、迁移、生成调用；本批无需 OpenAPI 或前后端业务测试。已同步手册、架构摘要及项目记忆。既有246条状态记录保留，不归为本批实现；所有未关闭 PL 保留，无新增业务计划。上游迁移需保留或兼容脚本的现有容器/数据保护及个人仓库边界。

## 2026-09-08 项目记忆与跨目录/新对话交接（LC-014）

工作树待提交批次。新增根目录 [PROJECT_MEMORY.md](../PROJECT_MEMORY.md)，作为随代码迁移的上下文入口：核心目标、业务/状态边界、Git 与历史部署快照、LC 能力索引、PL-001～PL-014 当前未关闭事项、模型/费用/安全规则、升级 SOP 摘要、新对话开场指令及同批维护检查。后续编号动态枚举，不以此范围封顶。

AGENTS.md 新增接手必读和同批更新规则；架构摘要、中文手册与升级 SOP 同步入口。明确文档不是聊天平台自动永久记忆，也没有新增后台同步程序；新对话必须读取正确目录或由用户提供文件。只读核对分支 local/stable-codex-0718、HEAD 53f8da8414dcc69c50961a1b26ad29bcbc1f0d0d，保留已有大量未提交二开。历史部署/测试均标来源，不冒充本轮重新验证。

范围：仅文档与项目协作指引，无业务代码/API/模型配置变更，无数据库迁移、部署重启、付费调用、备份清理；未关闭任何业务 PL。验证为交接入口、相对链接及本批差异核对，不以此宣称运行功能重新验收。上游迁移需保留或兼容该记忆入口，并按最新实现刷新内容。

## 2026-09-08 总览筛选下拉菜单被遮挡（LC-011 / PL-014，已修复并部署）

工作树待提交批次。用户反馈总览四个筛选框无选项；核对API仍返回67条型号/11个场景，组件选项存在。根因：本地Ant Design 5.10.0的Select默认zIndexPopup为1050，低于总览Drawer的1200；菜单挂到body后被抽屉遮挡，并非模型目录丢失。

- 修复：ModelSelectionGuide局部ConfigProvider统一设置Select菜单层级为GUIDE_LAYER+50（1250），覆盖四个筛选框及Pagination每页条数菜单。保留body挂载，避免抽屉滚动容器裁剪；不改全局主题，不影响其他弹窗。
- 测试：前端16项通过、tsc与生产构建通过（仅既有大bundle警告）。新增四类选项非空、筛选结果、局部菜单层级高于抽屉、页脚分页继承主题的组件契约测试。测试转译target修正为与生产一致的ES2020，避免ES5下Map迭代造成测试假空列表。
- 部署：15:34（北京时间）仅构建并替换front；线上index-DrsraUNG.js及首页HTTP200，镜像446bda5c3b69。backend/worker/beat未重启，数据库、配置、默认模型及生成任务未修改，无收费调用、无迁移。旧前端镜像保留为jellyfish-front:rollback-overview-dropdown-20260908；未删除备份。
- 实机边界：本轮浏览器工具两次启动退出，未取得实际点击/截图证据；不将组件测试、静态资源检查写成浏览器验收。下一步用户Ctrl+F5后检查四个菜单、选择后筛选、每页条数及关闭重开。原PL-014未完成项保留。
- 迁移定位：front/src/pages/aiStudio/models/ModelSelectionGuide.tsx；front/tests/modelOverviewLifecycle.test.cjs。未来上游升级需保留或兼容该局部弹层规则，不靠增加模型数据解决遮挡。

## 2026-09-08 场景选型改为完整模型总览（LC-011 / PL-014，已部署）

工作树待提交批次：本轮在 E:\JellyfishNew 调整模型选型。用户追加“部署重启”授权后，2026-09-08 15:17（北京时间）构建并替换backend/celery-worker/celery-beat/front，本节总览已部署至7788。未修改生成执行链、数据库、凭据或默认模型；未运行迁移/seed，未调用收费模型。

部署验收：前后端health/首页200；model-overview国产范围62条（已保存7、未配置55）、全部厂商67条（已保存7、未配置60），均有11个场景；线上OpenAPI与index-aOZLRtSh.js均已更新并可读取。Celery ping为pong（1节点）。数据库revision仍为a7b9c1d3e508，任务计数仍为成功29/失败14/取消4；MySQL/Redis/RustFS容器ID及启动时间未变。

回滚保障：四个旧应用镜像保留为jellyfish-<服务>:rollback-overview-20260908-1515（服务为backend、celery-worker、celery-beat、front），既有备份未删除。新镜像前缀：backend a36155fa4588、worker 64a7cf54b7af、beat c5fbcdde9919、front f3161e072fd7。无需数据库回滚；如需回退只切应用镜像，不清空或还原业务卷。

- 新增只读 GET /api/v1/llm/model-overview，将离线精确型号目录与全部已保存模型、供应商合并；不依赖模型列表的分页/搜索，无模型配置也显示目录。默认国产，空数据库返回62个国产“型号＋类型”条目，可切全部厂商。
- 以供应商协议＋精确型号＋类别为唯一行，同型号多个账户分别展示、编辑；同名图片/视频不合并。分别呈现系统接入、配置状态、场景、使用限制、账户条件和官方文档。未配置、已保存待完善/核验、已配置待实测不混用；没有当前配置的真实验收证据时不冒充验证通过。
- 已保存目录外型号保留并标记待核验，不能借供应商默认媒体能力获得认证；自助兼容文本保留“协议适用方向”，不认证精确型号。无离线精确目录的厂商明确提示覆盖边界，不抓取凭据去自动发现型号。
- 拆出 builtin_provider_catalog 与原静态目录发现复用，保留阿里实时混合、火山404目录回退、DeepSeek实时目录路径；补齐已映射万相2.7图片、千问3.8文本与DeepSeek V4文本目录。MiniMax人物参考、即梦图片公网导出等PL-014待办仍未关闭。
- 前端由场景单项切换改为多列总览；支持场景、生成类型、供应商、配置状态、型号/账户搜索；已保存优先，分页固定Drawer页脚（8/16/32），切筛选回首页，关窗取消请求并丢弃旧响应。读取失败可重试，不持续转圈。
- 未配置型号：有供应商时预填型号/类型、多个账户时由用户选择；无供应商时引导到供应商页。已保存型号按ID实时读取编辑，不依赖当前分页或搜索结果。上述操作只打开表单，不自动保存、购买或改变默认路由。
- 迁移定位：backend/app/core/contracts/model_recommendations.py、core/integrations/model_catalog.py、services/llm/{model_overview,scenario_recommendations}.py、api/v1/routes/llm.py；front/src/pages/aiStudio/models/{ModelSelectionGuide,modelOverviewFilters,ModelsTab,ModelManagement}；OpenAPI及generated客户端；test_model_overview.py、modelOverviewFilters.test.cjs、modelOverviewLifecycle.test.cjs。
- 验收分层：代码与离线测试已执行，部署健康/API/静态资源检查已通过。此前浏览器工具两次因本机sandbox deny-read ACL错误退出，仍未取得浏览器截图或实机交互验收证据；不能用组件模拟或HTTP检查代替。未做收费调用，未删除任何备份。

编码阶段自检：全量后端590项通过；前端15项通过（含筛选、多个账户预填、关闭重开旧请求、失败重试与页脚分页契约）；OpenAPI/客户端重新生成，tsc及生产构建通过，仅既有大bundle警告。补修多个匹配账户选择时型号预填被清空的问题。18765隔离schema服务已关闭；15:17部署已完成，浏览器实机与真实生成验收仍待完成。

目录来源补核（2026-09-08）：[DeepSeek当前API型号](https://api-docs.deepseek.com/)；[百炼文本模型](https://help.aliyun.com/zh/model-studio/text-generation-model/)；[万相2.7图像API](https://help.aliyun.com/zh/model-studio/wan-image-generation-and-editing-api-reference)。这些是协议/目录来源，不代表账户余额、免费额度或已完成所有高级功能。

## 2026-09-08 国产供应商扩展（PL-014，已部署，真实生成待验收）

本批修改位于 E:\JellyfishNew，工作树待提交。用户追加授权“现在部署重启”后，2026-09-08 14:17（北京时间）已重新构建并替换 backend、celery-worker、celery-beat、front；仅应用服务重启，未运行迁移/seed、未修改模型配置、未购买或调用收费模型、未外发素材、未删除备份。

部署验收：前端7788、后端两处health均HTTP 200；场景建议接口返回11项、供应商支持接口返回16项；线上OpenAPI包含model-scenarios及requires_last_frame；前端资产index-DOMcQMbP.js可读取；Celery ping返回pong（1节点）。MySQL/Redis/RustFS启动时间未变；数据库revision仍为a7b9c1d3e508，任务计数仍为成功29/失败14/取消4，无进行中任务。镜像前缀：backend d2293f4d7b08、worker 513c282921dd、beat 3ccd121c95bc、front b6042c0ddb2d。

四个旧应用镜像保留为 jellyfish-<服务>:rollback-pl014-20260908，未清理业务卷或备份。部署健康验收不等于真实浏览器交互、账户额度或收费生成验收；以下PL-014未完成项仍保留。

- P0：新增 GET /api/v1/llm/model-scenarios（生成客户端调用）；场景选型从全部已保存模型计算，不受列表搜索/分页影响，区分禁用、缺少凭据、错误端点、能力不匹配和未知型号。页面默认国产，展示候选理由及官方文档，不冒充质量排行榜/免费额度核验，不修改默认模型。
- P1：MiniMax 文本复用原链；image-01/image-01-live 标准档文生图；Hailuo-2.3/Fast/02 视频提交→轮询→文件查询；HTTP TTS speech-2.8/2.6/02/01 的 hd/turbo 返回 hex MP3，接入镜头配音/音轨保存链。必须显式选择账户对应端点，配音配置 audio_endpoint 与 voice。
- P2：智谱 GLM 文本接入通用聊天/剧本链；GLM-Image/CogView 原生文生图；CogVideoX-3 文生/首帧/首尾双帧异步视频，5/10秒。明确不把图片类别当作支持参考图。
- P3：混元采用 2026-09 官方 TokenHub 中国站协议（不自动迁移旧账户），HY 文本、hy-image-v3（最多3图参考）、hy-video-v1.5（5秒720p文生/首帧）；即梦独立 Visual AK/SK 签名，t2i_v40_jimeng 标准2K单图、jimeng_i2v_first_tail_v30 的720p首尾双帧5/10秒。
- 共用原生成任务、受控文件解析、图片/视频结果归档和业务发布；新增 requires_last_frame 从能力→API→工作室/实验室校验。新厂商不支持的素材、数量、时长、档位及最终提示词预算在提交前拦截；网络/结果错误不自动重复提交。不对既有厂商强套新门禁。
- 凭据：扩展执行期 ProviderConfig.api_secret（repr 隐藏 AK/SK），仅通过当前凭据引用读取；不写任务快照。现有 Provider 已有 api_secret 列，因此本批无新增数据库迁移。Pillow 新增到 pyproject/uv.lock，用于参考图片格式、尺寸、比例检查。
- 官方核查：新增国产文档域名白名单（保持无凭据、限制大小、不跟随重定向）；配置弹框增加开通/购买前置说明；未实现“自动读网页后自动修改接口代码”，旧 PL-007 待办仍保留。
- 最终自检：后端全量571项通过（新增45项国产适配定向用例），前端刷新/帧图回归7项通过；OpenAPI/客户端重新生成，tsc及生产构建通过（保留既有大bundle提示）。补测未知旧厂商型号不得借默认能力获得推荐。关闭了仅用于导出schema的18765临时服务，未停止生产服务。Mock不代表真实账户权限、出片质量、实际费用或浏览器验收。

### PL-014 未完成项及下一步（升级迁移必须携带）

1. MiniMax 人物参考协议已有适配代码，但业务尚无显式人物语义确认入口；当前拒绝通用素材，场景推荐不声明可用。补充入口和证据后再开放，不能把场景/服装图当人物脸。
2. 即梦图片4.0官网要求公网 image_urls；当前本地 RustFS 文件不能直接被厂商访问。当前仅文生图，公网签名导出需单独安全方案/授权；不开放匿名桶或偷偷第三方上传。视频双帧支持本地 Base64，不依赖公网导出。
3. 高分辨率扩展、MiniMax S2V 主体参考、音色克隆、其他语言/情绪精细矩阵、火山独立 TTS、音乐音效仍待后续接入；不要标成全部音频能力。
4. 远程取消/退款不作保证；本地取消停止等待，已提交远端可能继续计费。远程任务 ID 尚未实现提交即持久化和进程崩溃后接续轮询；不得宣传自动恢复或自动重提。
5. 用户实际账户的小额授权验收、真实浏览器交互、跨型号结构化剧本质量、产物质量和片段音轨对齐待验证。API 额度统一未核实；未承诺附件中的免费额度仍有效。
6. 剪映仅作为后期交接工具，不注册模型；PixVerse 区域/账户归类未定，本批不纳入国产推荐。已有百炼、方舟、可灵、Vidu 不重复建供应商。
7. 上游升级按既定流程智能对比并迁移本批文件、生成契约、测试和文档；不得整目录覆盖、漏迁未完成项或未经验证删除旧备份。

主要代码：backend/app/core/integrations/{minimax_images,minimax_video,minimax_speech,domestic_media,jimeng_media}.py；core/contracts/{provider,model_recommendations}.py；services/llm/{scenario_recommendations,provider_bootstrap,provider_resolver,integration_audit,documentation}.py；services/generation/{domestic_preflight,prompt_budget,gate}.py；core/tasks 的注册/分派；shot_tts、image_task_runner、generated_video 的执行凭据；front/src/pages/aiStudio/models/{ModelSelectionGuide,DomesticProviderSetup,ProvidersTab}.tsx；ChapterStudio、VideoExperimentMode；测试 test_domestic_provider_media.py、test_provider_execution_matrix.py。对应 LC-010/LC-011/LC-012/LC-014，计划 PL-014，不覆盖 PL-007/PL-013 历史与待办。


## 2026-09-08 部署确认（PL-013，当前运行版本）

已获用户授权，约 11:51（北京时间）从 E:\JellyfishNew 构建并替换 backend、celery-worker、celery-beat、front；部署后健康及资源核验通过。本节部署状态优先于下方历史“候选未部署”记录。工作树待提交，本次未变更业务代码。

- 使用同一 jellyfish Compose 项目、.env 和 secure-local 覆盖，执行 up -d --no-deps --no-build --timeout 60，仅替换应用四服务。未运行数据库迁移/初始化，未重启 MySQL、Redis、RustFS，未删除业务卷或既有备份；迁移版本仍为 a7b9c1d3e508。切换前没有 pending/running/streaming 生成任务。
- 后端 /health、/api/v1/health、前端首页及新 JS 均 HTTP 200；前端 index-C0l3Rg-U.js 包含编辑接口。线上 OpenAPI 已出现 video-edit-preflight、quality-review、video-edits、video-edits/{task_id}/adopt；Celery Worker ping 返回 pong，定时任务正常投递执行。
- 运行镜像摘要（sha256 前缀）：backend f847190a2b15；worker 0eb771c74f0a；beat a8306190fe27；front 28dbf18299c3。四个原镜像均保留 rollback-pl013-20260908 标签；不自动清理。
- 验证边界：这是部署/健康验收，不是付费端到端验收。未调用收费模型，未修改模型配置；真实浏览器交互、真实编辑输出/音轨对齐仍待验收，PL-013 不整体关闭。此前 526 项后端、7 项前端及隔离音轨验证保持为代码自检证据。

## 2026-09-08 PL-013 连续实施：质量预检与双供应商视频编辑（候选未部署）

本节是最新状态，覆盖下方同日旧进度，关联 LC-012/LC-015/PL-013。没有修改真实数据库、默认模型、生产服务或备份；工作树尚未提交。代码完成情况与实机/付费验收分开记录。

- P0：`quality_sources.py` 扩展项目、镜头细节、邻镜头、演员及 ScriptImport 文件哈希；`prompts/renderers.py` 预览报告展示来源与警告；`gate.py` 校验来源指纹、旧批量入口补规则并修复跨镜头帧槽位验证。`quality.py` 增补时长节奏和画面/声音职责。新增 `prompt_budget.py`，对已核验精确型号超限拦截，未知型号保留 unknown，不截断事实。
- P1：新增 `quality_review.py`、`quality_vision.py` 和 `QualityReviewPanel.tsx`；首/关键/尾帧与视频提示词窗口接入可选预检。文本走既有模型协议；图文限定已核验 Qwen 型号、显式勾选图片；请求需外发/费用确认。缓存包含模型 revision、来源文本、图片版本；人工重试生成独立编号，不自动重试或应用建议。
- P2：新增 `fal_video_edit.py`、`runway_video_edit.py`、`video_edit_registry.py`；扩展 provider 注册、目录、模型 revision、默认值限制和执行器校验。编辑专用模型不冒充 video_generation，普通实验室和默认模型选择排除它们。
- P2：新增 `video_edit_runtime.py`、`video_edit_preflight.py`、`video_edit_audio.py`、`video_edit_adoption.py`、`VideoEditPanel.tsx`。源视频/参考图片 file_id 冻结、免费实际规格检查、单次收费提交、凭证轮询、取消、归档、历史、新旧对比、CAS 人工采用、源文件保留。Runway 参考图有秒数位置，原音轨在本地合成，原始付费结果先持久化。
- 契约/API：`GenerationOperation` 新增 video_edit/quality_preflight；新增 VideoEditMediaInput/VideoEditOperationInput；GenerationSubmitRequest 增加可空 quality_source_fingerprint/quality_review_retry_id。`studio/generation_tasks.py` 新增预检、编辑输入检查、提交和采用路由。OpenAPI 与前端 generated 客户端已同步。现有 JSON/TaskLink/Artifact/File 表承载，无新增数据库迁移。
- 安全：凭据不写任务快照；新 worker 错误脱敏；不把附件放第三方公共对象存储，不自动切换 Plan/标准计费地址；取消不等于退款；未知提交不自动重复收费。
- 验证：全量后端 **526 项通过**，既有前端任务/图库 **7 项通过**；新增协议、来源指纹、输入限制、采用隔离、Worker 单次提交/取消、文本/视觉输入、模型保存/默认隔离与预算回归；前端生成客户端、类型与生产构建通过。`backend/scripts/verify_video_edit_audio.py` 在无网络、只读临时 Docker 中完成合成素材音轨测试（3.008秒、1280×720、AAC）；不等于真实模型产物已验收。浏览器工具启动失败两次，未验收真实 UI；收费小样与部署未执行。
- 迁移要求：上游更新时将注册/契约/门禁/任务执行/产物采用/前端入口作为一条链智能合并，不能只拷贝 UI 或适配器；先检查上游是否已提供同等能力。重新生成客户端，不人工合并生成文件。保持旧快照兼容、原片不自动覆盖及费用确认规则。
- **开放任务保留**：浏览器交互验收、运行环境音轨小样、已授权后的收费端到端/部署；Luma/百炼编辑/VACE 掩码/裁剪拼接条件增强；其他供应商视觉协议与更多型号预算。不得因 P0/P1/P2 已有实现而将这些标完成。完整矩阵见 `site/content/docs/plans/video-quality-and-editing.md` 顶部。

## 2026-09-08 PL-013 本地来源冻结与资产描述修复（工作树待提交、未部署）

- LC-012/LC-015，PL-013 部分推进：新增 services/generation/quality_sources.py、QualitySourceSnapshot/Bundle、ResolvedGenerationSnapshot.quality_sources、门禁接入；任务 JSON 自动保存提交时来源证据，旧任务兼容空字段。来源包含精确实体类型/ID/字段/文本哈希，章节只存全文哈希和当前摘录偏移，不额外外发整章。
- LC-015：shot_video_prompt_pack 按已关联类型/ID 批量读取当前资产描述，最多每类型一次查询，替代旧候选描述。用户清空描述保持清空，不恢复旧候选；候选未关联的不自动加入生成。最终提示词消费当前描述。
- 章节精确匹配失败仅记录未知警告，不硬编码语义冲突；来源证据中的 literal_in_prompt 是逐字包含，不能代表模型实际遵循、图像识别或语义覆盖。记录只在内部任务快照，未新增任务中心重型面板。
- 自检：43 passed，真实 SQLite 来源/关联图与原生成/任务/发布定向回归；修复自检发现的循环导入。无外部 API 变更、数据库迁移、部署、收费调用。相关代码与本记录需一同智能迁移。
- 待完成：预览/提交来源一致性、文件级原始剧本映射、语义冲突审核、模型预算及 P1/P2/P3；本批不关闭 PL-013。

## 2026-09-08 PL-013 方案复核与任务追溯续批（工作树待提交、未部署）

- 按用户要求逐项复核计划与代码；当前基线见 site/content/docs/plans/video-quality-and-editing.md 顶部矩阵。P0 部分完成，P1 未完成，P2 仅调研未接通，P3 未完成；清除来源计划中初始“尚未编码”与当前状态的歧义。下方旧批次为阶段历史。
- 迁移映射 LC-012/LC-015，整体仍为 PL-013：新增 ExecutionQualityTrace 内部契约、quality_trace_for_execution 编译后追溯、GenerationEntityGate 冻结接入。现有提交 payload 自动保存最终提示词 SHA256 和确实保留的完整规则，不因标题存在就判断已应用；不把预览来源或规则推断为实际视觉验证。
- 保留旧任务兼容（quality_trace 可空）；无外部 API 字段变化、无迁移、无部署、无收费调用。现有模型 revision、媒体快照及凭据排除规则保持不变；不改变生成参数或原片采用逻辑。
- 自检 22 passed：质量编译/真实门禁到 payload 序列化/旧快照兼容/提交/渲染/发布/槽位隔离。新增 2 项测试覆盖用户改写删除规则、供应商编排后最终文本、凭据排除及快照往返。本批未修改前端，不重复声明前端实机验收。
- 尚未完成：完整章节/资产事实来源链及报告冻结、冲突决策、模型长度预算、AI 预检与缓存；fal.ai/Runway 编辑执行、附件传输、配置购买引导、版本比较采用与实机验收。按 P0 → P1 → P2 → P3 继续，不关闭 PL-013；下一批不能从“新增供应商下拉项”误判业务接通。

## 2026-09-08 PL-013 基础质量编排首批编码（工作树待提交、未部署）

- 本批实际代码：generation_quality 契约、generation/quality 编译器、帧/视频 derive_preview 与 PromptRenderer、工作室 GenerationQualityPanel、定向测试。映射现有视频链 LC-015，整体推进仍为 PL-013，不标全部完成。
- 修复任意一个连续性标记导致其余约束整段跳过；改为按完整内容独立去重。关联资产描述作为来源进入视频执行提示词，规则按显式关联类别激活，帧/视频时间语义分离；剧情变化优先，未编造尺寸/年龄。
- 规则版本进入实际执行提示词；事实/规则/警告和 visual_verified=false 进入渲染快照。预览弹框显示可折叠报告，沿用现有布局。注意：渲染快照可见不等于完整事实报告已持久化到任务，后者仍待做；未改动外部 API 字段/数据库 schema，既有 JsonValue 快照承载扩展。
- 自检：27 项后端定向回归通过，前端 typecheck 与生产构建通过（既有大 bundle 提示）；新增 5 项质量测试，更新原帧渲染断言以验证新增规则与原图 token 同时存在。修复自检发现的未使用 React 导入。未做浏览器实机和付费生成验证，未重启/部署。
- P0 部分完成：尚缺章节完整来源定位、冲突决策、按模型长度预算、任务级完整事实快照。P1 尚缺 AI 预检、缓存与审核。P2/P3 视频编辑 DTO/执行适配/附件/配置购买引导/版本采用均未完成；fal.ai、Runway 尚未注册为可执行供应商，不能使用。后续无需重新确认编码授权，迁移和付费验收仍单独处理。

## 2026-09-08 PL-013 非百炼编辑与附件补充（工作树待提交）

用户百炼额度耗尽，P2 优先顺序调整为 Kling O3/fal.ai → Runway Aleph → 百炼可选；Luma 当前协议继续核对。新增上传/素材库参考图片和文档编辑说明需求，按型号能力限制，不静默丢弃附件。已读取 fal.ai 官方编辑 schema 与 Runway 官方模型表；fal 为独立服务和计费，不能复用可灵 Key。当前为调研/方案，尚未编码接入或付费验收，详见 plans/video-quality-and-editing.md。新凭据与素材外发确认是实机验收前提，不意味着离线开发必须依赖凭据。

## 2026-09-08 视频质量与文字编辑需求（工作树待提交）

- PL-013 新增，状态：调研/方案已记录，功能未编码、未部署。来源 site/content/docs/plans/video-quality-and-editing.md。
- P0 有来源的镜头质量契约及帧/视频统一规则；P1 免费输入检查 + 可选智能检查与缓存/确认；P2 百炼视频编辑、兼容型号推荐、源视频受控传输、新旧版本人工采用；P3 协议/业务测试及单独授权真实验收。
- 关联 PL-006/007/010/011，不将此前已存在的连续性提示重复记作新增；不将官方支持记作本系统已接入。MovieAgent/VBench/官方提示词指南仅借鉴方法，未安装外部 Skill 或大模型权重。
- 仍须核对编辑模型的输入限制、地域与当前套餐权限；不自动切换收费端点、外发视频或重新生成。用户“白鞋偏大”为通用比例/交互回归案例，不硬编码为特例。

## 2026-09-07 分镜首/关键/尾帧成功后不展示（工作树待提交）

18:49 验收：7 项前端离线测试、typecheck 与镜像生产构建通过（既有 bundle 体积提示）；仅 front 已切换，HTTP 200，线上资源 index-C7aWE9Y5.js。未重新生成图片，未修改数据库，未重启 backend/worker。浏览器真实交互待用户刷新验收，不将离线测试冒充页面实测。

- LC-012/LC-015：只读确认任务 41/42/43 已成功，三个槽位 file_id 均存在，关系类型为 shot_frame_slot；旧页面只查 shot_frame_image。改为兼容新旧任务历史并按文件去重，直接读取当前槽位 file_id 兜底，上传/采用图片不依赖任务历史。
- LC-003/LC-015：关键帧生成完成及手动采用后刷新父层帧列表；取消 30 次/60 秒的帧任务轮询截止，改为在当前页面每 10 秒跟踪至终态，临时读失败继续跟踪；切换分镜或卸载后忽略旧回包，清理卡片状态。没有改变视频轮询。
- 数据边界：现有首帧属于分镜 fbe67337-1c26-41ba-87c3-fb69598684a3，关键/尾帧属于 54e86904-9363-4317-b876-1000e0db2070。不能自动跨分镜挪图；没有改任何 file_id 或任务记录。
- 验证：新增 4 项实际图库加载器回归（新旧关系、无任务已采用图、缺首帧隔离、晚到回包），另有 3 项共享完成轮询回归通过；前端 typecheck 通过。本批仅前端变更，无迁移/后端重启/收费生成。部署验收另记。
- 未关闭 PL-007/PL-010 不变：火山套餐权限与真实视频验收仍待确认，本次修复不代表这些计划完成。

## 2026-09-07 视频首帧与 Agent Plan 拒绝修复（工作树待提交）

18:38 部署验收：46 项定向后端回归、前端 typecheck、本地及镜像生产构建通过（保留既有大 bundle 提示）。切换前 active/reserved 均为空，backend/worker/beat/front 已重建启动；前端/API HTTP 200，资源 index-Cg-bgXMb.js，Worker pong，容器内新准备度与 Plan 诊断均确认已加载。本批未迁移数据库、未改变供应商配置、未删除备份，未执行真实付费生成。火山账号权限问题仍待外部确认，不能标记整体视频调用已成功。

- LC-011/LC-012/LC-015：批量视频不再固定 text_only 或置空首帧；按当前默认模型能力读取每个镜头实际首帧，缺失时跳过并提示。单镜头 I2V 可使用现有首帧；显式帧 ID/顺序不被资产推荐替换。准备度新增 model_reference_mode 检查，不再将无首帧的 I2V 判为就绪。
- LC-011：火山 UnsupportedModel + Agent Plan 返回中文诊断并保留错误码/请求 ID；没有删除 /plan、切换模型/Key 或额外收费重试。用户最新控制台截图仍提示 Seedance 1.5 即将下线、不支持新增接入，Medium 暂不支持 2.0。套餐拒绝的最终原因须火山核查账号权限，不能记为修复成功。
- 验证：46 项视频适配/准备度/文件解析/发布链路离线测试通过；无付费生成。此次无数据库迁移、无数据清理。前端构建与应用部署结果见本节后续验收记录。
- PL-007/PL-010 继续开放：火山账号允许的精确视频型号及真实视频验收待供应商确认；语音截图是独立 Plan TTS 协议，未在本批实现，不等同视频适配。
- 官方依据：[HappyHorse I2V](https://help.aliyun.com/zh/model-studio/happyhorse-image-to-video-api-reference)；火山套餐权限以用户本次控制台截图及服务返回为证据。公开配置入口 https://www.volcengine.com/docs/82379/2373743 为 JS 页面，本次未读取到最新权限表。

## 2026-09-07 18:15 自助供应商批次正式部署（工作树待提交）

- LC-009/LC-010/LC-011/LC-012/LC-014：用户明确同意后已完成备份、隔离 MySQL 恢复与迁移演练、正式迁移 a7b9c1d3e508、backend/celery-worker/celery-beat/front 镜像构建和切换。未运行 init/seed，未删除业务卷，未变更模型默认值、端点或凭据。
- 本地完整后端测试：486 passed，837.04 秒；耗时集中在任务超时/失败等测试。原先“全量未完成”已由本次结果更新。重复的临时 Linux 测试容器已停止，其结果不计为全量通过。
- 备份：E:\JellyfishNew\backups\provider-adapter-a7b9-20260907。SQL 972827 字节，SHA256 4148DEB003C05DFF4A7D6358EC62CBB125F9A18FA489C45B74F395AED2DDB08C；另存原运行 backend-app/alembic/frontend。不是完整旧依赖镜像，也不包含 RustFS 对象副本；原对象卷未改动。备份仍保留，需人工确认后再清理。新增 .dockerignore backups/，并验证 Git 已忽略该目录。
- 迁移前后：2 个供应商、7 个模型、23 个文件记录；原供应商 adapter_key 均为 NULL，旧配置继续兼容。临时恢复演练数据库已停止并销毁，其不持久化数据不再保留；SQL 备份和正式数据完整保留。
- 上线检查：前端/API HTTP 200，前端资源 index-xWG5ToLg.js；Worker pong，基础服务运行；现有 7 个模型免费接入核查全部能解析到已注册适配器。支持列表为 10 家供应商 + 自定义兼容文本适配器。没有发起付费模型验收，不能把免费核查当作生成成功。
- 已从正式新后端再次运行 pnpm run openapi:update，前端 typecheck 通过；镜像内生产构建通过（保留 bundle 体积提示）。手册与架构/计划同步本次已部署状态。
- PL-007/PL-010 仍开放：Google 图片/视频、MiniMax 视频/音频、FLUX.2 本地参考图、官方证据持久化与失效、可取消的智能比对/引用校验/审核及业务能力消费未完成。迁移部署完成不等于整个供应商治理计划完成。

以下“候选/待确认/未部署”段落保留为阶段历史，当前状态以本节为准。

## 2026-09-07 自助供应商与四家执行适配续批（工作树待提交，未部署）

最终验证续记：停电后本批 67 项定向回归全部通过（含独立迁移升降级、协议/目录、业务 Agent 单次调用、BFL、供应商改名与快照）；前端类型检查通过，生产构建通过并保留既有体积提示，git diff --check 无补丁空白错误。全量回归未完成：停电前运行中断，恢复后重跑进展缓慢已主动终止，不能记为全量通过。新功能仍未部署，下一步须明确同意备份、a7b9c1d3e508 迁移及服务切换；后续媒体适配和智能文档治理继续保留 PL，不宣称全部完成。

停电恢复续记：仅启动原有 MySQL/Redis/RustFS/backend/front/worker/beat 容器，未执行初始化、seed 或迁移，未重建数据库；MySQL/Redis healthy，前端与 OpenAPI HTTP 200，线上 revision 仍 f6a8b2c4d507。前端生产构建通过（有既存 bundle 体积提示）；全量回归被停电中断，已重跑，最终结果待续记。迁移单测已独立为 test_provider_adapter_migration.py，避免插入原测试内部。

- LC-010/LC-011：新增 Google GenerateContent、Claude Messages 原生文本适配；MiniMax 兼容文本适配并分离 reasoning。原生协议拒绝未实现的工具/多模态消息，保留系统提示词、拒答与截断语义；AgentBase 对无工具协议使用 Schema 提示与业务校验，不以工具失败为由重复付费调用。Google/Claude 使用各自鉴权及分页目录，MiniMax 使用已核对官方目录。
- LC-011/LC-012：新增 BFL FLUX.2 文生图、Kontext 单参考图适配，创建一次后限时查询，结果返回统一 ImageGenerationResult，沿用图片产物发布链。查询地址限制避免密钥发送到无关域；未知型号/未支持参考图明确拒绝，不偷偷丢素材。FLUX.2 本地图片传输、Google 图片/视频、MiniMax 视频/语音仍未实现。
- LC-009/LC-010：供应商展示名称改为自由输入，新增独立 adapter_key；可自助新增兼容文本供应商，或复用已实现的原生适配器。适配器声明控制类别，不允许仅填图片/视频名称就绕过执行限制。已有模型禁止原地换协议；允许改名，同协议地址不被默认地址覆盖。
- 类别边界补充：自定义兼容目录只返回文本；未实现图片协议不能落入火山图片默认能力。保存拒绝显示后端具体原因，而不是一律“保存失败”。
- LC-012：文本 Worker 从冻结 revision.provider_key 构建协议，不再根据当前供应商展示名称选择协议。认证仍引用当前凭据；并非冻结密钥值。
- LC-009/LC-014：新迁移 a7b9c1d3e508（前置 f6a8b2c4d507）只加 providers.adapter_key 可空字段，旧行不重写。正式迁移/备份/重启已请求人工确认，尚未执行。OpenAPI 已通过隔离 schema 服务运行 pnpm run openapi:update；新增 JELLYFISH_OPENAPI_URL 仅用于生成时指定隔离地址，默认仍 8000。
- 验证：58 项定向后端测试通过；全量回归与前端生产构建运行中，结果需续记。无真实付费调用，无线上数据修改。不能把 Mock 成功等同于用户具体账户/模型验收。
- PL-007/PL-010 保持开放：10 家供应商已在候选代码注册，另有自定义兼容文本协议选项；这不等于十家全部模态打通。待续：新批迁移部署及实机验证、Google 图片/视频、MiniMax 视频/语音、FLUX.2 本地参考图、官网证据持久化/版本失效、可取消且有额度与外发授权的 AI 比对任务、引用校验/人工审核/审核能力业务消费。后三项不是等凭据才可编码的阻塞项，不能从计划中遗漏。
- 上游迁移：对照 provider_registry/resolver/runtime、AgentBase、image task adapter、ModelsTab/ProvidersTab 与新增 migration 智能合并；OpenAPI 由合并后后端再生成。保留显示名称与协议分离、冻结任务与不重复收费的行为，不机械覆盖作者新协议。

## 2026-09-07 官方文档读取与场景选型（工作树待提交）

最终验证续记：113 项后端回归测试通过，前端 typecheck/生产构建通过（仍有 bundle 体积提示）；backend/celery-worker/front 已切换，新前端 bundle 与 HTTP 200 已确认，服务端支持列表返回六家及 DeepSeek 文本类别。未做浏览器人工交互验收、未调用收费模型、无数据库迁移。

- LC-011/LC-012：新增 DeepSeek 文本供应商（目录读取、参数配置、文本调用共用已接入的 Chat Completions 路径），不宣称支持图片/视频/音频。文本启动矩阵由固定供应商名单改为协议声明检查；现阶段只接受已实现的 openai_chat 协议，并非用户任意协议可自助运行。
- 修复文本 API 参数串用：enable_thinking 仅自动加入百炼请求，不向 OpenAI、火山或 DeepSeek 注入；其他协议的思考控制仍按显式参数配置，不声称通用关闭开关已全部适配。
- LC-011：新增模型官方正文读取 API 与核查页入口，限定登记来源/精确官方域名、HTTPS、公网 DNS、无凭据/代理/自动跳转、20 秒总超时、2 MB 解压体积与正文长度限制；移除 HTML 脚本样式，返回纯文本、获取时间、内容哈希。读取失败明确显示；正文只是临时展示，不代表模型兼容通过，尚未持久化证据历史。
- LC-011：模型管理顶部“场景选型说明”及添加/编辑模型“如何选模型？”；按剧本、精简、资产图片、参考图、视频、配音等业务解释能力条件；已接入/待接入分开，不宣称性能排名或任意模型可用。
- 验证：46 项定向离线测试通过；本机读取 DeepSeek 官方 JSON 文档成功，未调用生成接口。前端构建及部署结果后续续记。
- PL-007/PL-010：目标总计 10 家（现有五家 + DeepSeek/Google/MiniMax/Claude/FLUX）；本批实际六家注册。Google/MiniMax/Claude/FLUX 适配、证据持久化与自动版本核验、AI 语义比对、审核后业务能力消费、用户自助供应商仍未完成；不得将本批读取器当作完整智能比对。

## 2026-09-07 模型接入治理首批（工作树待提交）

扩展补充：官方文档来源已由固定映射迁入供应商注册元数据；新增供应商缺文档来源明确提示。实机发现数据库 category 为字符串的差异已修复并补回归，连同供应商矩阵共 80 项定向测试通过。PL-007 尚需统一可扩展 runtime/协议/契约/证据注册，禁止以添加下拉选项代替真实接入。

部署验收：本批 backend/celery-worker/front 已构建并切换，切换前 Worker 无活动任务；当前配置的 7 个模型接入核查 API 全部返回成功，前端 HTTP 200，生产构建通过（保留 bundle 大小警告）。无数据库迁移、无付费生成；未进行浏览器交互验收。新增供应商可由本地二开实现，无需等待作者，但用户自助扩展协议界面仍属 PL-007 未完成内容。

- LC-011/LC-012：模型管理更多菜单增加“接入核查（免费）”，实时读取配置，分别展示类别适配器、官方契约待核对、业务验收未读取；覆盖现有五家官方入口及四模态验收清单。不外发密钥/剧本、不请求配置 URL、不切换套餐。
- LC-004：深度分析对拒答、内容审核、长度截断单独失败，不当 JSON 格式问题自动重试。
- LC-008/LC-012：多家图片/视频 HTTP 错误保留错误码、请求 ID 并限制字段、隐藏密钥/URL；TTS 拒绝未知协议家族和普通模型的 instruct 参数，检查下载内容类型/空文件。
- 新增只读 integration-audit API，已同步 OpenAPI/generated client；无数据库迁移、无付费调用。78 项定向测试、前端类型检查通过。
- PL-007/PL-010 **仍未关闭**：自动官网采集、语义核对、版本化审核、业务门禁消费、真实验收记录尚未实现。不能把首批诊断入口称为“系统已具备自动智能接通能力”。后续任务见 model-aware-script-analysis.md。

> 用途：这是本地二开迁移的主台账。后续每次新增、修改或删除二开能力，必须与代码在同一批次更新本文；下次吸收作者 GitHub 更新时，以本文逐项做“采用上游、保留本地、兼容合并、重新实现、淘汰”判断。

## 1. 基线与可复现边界

| 项目 | 当前记录 |
| --- | --- |
| 作者仓库 | `https://github.com/Forget-C/Jellyfish.git` |
| 作者迁移基线 | `codex/0718`，本地共同基线提交 `508f2c7` |
| 本地稳定分支 | `local/stable-codex-0718` |
| 本次功能清单核对 HEAD | `53f8da8`；其后的核心短视频闭环修改当前仍在工作树，提交后须用新 HEAD 替换 |
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

### 1.1 2026-09-04 最近工作树审计快照

当前分支仍为 `local/stable-codex-0718`，HEAD 为 `53f8da8`。本次台账核对开始时，HEAD 之后的业务二开已跟踪差异为 64 个文件、约新增 1870 行、删除 301 行；加上本次对 `AGENTS.md` 和主台账的规则固化后，当前已跟踪差异为 65 个文件。另有本批新增的迁移、后端服务/测试、OpenAPI generated client 和架构/计划文档。`.codex-test-tmp`、`.test-tmp-*`、数据库备份等运行产物不属于应迁移源码，不得因未跟踪文件数量而整目录携带。

本工作树批次已映射到下列台账：

- `LC-003`：任务取消/loading 释放、分镜任务禁止“成功但 0 分镜”。
- `LC-004`：解析器 `1.1.0`、跨格式业务标签保留、质量提示、可分页草稿/历史、继续编辑、安全删草稿和已导入记录只读。
- `LC-008` 和 `LC-015`：默认语音模型、阿里 TTS、镜头音轨合成、批量图片/视频任务、真实时间线、MP4/SRT 成片导出。
- `LC-009` 至 `LC-012`：模型 revision 回填、audio 类别与默认设置、供应商能力校正、任务注册/分派、API/OpenAPI/generated client 同步。
- `LC-014`：新增定向测试、迁移验证、中文手册、当前架构和未完成计划文档。
- `PL-005` 至 `PL-007`、`PL-010` 和 `PL-011`：已分别记录代码/模拟验证与尚待用户 UI、真实付费模型验收的边界。

在进行下次 GitHub 同步前，必须先把该工作树整理为可审计提交，再用新 HEAD、文件统计和提交映射替换本快照；在此之前，升级备份不得只备份已提交范围。

## 2. 二开能力总表

### LC-001 中文化、E 盘部署与本机安全边界

- 新增/修改：中文界面与中文配置手册；本地前后端 Dockerfile；安全 Compose 覆盖；Nginx 代理修正；忽略本地环境和构建文件。
- 关键位置：`deploy/docker/*.local.Dockerfile`、`deploy/compose/docker-compose.secure-local.yml`、`deploy/compose/docker-compose.yml`、`deploy/docker/nginx.conf`、`.gitignore`、`.dockerignore`。
- 必须保留：正式目录为 `E:\JellyfishNew`；Docker/WSL 数据位于 E 盘；业务端口只监听本机；`.env`、API Key、数据库密码不进入 Git 和日志。
- 升级策略：吸收作者新增环境变量和镜像变化，再把本机安全覆盖适配到新版；禁止用旧 `.env` 覆盖新版示例。

### LC-002 全局数据刷新、CRUD、分页和页面高度

- 2026-09-07 工作树待提交批次：修复资产卡片快速生成缺少终态刷新、详情生成只跟踪 60 秒；共用 `useGenerationCompletion.ts`，仅已提交任务每 10 秒串行查询直到终态，暂时网络/结果读取失败继续重试，卸载清理。成功刷新槽位与卡片封面，不覆盖未保存的资产基础资料。新增模型立即合入接口返回项，切换保存类别、清空搜索并回首页；模型批量导入接口改为 function-scope 数据库依赖，提交后才返回，修复立即查询不可见竞态（涵盖 audio）。
- 本批回归：`front/tests/generationCompletion.test.cjs` 3 项通过（超过 60 秒、短暂失败、卸载）；前端 typecheck 通过；`test_model_import_commit_order.py` 与 LLM API 响应测试共 12 项通过，ASGI 实测提交先于响应发送。无新增数据库迁移，无新付费生成调用。浏览器端真实生成交互仍需用户验收。
- 本批部署：backend/front 镜像构建并重建服务完成；7788 返回 200 且加载新产物 `index-DY-ClqA5.js`；音频模型只读查询返回 `qwen3-tts-flash`。重启后已同步 OpenAPI/generated client 并再次通过 typecheck（仅接口说明变化，无请求/响应字段变化）；未重启 MySQL、RustFS 或生成 worker。
- 素材取证（LC-007/LC-012）：妍妍任务 `697c698b2f8c467d980484924b61091f` 已成功；冻结快照包含参考文件 `3ff77ed3-06ef-496f-8c77-cedf3033bf61`（`微信图片_20260808190047_409_3.jpg`），与启用的 front_portrait 关联一致；执行器解析文件内容为内存图片输入传给 adapter。此结论表示参考输入进入执行链路，不承诺模型输出完全复刻人物。

- 新增/修改：项目、章节、演员、角色、场景、道具、提示词和模型等新增/修改/删除后的刷新；非系统数据可编辑和删除；跨页加载工具；章节分页和可视高度修复。
- 关键位置：`front/src/services/loadAllPaginated.ts`、`ProjectLobby.tsx`、`ProjectWorkbench/hooks/useProjectData.ts`、`projectDataEvents.ts`、各资产 Tab、`PromptTemplateManager.tsx`、模型管理各 Tab、章节页面。
- 后端配合：项目、章节、实体、提示词路由的删除/查询语义和响应一致性。
- 必须保留：数据变更后立即看到最新结果；系统内置记录保持保护；列表多时不截断且分页可达。

### LC-003 任务中心和异步交互可靠性

- 新增/修改：任务完成后仍持久可查；默认展示进行中；全部状态和任务类型筛选；轮询降频；更大的可视区域；筛选和分页固定；下拉层级修复；反复收起/打开不永久加载。
- 新增/修改（工作树待提交批次）：任务中心顶部统一为“任务范围”，行状态统一为等待中/进行中/取消中/已完成/失败/已取消；终态优先于取消请求标记，失败任务可按需查看数据库持久化错误。
- 新增/修改：章节“角色混淆检查”“智能精简”等异步任务创建、分派、取消及编辑框 loading 释放；失败任务可见，不再只出现 `Failed to fetch`。
- 新增/修改：`script_divide` 成功前校验可落库镜头；模型明确判断为单镜头却遗漏 `shots` 时，用冻结的章节原文无损补全；无法安全补全的空结果改为失败，禁止“任务中心成功、章节分镜数仍为 0”。
- 关键位置：`TaskCenter.tsx`、`TaskRuntimeProvider.tsx`、`taskUiStore.ts`、`taskCopy.ts`、`film/task_status.py`、生成 outbox/任务注册与时间戳迁移。
- 必须保留：任务中心是通用任务列表，不变成业务详情页；终态、筛选、分页、取消和刷新恢复都可验证；成功状态必须与业务结果落库一致。

### LC-004 剧本文件导入与智能拆解入口

- 2026-09-07 补充约束（PL-010/PL-007，工作树待提交）：完成现有五家供应商注册范围及官方文档入口核对，详见 `plans/model-aware-script-analysis.md`；百炼/OpenAI/Vidu 正文可读，火山结构化输出与可灵正文未取到，不标为已验证。原生结构化输出的按模型选择、思考参数分流、供应商 Schema 子集适配仍未实现，不能将上批普通消息 + 本地校验描述为智能原生路由。已将用户要求写入 AGENTS.md。

- 2026-09-07 工作树待提交批次：深度分析独立调用路径把 Pydantic JSON Schema 完整传入系统消息，明确事实/推断、画面/动作/运镜/声音与章节归属。绕过通用 Agent 的“结构失败后静默再次普通调用”路径，一次显式模型调用后本地校验；不更改其他 Agent。不依赖用户剧本格式或候选 ID 前缀推断身份。项目标量 value 包装只在无未知字段时转换，合并原文证据、保守置信度及来源并提示复核。缺失业务身份仍拒绝，校验错误只暴露字段路径/类型，不把响应中的剧本文本写入普通错误日志。空候选及证据审查后全空不再成功。
- 本批验证：新增 `test_script_import_analysis_contract.py`，与脚本 Agent/导入业务测试共 16 项通过，无真实模型调用。完整原始响应受控保存、免付费重解析入口、待确认候选独立区和真实分阶段进度尚未实现，归 PL-010 收尾，不把本批描述为全部方案完成。
- 跨模型补充与上线：新增普通 JSON、Markdown JSON、分块文本三种响应形式回归；连同资产修复共 33 项测试通过。backend/front/celery-worker 已构建并重建，前后端 HTTP 200，Worker 内分析 Agent 和资产 Publisher 源码 SHA256 与本地一致。不同模型可产生不同语义候选，统一的是证据和业务契约，不承诺所有模型均已真实验收。无新增数据库迁移、无付费调用。

- 新增/修改：项目工作台支持 TXT、Markdown、PDF 文字层和 DOCX；后端可注册格式适配器统一生成带原始位置的语义块，区分真实章节、概述、作者提示词、配音/音效汇总和制作备注。
- 新增/修改：解析器 `1.1.0` 修复章节时间范围只移除数字、残留半个括号的问题；TXT 独立标题和 Markdown 表格字段统一输出为带 `【主题】【画面】【镜头】【时长】【配音】【字幕】【画面提示词】` 的规范正文，同时删除 Markdown 表头、分隔线等格式噪声。
- 新增/修改：导入页增加文件类型与推荐内容规范说明；解析器按每章画面、镜头、时长及声音信号做非阻断质量评估，结构差异较大时在顶部和章节内提示。自由文本与未知段落始终保留，可选择人工修订或在明确同意后做 AI 深度分析。
- 新增/修改：新增 `ScriptImport` 导入工作记录、内容 hash/解析器版本幂等、结构预览和章节勾选；上传解析默认是临时预览，只有用户点击“保存并稍后继续”才设置 `is_saved` 并进入分页“导入草稿与历史”。关闭未保存预览删除临时工作记录但不删原始文件；已保存未提交草稿可继续编辑或删除，已导入记录只读追溯。确认后一次事务写入章节，重复提交不重复建章。旧的前端 `scriptImport.ts` 标题正则已删除。
- 新增/修改：用户主动确认供应商和费用后才创建 `script_import_analyze` 任务；任务冻结已披露的文本模型，只输出带原文证据、来源类别和置信度的项目/资产/镜头/声音候选。演员、角色、场景、道具、服装默认忽略，支持新建、匹配已有、仅作细节或忽略。
- 新增/修改（工作树待提交批次）：深度分析明确展示“单次结构化调用/阶段进度”；任务取消、失败与导入草稿状态同步，详情查询可自动修复历史遗留 `analyzing`，取消后恢复可重新分析。
- 新增/修改：一次事务提交选中章节、人工确认资产、镜头级角色/场景/道具/服装关联、对白/旁白和声音计划；视频模型能力规划不调用外部 API，提交时重新校验并把时长转换为合法片段。作者提示和项目约束以软参考进入现有镜头 PromptRenderer。
- 关键位置：`script_import_parser.py`、`script_import_analysis_agent.py`、`studio_script_imports.py`、`services/studio/script_imports.py`、`script_processing_{tasks,worker}.py`、`ChaptersTab.tsx`、`ShotAudioTracksPanel.tsx`、revision `a7c3e5d9f204`、`b9e4c7a2d106` 与 `f6a8b2c4d507`。
- 必须保留：导入与手工录入并存；先预览后写库；草稿可见、可恢复、可管理，已导入历史不允许当草稿修改或删除；格式装饰可清理但业务标签、未知内容和来源证据不能丢；格式建议只用于提高准确度，不能变成固定模板门禁；未经用户点击同意不得外发正文；候选默认不创建；导入不触发图片/视频生成；格式/编码/大小/模型失败不产生半章或孤立资产；重复提交幂等。

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
- 新增/修改（工作树待提交批次）：删除演员、角色、场景、道具或服装前由后端实时盘点，弹窗具体展示项目、章节、分镜、角色、对白、配音音效、参考文件及随资产删除的图片；查询失败禁止删除。用户确认后在同一事务中先显式解除业务关联、再删除资产，失败整体回滚，底层 `FileItem` 和 RustFS 文件保留。
- 新增/修改：关联不是硬性要求；无素材继续文字生成；用户显式选择优先于自动推荐；不支持的媒体不发送给模型。
- 关键位置：`AssetAttachmentsPanel.tsx`、`AssetEditPageBase.tsx`、`confirmEntityDeletion.tsx`、`studio/entities.py`、`services/studio/entity_deletion.py`、`studio/media_assets.py`、`services/studio/media_assets.py`、`asset_reference_context.py`、`image_task_references.py`、`shot_assets.py`。
- 必须保留：解除关联只删关系不删底层文件；素材说明/文档是软上下文，不要求机械复刻。

### LC-008 配音音效库、镜头音轨与可选合成

- 新增/修改：资产管理增加“配音音效”Tab；支持角色配音、旁白、背景音乐、环境声、音效、转场音的上传、试听、搜索、分页、编辑和删除。
- 新增/修改：镜头可选择音频资产形成音轨，配置开始时间、音量、循环等；视频成功后可用 FFmpeg 非阻塞合成。新增独立 audio 模型类别和默认语音模型；阿里百炼 TTS 可从已确认对白生成 `FileItem + AudioAsset + ShotAudioTrack`，临时结果 URL 立即归档 RustFS。
- 关键位置：`AudioAssetsTab.tsx`、`ShotAudioTracksPanel.tsx`、`studio_media_assets.py`、`media_composition.py`、`generated_video.py`、`shot_tts.py`、revision `d5f1a7c9e306`。
- 必须保留：没有音轨时完全沿用原视频；音频合成失败不删除或覆盖已成功的视频结果。

### LC-009 数据模型、API 与 Alembic 迁移

- 新增实体：`AssetFileLink`、`AudioAsset`、`ShotAudioTrack` 及用途、类别、轨道类型等枚举和 Schema。
- 本地 revision：`e2a6c8f4d901_add_rich_media_assets.py`；扩展 `d8f4a1e9b702_add_unified_generation_foundation.py`；新增 `f4b8d2c6a103_fix_generation_timestamp_defaults.py`、`a7c3e5d9f204_add_script_imports.py`、`b9e4c7a2d106_add_shot_audio_cues.py`、`c3d7e9f1a204_backfill_model_config_revisions.py`、`d5f1a7c9e306_add_default_audio_model.py` 和 `f6a8b2c4d507_add_explicit_script_import_save.py`。
- 新增/修改 API：文件详情/预览/选择、资产附件 CRUD、音频资产 CRUD、镜头音轨 CRUD、模型目录/能力/连接测试、任务状态等；同步生成前端 OpenAPI client。
- 必须保留：旧数据库可安全 baseline/reconciliation；统一生成表时间默认值正确；迁移和系统 seed 幂等；用户数据和自定义模板不被 seed 覆盖。

### LC-010 模型供应商目录、默认模型和真实连接测试

- 新增/修改：供应商优先的模型新增流程；按供应商显示文本、图片、视频、语音类别和候选模型；允许手工 Model ID；四类默认模型解析、类别校验和设置刷新。
- 新增/修改：供应商连接测试和文本模型快速测试走最小真实请求，返回阶段化诊断；修复修改密钥后仍使用旧凭据、管理页无响应等问题。
- 关键位置：`model_catalog.py`、`llm/manage.py`、`llm/resolver.py`、`llm/testing.py`、`ModelsTab.tsx`、`ProvidersTab.tsx`、`SettingsTab.tsx`。
- 必须保留：目录展示能力与真实执行适配器一致；图片/视频不在管理页误触高费用测试；同一供应商的通用/图片/视频 Base URL 能正确分流。

### LC-011 文本、图片、视频和语音供应商执行适配

- 阿里百炼：文本走兼容接口；补齐图片生成、Wan/HappyHorse 视频能力、任务提交/轮询/结果解析及模型家族素材限制；Qwen3-TTS 走 multimodal-generation，Qwen-Audio/CosyVoice 使用显式 Workspace SpeechSynthesizer 端点。
- 火山引擎：补齐目录与 Seedream/Seedance 模型级能力约束，保留其执行协议边界。
- Vidu：补齐 Q 系列比例、时长、主体/参考素材能力和 payload。
- OpenAI：校正图片和 Sora 视频模型、时长、尺寸、单首帧约束，避免发送未声明字段。
- 可灵：登记图片/视频供应商及模型能力，保持专用鉴权和执行边界。
- 关键位置：`core/integrations/{aliyun,volcengine,vidu,openai,kling}`、统一 `image_capabilities.py`、`video_capabilities.py`、任务执行器和 `generation/gate.py`。
- 必须保留：不能因“供应商可新增”就宣称业务已打通；目录、门禁、适配器、异步轮询、产物归档和测试矩阵必须同时成立。

### LC-015 核心短视频成片交付

- 新增/修改：既有模型统一补齐不可变 revision；章节批量关键帧与批量视频分成真实图片/视频任务；视频产物自动应用镜头音轨且保留供应商原始文件。
- 新增/修改：成片工作台读取真实章节/镜头/文件时间线；缺片默认阻断，人工确认后才允许跳过；Worker 使用 FFmpeg 统一 H.264/AAC、25 fps、项目画幅和静音轨并顺序拼接。
- 新增/修改：镜头对白按片段时段生成 SRT，可选写入 MP4 `mov_text` 软字幕；MP4 和 SRT 均写入 RustFS 与项目文件使用关系，任务中心持久记录状态和产物。
- 关键位置：`project_video_export.py`、`timeline.py`、`VideoEditor.tsx`、`generated_video.py`、`media_composition.py`、`generation/publishers/*`、revision `c3d7e9f1a204`。
- 必须保留：时间线不得回退为 Mock；导出不调用第三方模型；不静默跳过缺片；失败不删除源镜头、音轨、原始供应商视频或历史成片。

### LC-012 统一生成链路兼容和任务快照安全

- 2026-09-07 工作树待提交批次：修复场景/道具/服装图片槽位与演员表自增 ID 冲突，Gate 必须同时匹配父资产 ID，CAS 版本从对应父资产槽位读取，Publisher 更新 SQL 同时约束父资产 ID，防止跨资产写回。`test_asset_slot_identity.py` 覆盖五类同编号槽位及发布约束；与既有 Publisher/图片执行测试共 14 项通过。
- 此批部署已完成：此前因剧本分析任务运行而暂缓，现任务结束后已随深度分析修复更新 backend、celery-worker、front；Worker 的 Publisher 哈希已验证与本地一致。无数据库迁移、无付费重试。
- 同批 LC-006/LC-008：音频入口增加实际扩展名与 500MB 校验（拖放不再绕过 accept）；MP4 提示先提取音轨，不上传后再创建失败。当前两条“视频音效”上传是 MP4，已保存原文件，不自动删除，也没有实现视频自动提取音轨。
- 同批 PL-007 未关闭问题：视频任务 `93b0bff4733549758349040a7bd41afa` 请求 `/api/plan/v3/contents/generations/tasks` 返回 404；火山视频覆盖地址为空而继承 Plan 通用地址。需核对用户套餐的视频接口/鉴权要求再配置，不擅自改到可能另行计费的标准 API，不自动重试付费生成。

- 2026-09-07 工作树修复：图片 Worker 补齐 `experiment_session` 目标，实验室产物归档、TaskLink 和会话消息同事务回写；实验室不要求资产槽位 CAS。无效目标在付费调用前拒绝，实验室用途恢复为 generic。新增双供应商回归及完整数据库回写测试；新增 `scripts/recover_lab_image.py`，仅凭精确任务/对象和时间校验恢复已归档结果，不重调供应商。
- 部署及数据修复：19 项定向测试通过，backend/Worker 已重建；无数据库结构迁移。备份 `backups/lab-recovery-20260907.sql.gz` 后，恢复任务 `8342f1579ecf45f0adef070d5eaf54d9` 和 `9bdb1d7b314c4b9484a681652ed440f3` 的现有 RustFS 图片，原错误保存在 result.recovery 中；任务状态均 succeeded/100，两个图片下载 Range 请求均 206 且 MIME 正确。没有新增供应商调用。

- 新增/修改：本地能力接入作者 generation contracts、submission、outbox、runtime、publisher、artifact 架构，不恢复旧图片任务/提示词链路。
- 新增/修改：媒体以稳定 `file_id` 冻结，Worker 执行时再解析；任务 payload 不保存 API Key、供应商临时凭据或大段 base64。
- 新增/修改：Beat 周期分派 outbox；创建、执行、完成、失败、取消均可审计并被任务中心查询。
- 新增/修改（工作树待提交批次）：统一生成提交先 flush `GenerationTask` 父记录，再写 Link、媒体快照和 Outbox，修复 MySQL 外键导致演员图片任务创建失败及镜头生成“缺少任务 ID”。
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

下列计划不是“当前已经完整交付的能力”，但属于二开连续性的一部分。上游升级时必须与主台账当时存在的全部 `LC-*` 一起审计：先判断作者新版是否已经实现，再决定继续、合并、改写、暂缓或取消。升级完成后，应从这些计划继续下一步系统优化，不能因为代码迁移成功就把计划视为自动完成。

| 计划 ID | 来源计划 | 当前状态 | 已完成部分 | 升级后待继续/重新评估 |
| --- | --- | --- | --- | --- |
| PL-001 | Alembic 统一数据库迁移 | 部分完成 | 初始 schema、旧库安全 baseline、Compose migrate/seed、系统模板保护已落地 | seed 从遗留 SQL 收敛为版本化数据包；完成发布周期观察后移除 `init_db.py` 和遗留 SQL；先检查作者新版是否已完成同类收敛 |
| PL-002 | 实验室历史输入回填与重试 | 部分完成 | 文本/图片/视频的提示词、模型、图片参考、视频帧和主体素材可恢复，已有版本化输入快照 | 模板 ID/变量无损恢复；图片全部可选参数快照；模型或文件失效的细粒度诊断 |
| PL-012 | 实验室媒体结果发布完整性 | 图片修复完成，视频待修复验证 | 图片实验室目标、文件归档、任务关联和会话终态回写已打通；19 项定向回归通过 | 视频 Worker 仍使用镜头专用发布器，需补实验室视频目标分流与端到端回写测试；在完成前不要将视频实验室视为已验收 |
| PL-003 | 实验室会话持久化 | P0/P1 完成，P2 待条件 | 会话 CRUD、历史分页、URL 定位、任务消息回写、结果恢复和稳定 sequence 已完成 | 身份体系落地后做归属、鉴权、审计、保留、归档和产物 GC；重新审计游标分页、请求幂等键和可靠派发是否已被新版统一生成链覆盖 |
| PL-004 | 生成准备架构重构 | 主链完成，收尾待做 | frame/video/asset image 的 shared、draft、derive、submit 主链已统一 | 压缩 `ChapterStudio` 局部辅助逻辑；治理前端类型遗留；按实际复用价值评估通用生成 UI，而非为抽象而抽象 |
| PL-005 | 富媒体资产增强 | 主链完成，增强待做 | 上传、全局复用、预览、可选关联、生成引用、音频库、镜头音轨、AI 配音和 FFmpeg 合成已完成 | ffprobe 元数据；OCR/可编辑摘要；供应商能力持续校准；后台缩略图；角色音色映射、逐行配音、波形时间线/拖拽/静音；项目权限和多用户隔离 |
| PL-006 | 提示词与 Agent 后续编排 | P0/P2 主链完成，P1/P3 待做 | 10 个生产系统模板、镜头帧模板、视频连续性、Wan/Vidu profile、剧本声音计划、阿里 TTS、后期音轨和对白字幕已接入 | P1 文本 Agent 模板版本化；补充角色级音色和逐行配音；P3 有契约的组合工作流和经许可、安全审查的外部 Skill |
| PL-007 | 供应商生成链路补全 | P0-P3 加语音代码完成，P4 待人工 | 模型目录、能力一致性约束、阿里模型家族、阿里 TTS 及其他供应商首批适配和 Mock 测试完成 | 获得逐供应商付费许可后做 text/image/video/audio 最小真实样例，验证任务、取消、超时、错误、产物下载和 RustFS；火山语音待专用鉴权设计后再接入 |
| PL-008 | 任务异步化与取消 | 主线完成，增强按需 | 主线脚本接口已任务化、可恢复、可请求/协作式取消；预备接口已有后端 | 若出现真实页面再接 `merge-entities`/`analyze-variants`；只有明确业务需要才做运行句柄或强终止；持续收口同步兼容入口 |
| PL-009 | 整体开发规划 | 持续进行 | 核心流程和数据架构已基本稳定，多项结构、交互和提示词工作已分拆推进 | 继续按“结构治理 → 流程体验 → 提示词专项 → 够用的剪辑能力”复盘；以具体子计划和验收为准，避免用宏观描述代替任务 |
| PL-010 | 智能剧本导入与生产要素编排 | P0–P5 已完成并部署 | 通用解析、人工显式保存的可恢复草稿、临时解析预览清理、显式外发同意、冻结文本模型、证据候选、人工资产决策、事务落位、镜头级资产关系、模型合法时长规划、PromptRenderer 软上下文、对白与声音计划已完成；全量后端 418 项测试、前端类型检查/生产构建通过；正式库已迁移到 `f6a8b2c4d507`，原有记录回填为已保存，新上传默认不入历史，服务健康且 Worker 定时派发正常 | 用户按导入向导做一次人工 UI 复核；真实付费文本分析仍只在用户点击确认外发后发生，图片/视频真实生成继续遵守 PL-007 的逐供应商付费许可 |
| PL-011 | AI 短视频交付完善 | P0-P2 已部署，P3 待人工 | revision 回填、批量任务纠正、音轨合成、真实时间线、成片导出、阿里 TTS、SRT/MP4 软字幕已实现；全量后端 418 项测试、前端生产构建、备份恢复验证通过，正式库已到 `f6a8b2c4d507`，服务已重启健康 | 用户人工 UI 复核；P3 经单独付费许可跑 text/image/video/audio 最小样例；后续增加角色音色映射、逐行配音、转场、裁剪和多轨校时 |

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
- `site/content/docs/plans/intelligent-script-import-plan.md`
- `site/content/docs/plans/ai-short-video-delivery-plan.md`

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
| `9c60d39` | 建立智能剧本导入 PL-010、样本根因分析和 P0–P5 初版方案 |
| `3590f0b` | 智能剧本导入格式适配、可恢复草稿、可编辑预览和章节事务幂等提交 |
| `1ee0eba` | 记录智能剧本导入 P0/P1 实现、业务边界和后续阶段 |
| `a211f7f` | 完成证据化 AI 分析、人工资产决策、事务落位、模型时长规划、声音计划和前端工作流 |
| `fa6a75d` | 兼容 MySQL `TEXT` 迁移限制，修复 Celery 周期任务跨事件循环，并记录正式迁移、重启和运行验收结果 |
| `工作树（2026-09-07，待提交）` | 核心短视频 P0–P2、语音/音轨/成片导出、剧本解析器 1.1、人工显式保存草稿、资产删除前具体关联盘点及事务内先解关联再删除、分镜空结果防假成功、供应商能力和配置修正；正式库已迁移到 `f6a8b2c4d507`，提交后必须替换为精确 SHA |

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

下一次收到“检查 GitHub 最新代码并同步更新”指令后，先动态枚举并复制本清单当时存在的全部 `LC-*` 和所有未关闭 `PL-*` 条目形成迁移决策台账，再对作者最新代码逐项取长补短；全部验收通过后，更新基线、HEAD、统计、提交映射、能力条目和计划状态，并从仍未关闭的 PL 计划确定下一步优化工作。


## 2026-09-08 提交脚本分页停顿修复（LC-001 / LC-014）

工作树待提交批次。用户双击 Push-Jellyfish.cmd 后遇到 Git 输出分页停在冒号提示；共享 Invoke-Native 对 Git 统一增加 --no-pager，不更改全局分页或换行符配置。LF/CRLF warning 本身不是提交失败。已经打开的旧窗口可按 Q 退出分页，确认范围后按原提示输入 YES；之后启动脚本直接输出清单。保留现有确认、敏感路径复查及健康检查。12 项隔离模拟回归通过；本批未执行实际提交、推送或服务操作，未关闭任何 PL。


## 2026-09-08 累计二开提交保存与 EOF 格式修复（LC-001～LC-015）

用户授权提交保存。审查 git diff --cached --name-status：累计254个文件，涵盖已有后端139、前端90、site12、docs3及根目录运维/交接文件；沿用上文各 LC 的业务映射，全部未关闭 PL 保留，不把已编码/离线测试视为真实验收。新增 Windows 脚本及新电脑迁移说明归 LC-001/LC-014，供应商/生成/成片累计实现按原条目追溯。

本轮仅清理35个文件末尾多余空行，修复 git diff --cached --check 的错误码2；生成文件不改契约语义，不需要重新生成 OpenAPI。前端 pnpm exec tsc --noEmit 与 documentation.py AST 语法检查通过；既有全量测试仅保留历史证据，未重新执行。未修改真实配置、迁移数据库、重启服务或调用模型。真实 .env、常见私钥及数据库备份路径未跟踪，代码保存不代替数据备份。工作树待提交批次；提交后的精确 SHA 将在后续追溯记录中登记。
