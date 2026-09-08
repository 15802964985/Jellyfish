# Jellyfish 中文版配置使用手册

## 换电脑 / 新电脑首次部署入口

完整步骤见 [新电脑部署与数据迁移](Jellyfish-新电脑部署与数据迁移.md)。先选择“全新空库”或“延续旧系统”，按环境与磁盘准备、精确二开代码、受保护配置、数据服务创建、SQL/对象恢复、迁移/seed、应用检查、任务调度、验收与回滚顺序操作。

新电脑没有既有容器，不能直接运行日常 Start 脚本；首次部署成功后才转第3节日常启停。只克隆 GitHub 不包含未提交二开、数据库、素材或 .env。保留旧机直到新机验收完成，严禁双机同时执行同批任务；清理旧数据/备份需单独确认。本流程文档已核对当前代码和官方安装资料，未在新电脑实机演练。

## 2026-09-08 Windows 脚本复查修正（LC-001 / LC-014）

工作树待提交批次：共享脚本新增 API/页面 HTTP 就绪检查和最终容器复核，避免 running 即报成功；停止/提交前输入 YES 确认，自动化需显式 -Yes，Preview 始终只读；add 后再次检查实际索引敏感路径。三份根目录 CMD 入口路径与退出码处理正确，保留不变。详细用法见根目录 WINDOWS-SCRIPTS.md。

12 项隔离模拟测试、三项本机只读预览、UTF-8 BOM 检查通过。未实际启停、暂存、提交、推送、迁移或调用模型。停止仍需人工确认任务已结束；推送包含全部未忽略改动，文件名防护不能代替源码内容密钥审查。当前 personal origin 与固定分支通过本地预览，未验证远程登录权限。所有业务 PL 待办保持不变。

## Windows 一键脚本（2026-09-08）

日常启动/停止优先使用根目录 Start-Jellyfish.cmd / Stop-Jellyfish.cmd：双击后显示服务清单，启动等待数据服务健康，停止先应用后数据。只操作已有七个容器，不执行迁移、seed 或构建。启动前打开 Docker Desktop；停止前等待生成任务结束。

Push-Jellyfish.cmd 提交全部未忽略改动到个人 origin 的 local/stable-codex-0718 分支；普通 push，不自动合并或强推。提交前完成测试与文档语义同步，之后用输出的精确 SHA 更新台账。首次可能需要 GitHub 登录。

详细服务清单、核心边界、预览命令、自定义提交说明及失败处理见 [Windows 一键脚本说明](../WINDOWS-SCRIPTS.md)。共享脚本采用 UTF-8 BOM；三项只读预览和七项模拟测试通过，本批未实际启停或推送。

## 新对话、换项目目录时如何接续工作

项目记忆入口为根目录 [PROJECT_MEMORY.md](../PROJECT_MEMORY.md)。它记录核心业务目标、二开现状、未完成计划、部署证据及升级规则。AGENTS.md 已设置接手必读和同批更新约定，但新对话不是天然继承旧聊天；请主动提供入口。

1. 在新对话打开实际项目根目录；换目录时一并保留 AGENTS.md、PROJECT_MEMORY.md、docs 台账/手册及 site 中的架构/计划/升级 SOP。不要只复制代码文件。
2. 发送：“当前根目录是【实际路径】。先完整读取 AGENTS.md、PROJECT_MEMORY.md 及其指定的台账和相关计划，只读核实现状，简述核心目标、已完成与未完成内容后，继续【本次任务】。完成后同步项目记忆和二开文档。”
3. 若无法直接访问目录，先附上 PROJECT_MEMORY.md，再按需提供相关台账/计划；未读到的代码不能视为已核实。
4. 换目录不等于迁移 Docker 数据或切换生产服务；历史路径、镜像、数据库版本需现场确认。原有付费/破坏性授权不自动扩大。
5. 每次二开由执行者在同批修改中更新记忆和台账；未新增后台自动同步程序。完整开场指令和维护检查见项目记忆第 9、10 节。

本次仅完善交接文档，无需部署重启或数据库迁移。

## 2026-09-08 15:34 筛选下拉显示修复（已部署）

总览的下拉选项被抽屉遮挡，并非模型数据缺失。本次已统一提高四个筛选框及“每页条数”菜单层级，只更新前端。打开 http://127.0.0.1:7788 后Ctrl+F5，再进入模型管理→模型→场景选型说明，检查场景、类型、供应商、状态和每页条数菜单。无需重建模型或修改供应商配置。

前端16项测试、类型和生产构建通过，线上主文件index-DrsraUNG.js；浏览器工具启动失败，实际点击验收待补。后端及数据库未重启、无迁移或收费调用。回滚镜像jellyfish-front:rollback-overview-dropdown-20260908已保留。

## 2026-09-08 场景选型总览说明（已部署）

2026-09-08 15:17（北京时间）经授权部署重启完成，“场景选型说明”已调整为完整型号总览。打开 http://127.0.0.1:7788 后按Ctrl+F5刷新，再按以下步骤查看。不需数据库迁移，未修改默认模型或现有账户。

1. 进入“模型管理 → 模型 → 场景选型说明”。默认列出项目离线已接入的国产型号与已保存型号，不要求先创建模型；已保存的排在前面。
2. 横向阅读：供应商/型号 → 系统接入能力 → 我的配置 → 适用场景 → 限制与配置说明。系统支持只针对列出的业务模式，不代表官网所有功能。
3. 按场景、生成类型、供应商、配置状态或名称/账户搜索缩小范围；“全部已保存”包括待完善记录。分页固定在窗口底部，可切8/16/32条。
4. “未配置”表示还没保存该型号；“已保存·待完善/核验”可能缺少密钥、禁用、端点不符或精确型号待核对；“已配置·待实测”不等于真实调用成功。展开行可查看各账户原因。
5. 未配置型号点击“配置此型号”，预填型号/类型；有多个账户需手动选择。“先配置供应商”会引导到供应商页。同型号多个账户可分别“查看/完善配置”，不会自动覆盖其他账户。
6. 自定义文本接口可显示协议适用方向，但未经核验的具体型号不会被标成已接通。切换“全部厂商”时，缺少离线精确目录的厂商会显示覆盖边界；不把厂商名称当作型号支持证据。
7. 官方文档/开通指引用于核对地域、权限与购买条件；本页不自动购买、不读取账户余额、不调用生成接口，也不会切换默认模型。第一次生成前自行确认API计费，网页积分不等于API额度。

本轮编码自检：全量后端590项、前端15项通过，OpenAPI/客户端及类型/生产构建通过。部署验收：前后端健康、总览接口、新前端index-aOZLRtSh.js均通过；任务执行器pong。当前国产目录62条（已保存7、未配置55），全部厂商67条；数量随目录及配置变化。浏览器连接此前被本机沙箱错误阻断，尚未完成真实浏览器验收；未做收费调用。MiniMax人物参考、即梦图片公网参考等原计划待办保持不变。

回滚镜像保留为四个jellyfish-<服务>:rollback-overview-20260908-1515，原备份未删除。数据库revision a7b9c1d3e508不变，MySQL/Redis/RustFS未重启，业务数据沿用原有一份；回退应用不需还原数据库。

## 2026-09-08 国产模型新接入（PL-014，已部署）

2026-09-08 14:17（北京时间）经用户授权，已构建并重启四个应用服务。本节功能已部署到 http://127.0.0.1:7788；请先 Ctrl+F5，再进入模型管理查看供应商配置及场景选型说明。未修改现有默认模型/账户；没有新增数据库表或迁移。代码与 Mock 测试不等于真实账户验收；网页/App 会员和积分不能等同 API 余额，价格/地区/免费期限须由用户在厂商控制台核实。

编码阶段自检：后端571项通过（含45项新用例）、前端现有刷新/帧图7项通过，接口客户端重新生成，类型检查和生产构建通过。部署阶段：前后端health/首页、场景建议、供应商支持接口均200，任务执行器pong，前端已提供index-DOMcQMbP.js；数据库revision保持a7b9c1d3e508，MySQL/Redis/RustFS未重启。真实浏览器交互及收费小样尚未验收。

回滚保障：四个旧应用镜像保留为 jellyfish-<服务>:rollback-pl014-20260908（服务为backend、celery-worker、celery-beat、front），原备份/业务卷未删除。本次未改数据库，若需回滚应只切回这四个应用镜像，不还原或清空业务数据。MiniMax人物参考、即梦图片公网参考导出等未完成项仍按PL-014跟踪，不因部署而视作完成。

### 配置顺序

1. 模型管理→供应商→新增，填写名称并选择实际调用协议。读取新出现的开通提示，前往官方平台核对账户地域、模型权限、API 价格与后付费开关；自行决定是否开通/购买，系统不代购。
2. 设置对应 Base URL 和凭据。已有端点不自动覆盖；MiniMax 国内/国际账户、混元旧平台/TokenHub、方舟套餐/即梦 Visual 均不可混用。
3. 模型管理→模型→新增，选择供应商、类别及内置目录候选。候选只代表适配代码范围，不证明你有权限/免费额度。配置好后按需在“默认模型”指定默认值。
4. 打开“场景选型说明”：默认国产，从全部已保存模型读取候选。查看“可作为候选/暂不推荐”、具体输入要求和官方文档；不会替你改默认模型。编辑配置后点“重新读取配置”。
5. 先预览最终提示词与参考素材；超长提示会在提交前拦截，须保留角色、动作和关键细节后人工精简，不能把增加规则当成允许无限长输入。
6. 第一次真实生成可能收费。先小样验证：任务成功→资产/帧/视频可见→下载/播放→采用→后期使用。界面“连接成功”及静态核查均不代替这一步。

| 协议 | API 地址与凭据 | 当前开放范围 / 约束 |
| --- | --- | --- |
| MiniMax | 中国站 https://api.minimax.cn/v1；国际账户保留其官方地址；API Key | image-01/live 标准档文生图；Hailuo-2.3/Fast/02 为768P、6/10秒；Fast须首帧，只有02开放首尾帧。当前不接入通用图片参考 |
| 智谱 BigModel | https://open.bigmodel.cn/api/paas/v4；API Key | GLM文本；GLM-Image/CogView文生图（不能参考生图）；CogVideoX-3文生/首帧/双帧5/10秒。不能用Coding Plan地址替代媒体API |
| 腾讯混元（TokenHub） | https://tokenhub.tencentmaas.com/v1；TokenHub API Key | HY文本；hy-image-v3单图、最多3参考图、面积≤1024×1024；hy-video-v1.5为5秒720p文生/首帧，图生画幅遵循首帧，无尾帧 |
| 即梦（独立视觉API） | https://visual.volcengineapi.com；API Key填AK，API Secret填SK | t2i_v40_jimeng标准2K单图文生；jimeng_i2v_first_tail_v30为720p双帧5/10秒。必须首尾帧；不是文字修改原视频 |

MiniMax 配音：新建音频模型，例如 speech-2.8-hd，在参数JSON中显式填写：
```json
{
  "audio_endpoint": "https://api.minimax.cn/v1/t2a_v2",
  "voice": "填写该账户已授权的官方音色ID",
  "voice_setting": { "speed": 1, "vol": 1, "pitch": 0 }
}
```
该值是音色占位说明，不能原样用于生成。镜头配音当前开放 Chinese/English/auto、MP3非流式输出；不接受自由配音指令，不等同音效/音乐/声音克隆。新建后选择模型和音色，配音结果进入镜头音轨及已有音频合成流程。音色/模型仍须真实账户验收。

### 场景补充与边界

- 剧本提取/角色检查：在千问、豆包、DeepSeek、MiniMax、GLM、HY中按实际结构化输出和延迟对比；不是越大越好，需检查遗漏、拒答与截断。
- 概念图：可比较原有模型与新MiniMax、CogView/GLM-Image、混元、即梦；演员一致性优先选项目已接通参考图的型号。
- 单帧驱动表演：海螺/可灵/Seedance/混元均为候选方向，不保证复杂互动零穿帮。先确认首帧道具比例、服装和人物，再付费生成。
- 首尾过渡：Hailuo-02、CogVideoX-3、即梦双帧或原有支持双帧的型号；必须根据该型号时长/图片比例设置，不把关键帧当尾帧。
- 原视频文字修改：仍用已有专用编辑入口和已接入编辑模型。本批新增图生/双帧生成不是原片编辑，不复用旧视频当免费修改。
- 即梦图片参考需要公网URL，本地文件导出尚未开放；MiniMax人物参考语义入口待补。选择不支持的素材会明确拒绝，不会静默丢弃。可以改用已接通本地参考图的模型，不能因此把RustFS改成匿名公开。
- 取消只保证本地停止等待；远程已提交任务可能继续执行/计费，不承诺退款或崩溃自动续跑。
- 未配置/禁用/缺凭据/端点错误会被标为暂不推荐。未知额度显示未核实，不提示“免费生成”。

官方核对入口：[MiniMax](https://platform.minimaxi.com/docs/api-reference/api-overview)、[智谱图像](https://docs.bigmodel.cn/api-reference/模型-api/图像生成)、[混元TokenHub](https://cloud.tencent.com/document/product/1823/130078)、[即梦图像4.0](https://www.volcengine.com/docs/85621/1863351)。最新验收/限制/未完成项见 site/content/docs/plans/domestic-provider-integration.md 和二开全量变更清单。


## 2026-09-08 部署确认（PL-013，当前运行版本）

已获用户授权，约 11:51（北京时间）从 E:\JellyfishNew 构建并替换 backend、celery-worker、celery-beat、front；部署后健康及资源核验通过。本节部署状态优先于下方历史“候选未部署”记录。工作树待提交，本次未变更业务代码。

- 使用同一 jellyfish Compose 项目、.env 和 secure-local 覆盖，执行 up -d --no-deps --no-build --timeout 60，仅替换应用四服务。未运行数据库迁移/初始化，未重启 MySQL、Redis、RustFS，未删除业务卷或既有备份；迁移版本仍为 a7b9c1d3e508。切换前没有 pending/running/streaming 生成任务。
- 后端 /health、/api/v1/health、前端首页及新 JS 均 HTTP 200；前端 index-C0l3Rg-U.js 包含编辑接口。线上 OpenAPI 已出现 video-edit-preflight、quality-review、video-edits、video-edits/{task_id}/adopt；Celery Worker ping 返回 pong，定时任务正常投递执行。
- 运行镜像摘要（sha256 前缀）：backend f847190a2b15；worker 0eb771c74f0a；beat a8306190fe27；front 28dbf18299c3。四个原镜像均保留 rollback-pl013-20260908 标签；不自动清理。
- 验证边界：这是部署/健康验收，不是付费端到端验收。未调用收费模型，未修改模型配置；真实浏览器交互、真实编辑输出/音轨对齐仍待验收，PL-013 不整体关闭。此前 526 项后端、7 项前端及隔离音轨验证保持为代码自检证据。

访问 http://127.0.0.1:7788，旧标签页先 Ctrl+F5。进入“分镜工作室”：在首帧/关键帧/尾帧或视频提示词窗口使用可选质量预检；在主预览区域打开视频编辑，按面板配置 fal.ai 或 Runway 的独立 API 账户后选择原片、编辑说明与可选附件。免费规格检查不调用模型；AI 预检及编辑提交需确认外发和费用，结果须人工采用，不自动覆盖原片。详细配置步骤见下节。

## 2026-09-08 新功能使用步骤（候选代码，尚未部署）

本节覆盖下方同日历史说明。代码已写入 `E:\JellyfishNew` 并做离线自检；当前运行页面不会仅因文件修改就自动升级。未重启生产服务、未调用收费接口、未删除备份。本批无新增数据库表或列，不需要新增迁移。

### 一、生成前检查质量

1. 进入项目→章节→分镜工作台，打开帧图或视频的提示词预览。
2. 展开“生成依据与质量规则”，检查当前镜头、章节、关联资产及来源警告。找不到精确摘录仅表示需要核对，不代表剧情一定错误。来源发生变化时重新渲染，否则提交会提示重新预览。
3. 可展开“可选 AI 质量预检”，选择已配置文本模型，确认外发与费用后提交。默认只检查文字；结果为修改建议，你需自行审核后调整提示词、重新预览，不会自动付费重生成。
4. 如需图片检查，明确勾选当前参考图（最多4张、单图10MB内），使用已核验的百炼 Qwen 视觉型号，例如 qwen3.8-max、qwen3-vl-plus。没有百炼额度时不要启用这一路图片预检；仍可用其他已接入文本模型检查描述。其他供应商视觉协议尚未开放，不会静默丢弃图片改成纯文字。
5. 同样的来源、提示词、模型版本和图片版本复用任务。失败/取消后需要重试时，点击“准备手动重试”并重新确认费用；取消不保证远端退款。结果不等于“零穿帮认证”。

已核验的 Wan2.7 指定版本及 HappyHorse i2v 提示词超限会阻止提交，而非让模型截掉尾部细节。其他型号显示未核验，不代表没有长度限制；不要把整章无关内容塞入单镜头。

### 二、配置非百炼的视频编辑模型

在模型管理新增独立供应商和视频模型；使用提供 API 的平台自己的账户和 Key，不要把其他平台的会员或套餐 Key 复制过来。

| 服务 | Base URL | 模型名（精确复制） | 使用限制 |
| --- | --- | --- | --- |
| fal.ai（视频编辑） | `https://queue.fal.run` | `fal-ai/kling-video/o3/pro/video-to-video/edit` | MP4/MOV，3–15秒，720–3840px，200MB内；最多4张参考图片 |
| Runway（视频编辑） | `https://api.dev.runwayml.com` | `aleph2` | MP4/MOV，2–30秒，最高1080p、30FPS；最多5张指定秒数的参考图；本次直传单文件编码后最多5MB |

购买前到 [fal 官方型号页面](https://fal.ai/models/fal-ai/kling-video/o3/pro/video-to-video/edit/api) 或 [Runway Dev 官方说明](https://docs.dev.runwayml.com/guides/models/) 核对价格、地区和账户开通情况。Runway 网页会员与 API 余额不同；fal 接口不消耗现有可灵会员或百炼额度。系统不会代充值、自动使用另一计费通道或保证套餐覆盖。

这两种模型只在“文字编辑视频”使用，不能设置为普通视频生成默认模型。供应商的普通文本连通性测试不适用于它们；先免费检查输入，再另行确认真实生成费用。

### 三、用文字和图片修改已有视频

1. 分镜工作台主预览区点击“文字编辑视频”。已有视频可作为原片，也能从素材库选择或本次上传 MP4/MOV。
2. 输入具体修改内容和希望保持的内容。fal 示例：“调整 @Video1 中道具与使用者的相对比例，参照 @Image1；保留角色、动作与机位。”不要仅写“改好看一点”。不能保证模型逐像素只改指定区域。
3. 上传或从素材库选择参考图片；TXT/MD 会加入可编辑说明，不作为图片传入。Runway 参考图需填写它指导的画面时间（秒），不使用 fal 的 @Image 编号语法。非支持附件不要替代为另一个媒体类型。
4. 点击“免费检查输入规格”。系统读取真实时长和分辨率，超限要求换片段/模型，不自动裁剪、降画质或截断。检查通过不代表账号有额度或内容必然合格。
5. 选择是否保留原音轨，明确确认外发和费用，再生成编辑版本。任务可取消，窗口可关闭；下次打开从“编辑历史”查询任务和结果。
6. 对比原片与新片后点击“比较后采用”。仅更新当前镜头文件，原片仍在素材文件库；别人已修改当前视频时会阻止覆盖，要求重新比较。既有时间线不会被偷偷替换，需按后期流程确认采用内容。
7. Runway 保留音轨由本地处理，源片与输出时长不一致会失败并保留供应商原始结果供下载；先排查后处理，不要因此重复付费生成。

### 四、本次自检与后续验收

全量后端526项通过，既有前端任务/图库7项通过，类型与生产构建通过。隔离 Docker 内已用合成素材验证音轨合成（3.008秒、1280×720、AAC），未接触数据库或密钥；AAC 重编码不代表音频字节无损。真实浏览器交互因工具启动失败尚未验收，真实模型输出仍需做小样。生产部署和收费小样需分开确认。Luma、百炼编辑、掩码及裁剪拼接等条件增强仍记录在二开台账，不能视为已上线。

## 2026-09-08 候选修复：资产描述进入视频指令（未部署）

部署本批后，修改已关联道具、角色、场景或服装的描述，再重新预览视频提示词，将读取资产当前内容，不只使用导入时的旧候选描述；明确清空描述也会生效。描述是否逐字包含只用于追溯，不能保证模型完全遵循。

内部任务来源记录可定位镜头、章节和关联资产，章节摘录被改写时记为待核对，不自动判错或改写剧本。当前没有新增来源审核页面；无需修改模型配置。本批仍未部署，文字编辑视频等后续功能仍不可用。

## 2026-09-08 开发进度说明（未部署）

本次视频质量与视频编辑仍在分阶段开发，不能将候选代码当成线上功能。当前基础规则与预览已编码，任务内部新增最终提示词哈希及保留规则追溯；没有新增任务中心调试面板，不需要用户修改配置。预览后手动删改规则，以最终提交文本为准，内部记录不会把已删除要求记为已应用。

这不是 AI 视觉检查，也不是完整章节事实审计。AI 预检、fal.ai/Runway 文字编辑视频、附件编辑及购买配置引导尚未接通；当前不用购买新套餐。计划与实际进度统一见 site/content/docs/plans/video-quality-and-editing.md，二开迁移时同时核对已实现项与未关闭 PL-013。

## 待部署功能：生成依据与质量规则（2026-09-08）

本批候选代码在帧图/视频提示词预览增加“生成依据与质量规则”。部署后可展开查看相关描述来源及实际补入的规则。它是免费基础编译，不代表 AI 检查图片正确、也不保证零穿帮；改动输入后应重新渲染报告。

当前未部署，线上暂看不到该功能。fal.ai/Runway 视频编辑、附件编辑与购买配置引导仍在后续开发，不要根据此前调研名单尝试调用未接入型号。

## 分镜帧图片成功但不显示（2026-09-07 修复）

已于 18:49 更新前端。请刷新浏览器后查看；如仍使用旧页面，可按 Ctrl+F5 强制刷新，无需重新点击生成。

任务中心成功、卡片暂无图片曾由新旧任务关系查询不兼容导致。修复后进入分镜工作室会读取该镜头已保存帧图和新旧任务历史；生成完成/手动采用后自动刷新帧列表。已有图片不需要重新生成。

首帧、关键帧、尾帧属于各自分镜：当前镜头没有首帧时，不会借用另一个镜头的首帧。任务中心显示其他镜头的成功任务不代表当前镜头三类图片都已生成。慢任务在当前页面以 10 秒间隔跟踪；离开页面不取消后台任务，重新进入可读取已完成产物。

## 视频报错：首帧与 Agent Plan（2026-09-07）

本批代码已于 18:38 部署，浏览器刷新后生效；前端/API/Worker 健康检查通过，真实付费视频由用户验证。

1. happyhorse-1.1-i2v 是图生视频：在分镜工作室先生成或上传该镜头的首帧，再选择首帧参考生成。只有资产关联照片不代表镜头已有首帧；系统不擅自把角色照片当首帧。批量生成会使用每个镜头已有首帧，缺失的镜头不能生成。
2. 只有文本时应明确选择支持文生视频的型号，例如已配置且账号可用的 t2v；不会自动切换型号或计费入口。I2V 官方要求单张首帧，首帧决定画幅，不发送 ratio。来源：[官方 I2V API](https://help.aliyun.com/zh/model-studio/happyhorse-image-to-video-api-reference)。
3. 火山 HTTP 404 若同时为 UnsupportedModel 且提示 agent plan，说明所请求型号未被该 Plan 接受，不代表应删除 URL 中 /plan。此次控制台截图提示 Seedance 1.5 即将下线且不支持新增接入、Medium 暂不支持 Seedance 2.0；向火山工单提供精确型号、套餐及 request_id，请其确认可用权限或替代型号，不要提供 API Key。
4. 保留控制台给定的 Plan 视频地址。标准 /api/v3 可能另行计费，禁止为了消除 404 擅自替换。语音的 openspeech /api/v3/plan/tts/unidirectional 与视频协议不同，不能填进视频地址；语音截图不表示本系统已支持该语音适配。
5. 本批修复后请刷新浏览器，旧失败任务不会自动重试。先检查镜头首帧与准备度，再由用户发起真实生成；离线回归通过不等于供应商付费生成已验收。

## 自助供应商与新适配器（2026-09-07 已部署）

本节对应迁移 a7b9c1d3e508，已执行并切换新版服务。原供应商无需删除或重录；若仍看到旧界面，请刷新网页。486 项后端回归、前端类型检查与构建通过；真实新供应商生成仍需自行配置账户并确认费用。

此次恢复备份保留在 `E:\JellyfishNew\backups\provider-adapter-a7b9-20260907`，包含 SQL 和原运行应用文件，不是第二份在线业务数据库。正式系统仍使用原数据库和 RustFS 数据卷。不要上传备份（可能包含敏感配置）；验证用临时内存数据库已销毁，磁盘备份尚未删除。

1. 模型管理 → 供应商 → 添加：填写任意便于识别的供应商名称，再选择“调用协议 / 适配器”。供应商名字不决定实际接口。
2. 新增兼容文本服务可选择“自定义兼容接口（仅文本）”，填写该服务官方 Base URL 与 API Key；模型名称按官网填写。目录接口不存在时手动录入，不自动改端点或模型。兼容文本不是图片/视频/音频通用协议。
3. Google 使用 GenerateContent、Claude 使用 Messages、MiniMax 使用兼容文本协议；分别配置各自官方账户端点和 Key，不混用套餐 Key。新文本协议仅接入文本业务，未实现工具或直接图片理解。可用于业务 JSON 提取，但仍需检查候选证据与字段，不能认为所有模型都会遵守 Schema。
4. BFL 图片当前支持 flux-2-pro / flux-2-pro-preview 文生图及 flux-kontext-pro 单参考图。FLUX.2 不能在当前适配中使用本地参考图；系统会明确拒绝，不静默丢弃参考。BFL 未接入视频/音频。
5. 已有模型的供应商可以改名；更换调用协议请新建供应商，再调整需要迁移的模型。切换协议选择不会覆盖已经填写的 Base URL。已提交任务保留当时协议、型号及端点；凭据仍读取所引用供应商当前 Key。
6. 免费“接入核查/读取官方正文”不等于真实生成验收；“测试生成”或业务生成可能产生费用。Google 图片/视频、MiniMax 视频/语音、自动官网语义比对仍在开发，请勿按已完成使用。

开发验证：正常仍运行 `pnpm run openapi:update` 从本机 8000 同步 API。需要在数据库迁移前检查候选接口时，可设置 `JELLYFISH_OPENAPI_URL` 指向隔离 schema-only 服务；不要把运行中的旧版 OpenAPI 覆盖候选新版类型。此次未更换模型默认值、套餐端点或凭据。

## 场景选型与官方文档读取（2026-09-07 新批）

模型管理 → 模型：顶部“场景选型说明”；添加/编辑模型时也可点“如何选模型？”。按业务阅读必需能力，再选供应商、具体型号和账户套餐；参考图/首尾帧/TTS 指令不能从模型类别推断。

模型列表更多 → 接入核查 → 读取官方正文：只访问登记的官方文档，不带模型 Key 或剧本、不产生生成调用。页面显示获取时间、正文哈希及纯文本；遇到跳转、动态页面或网络限制可能失败，可打开官网人工核对。此批按点击读取，未实现保存模型后自动读取；正文仅本次临时展示，获取成功不等于智能核对通过。

新增 DeepSeek 供应商只支持文本，可用自己的 Key 获取目录并配置模型；没有账号可暂不配置，不影响原有默认模型。Google/MiniMax/Claude/FLUX 在计划内，尚未全部接入。真实测试可能收费，不能把说明中的候选当作已在本账户验收。

## 模型接入核查（2026-09-07 首批）

模型管理 → 模型 → 列表行“更多” → “接入核查（免费）”。查看当前端点、类别适配器、官方文档入口及业务验收清单；修改配置后可重新核查。

此功能目前只检查本地配置，不自动读取官网，不调用付费生成，不外发剧本/密钥，也不读取历史真实验收结果。“已注册类别适配器”不等于该具体模型可用于全部业务；“契约待核对”也不表示已有模型必然不可用。

自动官网采集、智能差异分析与版本化验收仍在开发计划中。不要仅凭供应商连接测试或模型目录断定已打通；套餐地址不会自动切换到按量地址。后续失败详情可包含供应商错误码和请求 ID，便于定位。

> 适用环境：Windows 10 + WSL2 + Docker Desktop，本机目录 `E:\JellyfishNew`
> 适用代码：作者 `codex/0718` 分支（基线 `508f2c7`）+ 本地二开集成分支
> 更新日期：2026-09-07
> 文档原则：不记录数据库密码、Redis 密码、对象存储密钥或模型 API Key

## 1. Jellyfish 是什么

模型兼容边界：相同供应商的不同模型、思考模式与套餐端点可能支持不同参数。当前深度分析的格式兼容不代表所有模型均已通过原生结构化输出验收。供应商文档及逐模型适配按 `site/content/docs/plans/model-aware-script-analysis.md` 跟踪；不会因失败擅自切模型、改标准付费端点或再发一次分析。

深度分析可靠性更新（2026-09-07）：系统将完整输出规范与语义规则一起交给模型，不要求剧本采用固定标题或 Markdown 模板。结构错误时不会由 Agent 自动再发起第二次分析；错误展示字段位置而非剧本文本。转换过的项目设定会提示复核，缺失人物类型/镜头归属不能猜测入库，所有结果仍需审查确认。历史失败任务不会因更新自动恢复；原始响应留存、免费重新解析及细化阶段进度仍在完善中。

### 近期修正：模型保存与图片结果展示（2026-09-07）

新建模型成功后，列表自动切到该模型类别（含音频）、清空旧搜索条件并回到第一页。图片快速生成或资产详情生成提交后，每 10 秒检查任务，成功后自动更新图片；超过一分钟仍会继续跟踪，不需要离开页面重新查询。任务失败可到任务中心查看原因。此更新上线后，已打开的旧页面需要刷新一次以加载新版前端。

参考素材是否参与，应以该次生成冻结的参考文件输入为准，而不是仅看当前资产关联。图片作为模型参考输入，不代表人物外观会被严格复刻；后续调整关联不会改写历史任务的参考记录。

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

日常启动请双击根目录 `Start-Jellyfish.cmd`，或在 PowerShell 中执行同一共享实现：

```powershell
Set-Location "E:\JellyfishNew"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\Jellyfish.ps1 -Action Start
```

脚本核对七个现有常驻容器的归属，先启动数据服务并检查健康，再启动应用并检查 API/页面。它调用 `docker start`，不读取新的 `.env`，不构建、不重建、不执行迁移或 seed。容器缺失时中止，应按部署恢复流程处理。

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
- 若使用 Compose up 留下一次性容器，`backend-migrate`、`backend-seed-system-data` 应为 `Exited (0)`。若按新电脑流程使用 `run --rm`，成功后容器已移除，缺少该行是正常的；以执行退出码及数据库版本/系统数据核验为准，不必重新跑迁移制造状态行。

### 3.4 停止 Jellyfish

先确认任务中心没有未结束任务，再双击 `Stop-Jellyfish.cmd`；或执行：

```powershell
Set-Location "E:\JellyfishNew"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\Jellyfish.ps1 -Action Stop
```

输入大写 `YES` 确认后，按前端/API/Beat → Worker → 数据服务停止，保留容器、网络和数据卷。Worker 最多等待120秒，其他停止命令为60秒；超时可能强制结束，远端生成不保证取消或停止计费。恢复时使用 3.2 的启动入口，不用 `up -d` 代替。

> 不要执行 `docker compose down -v`。参数 `-v` 会删除数据库和对象存储卷，可能造成项目数据无法恢复。

### 3.5 重启、加载新配置与更新部署的区别

| 需求 | 正确操作 | 配置与数据边界 |
| --- | --- | --- |
| 开机后恢复已有服务 | Start-Jellyfish.cmd | 沿用容器创建时配置和已部署镜像 |
| 日常停止 | Stop-Jellyfish.cmd，输入 YES | 保留容器与数据；先等任务结束 |
| 原配置下重启整套服务 | 停止成功后再启动；停止失败先排查 | 不会加载修改后的 .env 或新代码 |
| 修改 deploy/compose/.env | 核对变量用途，备份配置，按变更范围重新创建受影响容器 | 只有 Compose 引用或 env_file 注入的变量才进入容器；不能靠 restart/start 加载新值 |
| 修改代码 | 测试后构建对应应用镜像，再定向替换应用容器 | 新源码不等于线上版本已更新；无 schema 变化不运行迁移/seed |
| GitHub 升级或数据库结构变化 | 完整执行第9节及升级 SOP | 候选目录、隔离验证、备份、审核迁移与切换；不是日常启停 |

日常启停的唯一推荐入口是根目录脚本；`docker compose up` 属于创建/更新部署，不与 `docker start` 混称。无 `-v` 的 `down` 虽通常保留命名卷，仍会移除容器和网络，导致现有启动脚本无法恢复，不能作为日常停止命令。

应用配置更新必须使用同一 `jellyfish` 项目、明确的 `--env-file`、基础 Compose 和 secure-local 覆盖；按受影响的 backend/worker/beat/front 定向重建，并显式控制依赖、构建与迁移范围。更新时先核实实际容器/卷，不重建保留历史标签的 RustFS。数据库或对象存储密码不能只改 .env：持久化服务端凭据需专门的协调变更流程。

本节不提供可盲目执行的全栈重建命令；更新部署应按具体差异制定命令并验证健康、Worker、历史文件和业务结果。详细日常参数见 [Windows 脚本说明](../WINDOWS-SCRIPTS.md)。

## 4. 首次模型配置

打开模型管理页面：<http://127.0.0.1:7788/models>

当前版本的供应商适配能力：

| 供应商 | 文本 | 图片 | 视频 | 语音 |
| --- | ---: | ---: | ---: | ---: |
| OpenAI | 支持 | 支持 | 支持 | 未接入 |
| 阿里百炼 | 支持 | 支持 | 支持 | 支持非实时 TTS |
| 火山引擎 | 支持 | 支持 | 支持 | 未接入专用鉴权 |
| Vidu | 不支持 | 支持 | 支持 | 不支持 |
| 可灵 AI | 不支持 | 支持 | 支持 | 不支持 |

“支持”表示 Jellyfish 已有相应协议适配器，不代表同一 Model ID 能同时完成多类任务。每条模型记录只能选择一个类别，Model ID 必须确实具备该类别的能力。

### 4.1 本机当前模型配置快照

本机当前有两个活跃供应商，API Key 已配置但不会在接口和本手册中回显：

| 供应商 | 文本/通用 Base URL | 图片 Base URL | 视频 Base URL |
| --- | --- | --- | --- |
| 阿里百炼 | `https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1` | `https://token-plan.cn-beijing.maas.aliyuncs.com/api/v1` | `https://token-plan.cn-beijing.maas.aliyuncs.com/api/v1` |
| 火山引擎 | `https://ark.cn-beijing.volces.com/api/plan/v3` | 留空，回退到通用 URL | 留空，回退到通用 URL |

注意：上表是已保存配置，不代表各模态已验证成功。2026-09-07 火山视频继承 Plan 通用地址后请求 `/contents/generations/tasks` 返回 404，当前不可作为视频已接通的依据。需要按套餐的官方视频 API 示例核对 Base URL、鉴权及模型；不要未经核对就改用标准 API，避免凭据不兼容或改变费用来源。

配音音效上传只接受 MP3/WAV/M4A/AAC/OGG/FLAC（最大 500MB）。MP4 即使包含声音也属于视频，请先提取音轨再上传；此版本不自动提取。以前“上传成功、创建音频失败”的视频仍在文件库，不必重复上传。

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

### 4.2 配置阿里百炼文本、图片、视频和语音模型

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
| `qwen3-tts-flash` | 语音 | 非实时对白/旁白；可使用系统音色 |
| `qwen-audio-3.0-tts-flash` | 语音 | 高表现力语音；需要 Workspace 专用端点和音色 |

模型名称必须是供应商 API 接受的准确 Model ID，不要填写营销展示名称。文本模型可以设置 `{"temperature": 0.7}`；图片和视频参数优先在具体生成页面选择，未确认供应商是否接受的字段不要写进通用参数。

语音模型参数示例：

- `qwen3-tts-flash`：可填 `{"voice":"Cherry"}`；不填时 Jellyfish 默认使用 `Cherry`。系统使用官方 multimodal-generation 地址，不复用文本兼容地址。
- `qwen-audio-3.0-tts-flash` 或 CosyVoice：必须填 `{"voice":"你的音色ID","audio_endpoint":"https://你的WorkspaceId.cn-beijing.maas.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer"}`。`audio_endpoint` 是完整地址，不是 Provider 的文本 Base URL。

百炼非实时 TTS 返回的 URL 只临时有效。Jellyfish Worker 会在任务成功时立即下载到 RustFS，并建立全局音频资产和镜头音轨；任务数据中不会保存 API Key。

Token Plan 的 compatible-mode `/models` 可能不返回视频或语音模型。当前版本会先尝试业务空间目录，再把实时结果与 Jellyfish 维护的已接入目录合并，所以“阿里百炼 → 视频生成”应至少显示上述三个 HappyHorse 1.1 模型，“语音生成”会显示已接入的 TTS 模型。ASR 和实时语音对话不会误入文本或语音生成类别。仍可手工输入 Model ID，但手工录入不等于该模型参数已经适配。

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

进入“模型管理 → 模型”，点击“默认模型”：

- 默认文本生成模型：选择 `qwen3.8-max`。
- 默认图片生成模型：选择图片类别的 `doubao-seedream-5.0-lite`。
- 默认视频生成模型：选择 `doubao-seedance-1.5-pro`，不要选择同名的 Seedream 记录。
- 默认语音生成模型：需要 AI 配音时选择已配置的阿里百炼 TTS；只上传真人配音或音效时可以留空。
- API 超时：本机当前是 30 秒，建议调整为 300 秒，以覆盖图片和视频创建请求。
- 日志级别：日常使用选 `Info`，排障时临时改为 `Debug`。

保存后再开始剧本拆解和媒体生成。

### 4.5 测试方式与 API Key 安全

- 供应商“测试连接”和文本模型“测试生成”会发起真实的低费用文本请求。
- 图片、视频、语音模型不在模型管理页直接试生成，应分别在图片、视频和镜头音轨工作台进行单任务测试，避免误触发高费用任务。
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

1. 可继续“新建章节”后粘贴正文，也可点击“导入剧本”。
2. 导入支持 TXT、MD/MARKDOWN、带文字层的 PDF 和 DOCX，单文件最大 25MB；扫描版 PDF 当前需要先做 OCR。
3. 文件先进入全局文件库，再由后端执行不收费的结构解析；此时不会直接创建章节，也不会把正文发送到模型供应商。
4. 在预览中核对文档类型、解析警告、章节标题、时长、主题和规范正文。概述、完整提示词、完整配音、音效及制作备注不会当作章节。
5. 如需提取演员、角色、场景、道具、服装、镜头和声音计划，点击“开始深度分析”。系统先展示当前默认文本模型、供应商和可能费用；只有点击“同意发送并开始分析”后才会把剧本正文发送给该供应商。任务冻结所确认的模型，不会因排队期间默认模型变化而改用其他供应商；API Key、数据库密码不会随剧本发送。
   深度分析采用一次完整的结构化模型调用：任务进入“进行中”且模型控制台已有用量，表示请求已经发出；结果返回前进度是阶段值，不会逐字增长，长剧本可能需要数分钟。可从任务中心取消，取消后导入窗口会恢复“开始深度分析”；若任务失败，可点“失败原因”查看供应商或系统记录的具体错误。
6. 深度分析完成后逐项审查资产候选。每项默认“忽略”，可改为“新建资产”“关联已有资产”或“仅作细节参考”；页面同时展示原文证据、来源类型、置信度和相似资产。没有人工选择的候选不会进入正式资产表。
7. 可勾选导入镜头草稿；这一步只写入镜头和业务关联，不生成图片或视频。点击“按默认视频模型规划时长”只在本地读取模型能力，展示合法时长、画幅和参考素材能力，不调用供应商；确认导入时会再次校验，并按所选模型把不合法的时长拆成合法片段。
8. 可同时把对白/旁白写入镜头台词。字幕、BGM、环境声、音效和静音会作为镜头级声音计划保存，在“章节生成工作台 → 配音音效”中可见；选择真实音频素材后才形成可播放音轨和后期合成配置。
9. 勾选需要导入的章节后点击“确认导入”。章节、人工确认的资产、镜头、关联、对白和声音计划在同一数据库事务中创建；失败整体回滚，重复点击不会重复创建。
10. 如果不使用深度分析，仍可只导入规范章节，并选择“导入后自动启动 AI 分镜提取”。该旧流程与智能导入并存；开启后会创建文本模型任务并产生费用。

上传并完成结构解析后，内容只作为当前导入窗口的临时预览，不会自动进入“导入草稿与历史”。只有人工点击“保存并稍后继续”，系统才保存当前勾选章节、标题/主题/正文修改、资产候选决策、镜头/对白选项和视频模型规划。关闭未人工保存的预览时，系统会清理临时工作记录，但原始上传文件仍保留在全局文件库。

人工保存后，再次打开“导入剧本”，可在顶部“导入草稿与历史”中点击“继续编辑”恢复，不需要重复上传。列表支持分页和刷新；未提交的已保存草稿可删除，但原始文件仍保留。已完成导入的记录用于追溯，只能查看，不能重新修改或删除，也不会影响已生成的章节。

原文件会保留；解析预览只有人工保存后才成为可恢复草稿。章节 `raw_text` 使用清理后的业务正文。长剧本建议先检查免费结构预览，再决定是否调用 AI；PDF 无文字层、乱码或未识别章节时不要直接提交。

解析器 `1.1.0` 会把 TXT、Markdown 表格、PDF 文字层和 DOCX 中识别到的章节统一为规范业务正文：章节标题中的 `(0-12 秒)` 会拆成独立起止时间和目标时长，标题不再残留半个括号；Markdown 的表头、竖线和分隔符会删除，但 `【主题】【画面】【镜头】【时长】【配音】【字幕】【画面提示词 · 中文/英文】` 等业务标签会保留。标签用于防止后续模型把配音、字幕误认为画面描述，并为分镜拆解、信息提取和提示词渲染提供明确上下文。

导入窗口右上方提供“查看格式与内容规范”。这些内容只是提高识别率的建议，不是固定模板要求。系统会对每章的画面、镜头、时长和声音字段做质量检查；看到“结构差异较大”时，应先核对该章预览。无法归类的自由文本仍会保留，不会因未命中字段名称而静默删除；可以直接人工编辑，也可以在确认供应商和费用后使用 AI 深度分析。

解析器版本参与草稿幂等判断。旧预览若显示“解析器 1.0.0”，需关闭当前预览并重新选择原文件，系统会按 `1.1.0` 创建新预览；已经提交成章节的旧内容不会被系统擅自覆盖。

本机正式数据库已迁移到 Alembic revision `f6a8b2c4d507`。最近一次迁移前逻辑备份为 `E:\JellyfishNew\backups\jellyfish-before-f6a8b2c4d507-20260907-115705.sql.gz`，已经过 gzip 完整性检查和一次性临时库恢复验证；备份只是恢复文件，不是第二套在线数据库。此前备份继续保留，除非用户在完整验收后明确同意清理。`backups/` 已加入 Git 忽略，禁止把含业务数据的备份推送到 GitHub。

导入得到的作者视觉提示和项目创作约束以“软参考”进入镜头描述、动作拍点和现有图片/视频 PromptRenderer，不会覆盖结构化剧本事实，也不会把某一供应商的专有参数原样强加给其他模型。已确认的角色、场景、道具和服装会形成镜头级关联，后续参考素材仍遵循“用户显式选择优先、模型不支持则不发送”的规则。

### 6.6 第六步：AI 拆解分镜

在章节中执行分镜提取/拆解：

1. 发起文本处理任务。
2. 在任务中心观察状态。
3. 任务结束后检查镜头序号、标题、剧本摘录和摘要。
4. 必要时手动新建、编辑、排序或删除分镜。

正常情况下，任务中心显示“成功”后，章节分镜数应大于 0，章节准备状态也会离开“待提取分镜”。对于模型明确判定为单镜头但遗漏镜头数组的响应，系统会根据本次任务冻结的章节原文自动补成一个镜头；其他无法安全补全的空响应会显示为失败，不再出现“成功但分镜数为 0”。

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

### 6.10 第十步：配音、音效和字幕

如需使用已有配音或音效，先在“资产管理 → 配音音效”上传素材，再在章节工作台选中镜头，打开“音视频控制”，从素材库加入配乐、配音或音效，并设置开始时间、音量和循环。

如需 AI 配音：

1. 先在模型管理添加阿里百炼“语音生成”模型，并设为默认语音模型。
2. 在分镜编辑页确认对白；无对白的镜头不会自动臆造配音文本。
3. 进入章节生成工作台，选中镜头，在“配音音效”点击“对白转配音”。
4. 音色和表演指令可留空使用模型参数；点击“确认调用并生成”后才会产生供应商请求和可能费用。
5. 任务完成后音频自动进入 RustFS、资产管理和当前镜头音轨；页面以 8 秒间隔查询状态，任务中心保留完整终态。

字幕不要求先生成配音。项目导出默认把已确认的镜头对白按真实镜头时段生成 SRT，并作为可开关软字幕轨写入 MP4；成片工作台可关闭“包含对白字幕”。

音轨是可选后期增强：没有音轨时视频按原流程生成；有音轨时 Worker 在模型视频生成成功后使用 FFmpeg 合成新文件。原始视频不会被删除，合成失败也会回退原视频，不会让已经成功的模型生成任务变成失败。

### 6.11 第十一步：成片导出

完成镜头视频后点击“进入后期剪辑”打开成片工作台。页面按章节和镜头序号展示真实视频片段，不使用 Mock 数据。默认只有全部镜头都有视频时才导出；缺片时必须人工确认是否跳过。导出会统一画幅、H.264/AAC 编码和 25 fps，并给无声片补静音轨，再把 MP4 和可选 SRT 保存到 RustFS。导出只处理本地已有媒体，不调用第三方模型。

### 6.12 第十二步：任务和素材管理

任务中心用于：

- 默认查看“未结束”任务；该范围包含等待中、进行中和取消中。“已结束”包含已完成、失败和已取消，范围筛选与单条任务状态不再混用。
- 查看运行耗时和生成结果。
- 对失败任务点击“失败原因”，按需查看持久化错误详情。
- 取消仍在运行且支持取消的任务。
- 返回对应项目、章节或镜头。

生成结果会进入文件/媒体和镜头关联体系。对于重要结果，应及时下载到独立素材目录，不要只依赖容器数据。

删除演员、角色、场景、道具或服装时，系统会先查询并逐类展示具体关联对象，例如项目、章节、分镜、角色、对白、配音音效及参考文件；关联查询失败时不会允许继续删除。确认后，后端会在同一数据库事务中先解除这些业务关联，再删除资产数据，任一步失败都会整体回滚。底层上传文件仍保留在文件管理中。若只是暂时不让素材参与生成，应关闭“参与推荐”或解除关联，不要删除全局资产。

## 7. 成本控制建议

图片实验室若出现 `image generation snapshot target is unsupported`，原因是旧 Worker 遗漏实验室结果回写，供应商可能已经完成生图并产生用量。2026-09-07 已补齐图片实验室回写；遇到历史失败记录先核查 RustFS 原图与任务时间，避免直接重复生成。恢复工具 `backend/scripts/recover_lab_image.py` 默认只校验，指定精确任务 ID、对象 key 并通过校验后才可用 `--apply` 补回记录。视频实验室的独立发布路径尚待验证，详见二开台账 PL-012。

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

仅在通过 Compose 创建/更新部署时，必须同时加载 `docker-compose.secure-local.yml` 及指定 `.env`，否则可能绕过本地镜像和安全端口配置。日常脚本启动已有容器不加载 Compose 文件或新的 `.env`，沿用容器既有设置。

## 9. GitHub Fork、本地二开与上游更新

本节适用于当前二开仓库。历史迁移基线是作者 `codex/0718`，但下次更新时必须重新检查作者真正的最新活跃分支和精确提交，不能永久假设 `main` 或 `codex/0718` 最新。不要把二开提交直接写入作者跟踪分支，不要用 ZIP 覆盖 `E:\JellyfishNew`，也不要在当前正式目录直接 merge 上游。

```text
作者最新活跃分支 + 精确 SHA
          └── E:\JellyfishCandidate-时间戳（全新候选目录）
                └── integration/upstream-时间戳（逐项智能迁移）
                      └── E:\JellyfishNew / local/stable-*（验证后的唯一正式版本）
```

约定：`upstream` 指向作者仓库；`origin` 指向自己的 Fork。

二开全量主台账为 `docs/Jellyfish-二次开发变更清单.md`，当前能力摘要为 `site/content/docs/architecture/local-customization-inventory.md`。以后每次二开修改都必须同步这两份文档；收到“检查 GitHub 最新代码并同步更新”指令后，必须按 `site/content/docs/guide/upstream-upgrade-sop.md` 执行。

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
git bundle create "$BackupRoot\jellyfish-current.bundle" --all
git bundle verify "$BackupRoot\jellyfish-current.bundle"
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

至少应看到 Git bundle、数据库、RustFS 和两份配置备份。为大文件生成校验和，并把 SQL 恢复到临时数据库做最小还原验证；仅看到文件存在不算可恢复。备份含密码，不要上传 GitHub。

### 9.4 检查作者最新分支并创建全新候选目录

```powershell
git fetch --all --prune --tags
git for-each-ref refs/remotes/upstream --sort=-committerdate --format="%(committerdate:iso8601) %(objectname:short) %(refname:short)"
git log --oneline --decorate --graph --max-count=20 --all
```

结合分支提交时间、共同祖先、发布标签、变更日志和作者 CI 确认最新活跃分支。历史上是 `codex/0718`，但如果作者已合回 `main` 或建立更新分支，应以证据选择新基线。记录 `$UpstreamBranch` 和不可变的 `$UpstreamSha`：

```powershell
$UpstreamBranch = "codex/0718" # 示例，必须替换为本次核对结果
$UpstreamSha = git rev-parse "upstream/$UpstreamBranch"
git rev-list --left-right --count "local/stable-codex-0718...$UpstreamSha"
$Candidate = "E:\JellyfishCandidate-$Stamp"
git clone --origin upstream https://github.com/Forget-C/Jellyfish.git $Candidate
Set-Location $Candidate
git fetch upstream --prune --tags
git switch --detach $UpstreamSha
git switch -c "integration/upstream-$Stamp"
```

`E:\JellyfishNew` 此时继续运行当前稳定版。候选目录必须由作者精确 SHA 全新创建，不能复制旧目录冒充新基线。比较新版 `.env.example` 和 Compose 后只逐项迁移本机配置，不能用旧 `.env` 整文件覆盖新版。

### 9.5 建立台账并逐项智能迁移

先把 `docs/Jellyfish-二次开发变更清单.md` 的全部 `LC-*` 已生效能力和所有未关闭 `PL-*` 阶段计划复制成当次迁移决策台账。每一项必须记录上游证据、本地证据、最终决定、代码/迁移/API、测试和文档，决定分为：采用上游、保留本地、兼容合并、重新实现、淘汰；计划条目还要记录已完成阶段、未完成阶段、阻塞条件，以及升级后继续、合并、重写、暂缓或取消。

候选仓库可以把自己的 Fork 加为 `origin` 并 fetch，用于审计本地稳定分支，但不能直接把全部 commit 合并进去：

```powershell
git remote add origin https://github.com/15802964985/Jellyfish.git
git fetch origin local/stable-codex-0718
git log --reverse --oneline 508f2c7..origin/local/stable-codex-0718
git diff --name-status 508f2c7..origin/local/stable-codex-0718
```

迁移原则：

1. 先比较业务结果、数据契约和测试，再比较文件 diff；不能批量选择本地或作者版本。
2. 作者已完整且更好实现的能力直接采用作者版本，删除本地临时补丁；作者只覆盖一部分时，以其新架构为底座补齐本地缺口。
3. 本地旧实现与新架构冲突时只迁移业务意图和数据，使用新版扩展点重新实现；不能为减少改动恢复作者已废弃接口。
4. `front/openapi.json` 和 `front/src/services/generated/` 不手工拼接；先确定后端接口，再重新生成。
5. 先正确合并依赖声明，再生成锁文件；保留 E 盘和本机监听，同时吸收作者新增参数；`.env` 不参与代码合并。
6. 数据库变更统一使用 Alembic revision；作者和本地 revision 都保留，产生多头时创建 merge revision，不能覆盖已执行迁移。
7. 对安全、密钥、权限、文件删除和付费调用采用双方实现中更严格的边界。

每完成一个独立 LC 领域就补测试、更新台账并提交，避免一次提交混入全部迁移。无法判断时保留正式目录不动，在候选分支撤销该项或重新实现；不要使用 `git reset --hard`。

### 9.6 在候选目录重新生成客户端并隔离测试

先用集成分支构建独立后端测试镜像并运行完整测试：

```powershell
Set-Location $Candidate
docker build -f deploy/docker/backend.local.Dockerfile -t jellyfish-backend-update-test .
docker run --rm jellyfish-backend-update-test uv run --group dev pytest -q
```

如果后端 API、路由或 Schema 有变化，切换前先从刚构建的测试镜像直接导出 OpenAPI，避免误读仍在 8000 端口运行的旧服务：

```powershell
docker run --rm `
  --mount "type=bind,source=$Candidate\front,target=/front" `
  jellyfish-backend-update-test `
  uv run python -c "import json; from pathlib import Path; from app.main import app; Path('/front/openapi.json').write_text(json.dumps(app.openapi(), ensure_ascii=False), encoding='utf-8')"
Set-Location "$Candidate\front"
pnpm install --frozen-lockfile
pnpm run openapi:gen
pnpm run build
```

这样生成的是集成分支的新接口，而不是当前仍在运行的旧容器接口。新后端正式运行到 8000 端口后还必须执行一次 `pnpm run openapi:update`，并用 `git diff --exit-code front/openapi.json front/src/services/generated` 确认服务契约与已生成客户端一致。如果冻结安装失败，先检查 `package.json` 冲突，再运行 `pnpm install` 并核对锁文件；pnpm 要求放行依赖安装脚本时，只批准项目锁定的必要包，不要启用全局无限制脚本。

任何测试或构建失败都不要迁移当前业务数据库。静态测试通过后，把 9.3 的 SQL 备份恢复到临时数据库，并使用独立 Compose project、临时端口和隔离对象存储执行 Alembic、seed、后端/前端/Worker/Beat 健康检查及核心烟测。候选配置不得指向当前业务库和当前 RustFS 写入路径。

若重新生成产生合理修改：

```powershell
git add -A
git status
git commit -m "chore: resolve upstream integration and regenerate clients"
```

没有修改时跳过提交；提交前确认 `.env` 未出现。

### 9.7 隔离验证通过后的正式切换

只有完整自动测试、临时数据库迁移和候选烟测均通过，才安排停机窗口。先确认任务中心没有运行任务，再做最终增量备份；停止应用服务时不得删除卷：

```powershell
Set-Location "E:\JellyfishNew"
docker compose @ComposeFiles stop front backend celery-worker celery-beat
Set-Location "E:\"
$Previous = "E:\JellyfishPrevious-$Stamp"
Move-Item -LiteralPath "E:\JellyfishNew" -Destination $Previous
Move-Item -LiteralPath $Candidate -Destination "E:\JellyfishNew"
```

切换前必须确认 `$Previous`、`$Candidate` 和目标目录都是预期的绝对路径。以下是完整上游升级的示例，不是日常启动或普通配置修改命令：只有已备份、隔离验证并确认需要迁移/seed及相应服务重建时才采用。无数据库变化的应用更新应定向替换应用，不能照抄全栈 up。现有 RustFS 历史标签与业务卷必须先核对，不得因配置差异意外重建数据服务。新目录就位后重新定义 `$ComposeFiles`，按审核后的候选迁移和 seed 方案构建启动：

```powershell
Set-Location "E:\JellyfishNew"
$ComposeFiles = @(
  "--env-file", "E:\JellyfishNew\deploy\compose\.env",
  "-f", "E:\JellyfishNew\deploy\compose\docker-compose.yml",
  "-f", "E:\JellyfishNew\deploy\compose\docker-compose.secure-local.yml"
)
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
4. 剧本上传、本地结构预览、章节勾选和事务提交；确认概述/汇总/音效/备注没有误建成章节。
5. 资产附件上传、停用、排序和解除关联。
6. 配音音效上传、试听及镜头音轨。
7. 图片生成使用或全部取消推荐图。
8. 先用单个低成本镜头验证视频和音轨合成，再批量生成。

不要执行带 `-v` 的 `docker compose down`。

### 9.8 验证通过后固化、更新文档并推送

```powershell
Set-Location "E:\JellyfishNew"
git status --short
$StableBranch = "local/stable-$(Get-Date -Format 'yyyyMMdd')"
git branch -M $StableBranch
git push -u origin $StableBranch
$ReleaseTag = "local-stable-$(Get-Date -Format 'yyyyMMdd-HHmm')"
git tag -a $ReleaseTag -m "Jellyfish 上游更新智能迁移验证版"
git push origin $ReleaseTag
```

推送前必须把当次迁移决定同步到：

1. `docs/Jellyfish-二次开发变更清单.md`：更新基线 SHA、HEAD、统计、提交映射和全部 LC 条目。
2. `site/content/docs/architecture/local-customization-inventory.md`：更新当前真实能力。
3. `site/content/docs/guide/upstream-upgrade-sop.md`：流程有改进时同步修订。
4. 本手册：同步用户可见的功能、配置、部署和验证方法。
5. 所有受影响的 `site/content/docs/plans/`：同步阶段状态，并从仍未完成的 `PL-*` 确定下一步系统优化顺序。

确认 Fork 能看到稳定分支和标签后，升级代码才算完成。

旧代码、候选失败目录和 9.3 备份不会自动删除。先观察新版本并列出拟删除的精确绝对路径；只有用户人工确认后才逐项删除。不得使用模糊通配符，不得删除 Docker 业务卷。清理完成后复核只保留 `E:\JellyfishNew` 这一份正式代码和当前业务数据。若尚未获准清理，应明确记录“升级已完成，清理待人工确认”。

### 9.9 更新失败和回退

尚未切换时直接保留 `E:\JellyfishNew`，在候选目录修复或放弃候选即可。已完成目录切换但尚未迁移正式数据库时，可以停服并把 `$Previous` 恢复为 `E:\JellyfishNew`。已经迁移数据库时，不要自行恢复 SQL、删表或删卷；保留日志和备份，再判断只回退代码还是停服恢复 MySQL、RustFS。恢复数据库会覆盖现有数据，必须再次人工确认。

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
- 时间线已经能按真实镜头导出标准 MP4 和软字幕，但裁剪、转场、波形拖拽、多轨精细校时仍属于后续增强。
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
- [ ] 文本、图片、视频默认模型已按需要设置；需要 AI 配音时已设置默认语音模型。
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


### 提交窗口停在冒号 / 换行符警告

LF will be replaced by CRLF 是换行符提示，本身不是提交失败。旧脚本若停在底部冒号，按英文 Q 退出 Git 分页器；再次出现时再按 Q，随后按确认提示输入 YES。不要同时重复启动提交脚本。2026-09-08 已对脚本内所有 Git 调用加入 --no-pager，后续运行不会自动进入分页器，不改用户全局配置。出现“推送完成”及精确 HEAD 才代表脚本成功；若出现其他错误，应按错误诊断。12 项隔离模拟回归通过，未实际代为推送。


2026-09-08 提交收尾：清理35个文件末尾多余空行以通过 Git 暂存差异检查，业务契约不变；前端类型与相关 Python 语法检查通过。本轮保存累计二开，既有部署/真实验收边界及全部未关闭 PL 不变，无服务重启或数据迁移。提交 SHA 见主台账后续追溯记录。
