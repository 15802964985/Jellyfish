---
title: 文字编辑视频官方 API 核对与补齐计划
description: 2026-09-09 对注册视频供应商、实际配置、编辑协议及交互缺口的核查
---

# 文字编辑视频官方 API 核对与补齐计划

核查日期：2026-09-09。关联 PL-013、PL-015；工作树待提交批次。本文是文档核查与代码审查结果，不代表新增适配器已经实现或通过真实调用。本轮未发起付费生成，未变更账号、默认模型或套餐端点。

## 已核实的项目现状

生产只读查询：视频配置只有火山引擎 doubao-seedance-1.5-pro、阿里百炼 happyhorse-1.1-i2v，供应商均 active。

VideoEditPanel.tsx 仅允许 fal 的 fal-ai/kling-video/o3/pro/video-to-video/edit 和 Runway 的 aleph2。后端 video_edit_registry、提交门禁和预检查也仅实现这两个协议。因此列表为空是“当前没有配置已接通的编辑型号”，不是刷新缓存，也不能仅通过放宽前端过滤解决。其他供应商支持普通视频生成，不等于其编辑接口已经接通。

注册 video 类别的供应商共 11 个：aliyun_bailian、fal、hunyuan、jimeng、kling、minimax、openai、runway、vidu、volcengine、zhipu。Google 当前仅注册文本类别，Luma 未注册，不列为现有视频供应商。聚合商新增全部市场型号不等于项目已支持型号；下表另外标注注册供应商官方新增候选。

## 官方核查结果

| 供应商 / 型号 | 官方证据与能力 | 项目状态 / 补齐边界 |
| --- | --- | --- |
| 百炼 wan2.7-videoedit | [编辑 API](https://help.aliyun.com/zh/model-studio/wan-video-editing-api-reference)：自然语言编辑，源视频加最多 4 张参考图；720P/1080P；原视频 2–10 秒；input.media 的 video/reference_image。 | 当前目录及编辑执行未接通；不能借用 HappyHorse I2V 型号或默认切换 Token Plan 至按量端点。 |
| 可灵 Kling 3.0 Omni / O1 | [3.0 Omni](https://kling.ai/document-api/api/video/3-0-omni/video-omni)、[O1](https://kling.ai/document-api/api/video/o1/video-omni) 有视频编辑示例。当前新版分别 POST /omni-video/kling-3.0-omni 与 /omni-video/kling-o1，contents 使用 prompt/base_video/refer_image，settings 包含规格和音频。 | 当前原生适配与目录不等于新版 Omni 编辑适配。官网新旧版本并存，不能套用第三方 legacy video_list 示例或 fal 凭据。完整参数限制、查询协议、鉴权及计费仍需完成适配前契约测试。 |
| Vidu viduq2-pro | [中国站参考生视频](https://platform.vidu.cn/docs/reference-to-video)：明确支持视频编辑/替换，subjects 中 videos 可传视频，prompt 按主体名称引用。 | 目录已有型号描述，但视频主体编辑链未接通。英文站枚举与中国站不同；必须固定地域证据。中国站临时视频主体示例要求 5 秒视频，不能擅自截断用户输入。 |
| 火山 Seedance 2.5（新增候选） | [创建视频任务 API](https://www.volcengine.com/docs/82379/1520757)：omni_reference_task_type=edit，至少一段 reference_video、4–30 秒，ratio=adaptive、duration=-1。 | 当前配置和适配为 1.5 Pro，不能用 1.5 名称调用新版字段。需新增精确型号与对应端点权限验证；模型仍可能因提示词意图不符返回 TaskTypeMismatch。 |
| 火山 Seedance 2.0 系列（新增候选） | 同上 API 接受 reference_video；参考生视频与 2.5 显式 edit 模式需要分别呈现。 | 不能把参考生成能力直接标成已实现原视频编辑；具体系列、分辨率与参考限制逐型号核查。 |
| MiniMax H3（新增候选） | [视频生成指南](https://platform.minimaxi.com/docs/guides/video-generation)明确包含视频编辑；[V2 API](https://platform.minimaxi.com/docs/api-reference/video-generation-v2-create)使用多模态 content/reference_video，768P/2K、4–15 秒。 | 现有 Hailuo 2.3/02 的 V1 适配不支持此协议，需新增 V2。H3-Max 当前不支持多模态参考，不能一起放行。 |
| fal Kling O3 Pro edit | [fal API](https://fal.ai/models/fal-ai/kling-video/o3/pro/video-to-video/edit/api)：编辑源视频、图片参考。 | 已有独立适配器，但当前没有配置；不能与可灵原生账户混用。现有仅该精确型号，不代表 fal 全市场都已接通。 |
| Runway aleph2 | [模型目录](https://docs.dev.runwayml.com/guides/models/)：视频 + 文字/图片生成编辑结果。 | 已有独立适配器，当前没有配置。新目录其他聚合型号不自动放行。 |
| OpenAI Sora | [edit API](https://developers.openai.com/api/reference/python/resources/videos/methods/edit)：POST /videos/edits 接收源视频与 prompt；另有已生成视频 remix。 | 项目未实现编辑接口。官方页面明确标记 Sora API 将于 2026-09-24 关闭，本次不推荐作为新增长期依赖。 |
| 智谱 cogvideox-3 | [官方指南](https://docs.bigmodel.cn/cn/guide/models/video-generation/cogvideox-3)：文本/图像生成视频。 | 本次未找到该精确型号接收原视频指令编辑的协议；不可放行。 |
| 混元 hy-video-v1.5 | [TokenHub Hy 调用指南](https://cloud.tencent.com/document/product/1823/137202)：文生/图生，image/image_url。 | 未提供原视频编辑字段；TokenHub 代理的其他厂商型号不等于当前混元适配已支持。 |
| 即梦当前视觉 API | [已接入接口文档](https://www.volcengine.com/docs/85621/1863351)：现有首尾帧图生视频链。 | 未确认当前 req_key 有原视频编辑协议；即梦网页编辑能力不能直接套用视觉 API。 |

补充：[HappyHorse 参考生视频](https://help.aliyun.com/zh/model-studio/happyhorse-reference-to-video-api-reference)当前文档要求参考图片，不能因名称 r2v 误判接收原视频。本轮发现此文档与旧目录摘要的素材/时长说明也需在后续适配批次复核。

动态文档读取方式：火山通过官网公开 getDocDetail 返回的指定 LibraryID/DocumentID 正文核对；Vidu 读取中国站 HTML 正文；可灵通过官网页面实际引用的公开静态资源读取中文示例，未执行脚本、登录或使用第三方接口文档。

## 费用核查与界面要求

“携带原视频/参考图更便宜”不是通用规则。[Wan 2.7 编辑计价](https://help.aliyun.com/zh/model-studio/wan2-7-videoedit)北京按量原价：720P 每秒 0.6 元、1080P 每秒 1 元；编辑 API 的 usage.duration 为输入视频加输出视频时长。例如输入 5 秒、输出 5 秒，约 6 元或 10 元，不含账户优惠。套餐实际扣减、地域、活动价必须另行核实。

费用展示必须绑定型号、地域/端点、编辑模式、输入时长、输出时长、分辨率、音频及计价单位。公开按量参考价与账户预计实付分开展示；未知不显示 0 元。不能将普通生成价格表直接套在编辑接口上。

## 代码审查发现与后续实施顺序

1. 后端统一编辑能力目录，返回已接通型号、已配置但不可用原因及官网候选；前端取消独立硬编码型号表。区分加载失败、加载中、未配置和协议未接通，支持刷新及跳转配置。
2. 先接通有明确契约的原生编辑：Wan2.7、可灵 Omni、Vidu Q2-Pro；新增 Seedance2.5、MiniMax H3 按独立协议推进。不能只有前端选项而没有服务端提交、轮询、下载、错误和幂等保护。
3. 编辑专属动态参数：切换型号重新验证源片/参考图/默认值；显示分辨率、时长规则、音频保留方式。固定原片比例/时长的接口解释锁定原因。当前 VideoEditOperationInput 无分辨率字段，specifications 的 editing 分支无选项，尚未完成此项。
4. 免费本地探测时长后展示预计费用，确认框与提交冻结同一规格/计价快照。当前编辑 quantity 为未知，不能称费用估算已经覆盖。
5. 参考图排序、可见标记和一键插入提示词；标记按供应商转换。切换型号不静默删除超限素材。当前仅追加/移除，没有排序。
6. 大文件上传、可访问 URL/供应商临时上传须符合官方协议。不能继续对所有模型统一 Base64，亦不能自动公开本地素材。
7. 保留原视频、结果比较、明确采用、取消不保证退款、未知提交结果不重复付费等已有保护。核查已有历史任务状态不能影响新编辑，切换镜头避免沿用旧源视频。
8. 将上述官方来源与精确型号加入 PL-015 定时证据监测；API 结构变化只生成待验证适配任务，不能凭文档文本直接激活未测试协议。

完成标准：适配与状态机离线测试、OpenAPI 生成、前端类型/浏览器验证、文档同步及部署分别记录；真实付费编辑须独立验收。此次完成的是官方核查与缺口清单，上述新增接口和交互补齐尚未实施。

## 2026-09-09 实施续记（覆盖上文“尚未实施”的当时状态）

本阶段已落地原生Wan2.7-videoedit、Kling Omni3.0/O1、ViduQ2Pro、Seedance2.5（doubao-seedance-2-5-260628）、MiniMaxH3 V2；旧fal/Runway保留。统一编辑目录、排除原因、模型动态参数、实际源片预检、自动费用预览/最终复核、参考图排序、提示词标记与版本冻结。与准备页卡片/图片/新建关联和nginx深链接修复联合验证部署，具体运行快照见PROJECT_MEMORY。

本批只有官方文档核验、Mock协议/状态解析及本地交互证据，未收费调用。接入子集严格限制源片规格，不自动截断；公网URL输入需用户对象存储配置，不能公开本地素材。原生可灵当前最多4张参考；O1当前3–10秒；Wan保持原片时长；H3/CN V2、Vidu中国站，不能跨地域/套餐迁移。价格只对Wan北京与Runway有据估算，其他未知；不保证编辑比重生成便宜。

PL-013/015继续：实际账户权限与收费产物、完整时长/分辨率与区域价矩阵、私有媒体公网交付配置、任意新鉴权/路径/响应结构适配及长期监测。现有只配置普通生成模型不会自动获得编辑型号；不修改账号、默认模型或套餐端点。

部署续记：2026-09-09 19:14已联合部署四应用服务；630项后端全量、最终3项定向、类型/镜像构建及隔离浏览器通过。正式新建深链接、截图妈妈/场景图片、本页新建入口通过只读浏览器验证。数据库不变、无付费；精确镜像/回滚和未验收边界见PROJECT_MEMORY同时间快照。
