---
title: 附件与项目模型身份核对
---

# 附件与项目模型身份核对

核对日期：2026-09-12。依据用户提供的《国产AI图像视频生成_免费额度清单.md》，逐项区分产品入口、开放平台、实际请求型号及本地实现。附件是检查线索，不是配置真值；账户额度登记不是本次核对的替代成果。

范围：动态枚举16个注册供应商，重点核对附件与项目交集中的即梦/火山、阿里、腾讯、可灵、MiniMax、Vidu、智谱。只读确认正式配置7个型号，其中图片/视频为Seedream5.0Lite、Seedance1.5Pro、Wan2.7ImagePro、HappyHorse1.1I2V；其余为文本/语音。本次未调用收费模型，也未修改账户、默认模型或计费端点。未把其余厂商的枚举当成逐字段验收。

## 核对结果

| 附件内容 | 项目当前实现与官方依据 | 结论 |
| --- | --- | --- |
| 即梦、豆包使用Seedream/Seedance | 项目分为Visual即梦与方舟两个适配器。Visual图片3.0按是否参考图发送`jimeng_t2i_v30`/`jimeng_i2i_v30`，提交地址相同；方舟发送其账户渠道的model | 产品名不等于req_key。现有动态分流保留；新增目录说明，避免再把Seedream写进Visual请求 |
| Wan图像2.6、视频2.6/3.0 | 当前官方图像文档明确列出`wan2.7-image-pro`及`wan2.7-image`；HappyHorse另有`happyhorse-1.1-i2v`。阿里Token Plan官方清单也列出现有两项 | 附件未覆盖当前型号，不能据此降级/改名。附件Wan3.0的具体API标识未在本轮采用的官方接口中确认，不写入目录 |
| 腾讯元宝、混元Image3.0 | 项目接TokenHub，API型号为`hy-image-v3`及`hy-video-v1.5`，使用Bearer Key与TokenHub路径，不是元宝网页或另一套腾讯云签名接口 | 属于品牌名与API型号区别，现有名称正确；补齐精确型号来源绑定 |
| MiniMax H3（Hailuo02） | 官方H3使用`MiniMax-H3`和`/v2/video_generation`；Hailuo02使用`MiniMax-Hailuo-02`和`/v1/video_generation` | 附件混淆。项目已经分开，保留并强化目录说明。H3当前仅接编辑入口；普通Hailuo部分官方规格尚未开放，不等于官网不支持 |
| Vidu Q3/S1，最多7张参考图 | Q3各后缀对应不同生成模式，S1是独立实时流式API，项目没有S1任务适配；中国站`api.vidu.cn`和国际站`api.vidu.com`均有官方页面 | 不自动交换域名/账户。修复Q3Pro最短时长和Q3参考图片总量；补入中国站接口来源。S1不作为现有异步生视频型号导入 |
| 智谱CogView/CogVideoX | 官方API枚举为`glm-image`、`cogview-4`、`cogview-4-250304`、`cogview-3-flash`及`cogvideox-3`，与本地目录一致 | API枚举与开源项目/清影产品名不同；补齐精确型号证据，不改请求型号 |
| 可灵Image3.0/Video3.0/Omni | 本地图片`kling-v3`，普通视频`kling-3.0`/Turbo，编辑Omni/O1分别实现。本轮HTTP与浏览器只读取到官方页面标题，未获得参数正文 | 不能据此声称全部一致，也不能直接认定名称错误。现有实现保留，本轮标为待再次核验 |
| PixVerse、百度、硅基流动及其他消费端/聚合产品 | 不在当前注册的对应媒体适配器中；存在网站不等于能以现有协议直接调用 | 不自动新增供应商、不把第三方商品名当作已支持API型号 |

## 对现有配置的直接发现

火山Agent Plan文档当前把`doubao-seedance-1.5-pro`标注为“即将下线”。本轮读取的正文没有给出明确下线日期。该型号当前已配置，目录和场景选型说明增加2026-09-12核对提示，不自动迁移到2.0或标准按量接口。

标准方舟视频示例使用`doubao-seedance-1-5-pro-251215`，套餐文档使用`doubao-seedance-1.5-pro`。这属于渠道命名差异，不能将标准示例直接覆盖现有套餐型号。Seedream5.0Lite也在套餐列表中。官方名称存在不等于当前账户可调用；真实权限、费用与结果仍需单独验收。

## 本次必要修正

- Q3Pro在文生、首帧、首尾帧接口的时长均为1–16秒；本地原先最短3秒，已修正为1秒，并显式列出540p/720p/1080p。
- Q3/Q3Turbo命名主体参考原先仅限制每主体3张，缺少全请求7张的总量限制；已补齐，避免分组后误放行8张及以上。Turbo当前仍采用既有保守3秒下限，不声称开放官网所有模式规格。
- 腾讯、智谱、Hailuo精确API枚举已有可读依据，来源身份改为精确型号绑定；绑定只是文档对应关系，非账户验收。未知型号仍不得继承该身份。
- 即梦与MiniMax目录补充跨产品/版本区别；现有默认模型和用户配置不变。

## 尚未确认的边界

Vidu官方总览/更新页与部分首尾帧接口正文对Q2时长上限存在差异（总览1–10秒、所读首尾帧正文1–8秒），不能以本轮资料宣称所有模式时长一致。可灵动态正文仍不可读。附件有关免费额度、唯一编辑能力、统一24小时有效期等泛化不能作为API契约：例如腾讯Hy图片官方写12小时，Vidu API错峰是折扣而非无限免费。

未新增付费验证或自动迁移。后续缺口归原PL-014/PL-007跟踪，不因此关闭其他计划。

## 官方来源

- 即梦：[文生图3.0](https://docs.volcengine.com/docs/85621/1616429?lang=zh)、[智能参考3.0](https://docs.volcengine.com/docs/85621/1747301?lang=zh)。本轮项目正文解析器读取成功，浏览工具未读到正文。
- 方舟：[视频接口](https://www.volcengine.com/docs/82379/1520757)、[图片接口](https://www.volcengine.com/docs/82379/1541523)、[Agent Plan](https://www.volcengine.com/docs/82379/2516283)。本轮正文解析器读取成功。
- 阿里：[Wan2.7图像API](https://help.aliyun.com/zh/model-studio/wan-image-generation-and-editing-api-reference)、[HappyHorse首帧API](https://help.aliyun.com/zh/model-studio/happyhorse-image-to-video-api-reference)、[Token Plan](https://help.aliyun.com/zh/model-studio/token-plan-personal-overview)。
- 腾讯：[Hy图片](https://cloud.tencent.com/document/product/1823/135745)、[Hy视频](https://cloud.tencent.com/document/product/1823/137202)。
- MiniMax：[H3 V2](https://platform.minimax.cn/docs/api-reference/video-generation-v2-create)、[Hailuo V1](https://platform.minimax.cn/docs/api-reference/video-generation-i2v)。
- Vidu：[中国站文生视频](https://platform.vidu.cn/docs/text-to-video)、[中国站参考生视频](https://platform.vidu.cn/docs/reference-to-video)、[模式总览](https://platform.vidu.com/docs/model-map)、[首尾帧](https://platform.vidu.com/docs/start-end-to-video)。
- 智谱：[图片枚举](https://docs.bigmodel.cn/api-reference/模型-api/图像生成)、[CogVideoX3](https://docs.bigmodel.cn/cn/guide/models/video-generation/cogvideox-3)。
- 可灵：[官方入口](https://kling.ai/document-api/quickStart/productIntroduction/overview)、[Omni接口入口](https://kling.ai/document-api/api/video/3-0-omni/video-omni)，本轮只能读取标题，未冒称正文核验通过。


部署验证：2026-09-12 15:57已部署，707项后端全量与正式只读页面通过。默认配置未变，无真实付费调用。
