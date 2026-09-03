---
title: "提示词模板与生成编排"
description: "说明系统模板、镜头连续性方法和供应商提示词适配如何进入真实生成请求。"
weight: 11
---

> 本文描述当前已经生效的实现，不是提示词示例集合。

## 生效链路

提示词按以下顺序进入业务：

```text
资产/镜头事实
→ 类别默认模板或显式模板
→ 参考素材与文档软上下文
→ 镜头连续性编排
→ 供应商/模型提示词规范
→ 冻结 execution_prompt 与规则快照
→ Worker 调用模型 API
```

系统种子当前覆盖十个确有生产调用链的模板：演员、角色、道具、服装、场景基准、场景补充视角、首帧、关键帧、尾帧和视频。系统模板不可直接编辑；管理员可新建同类别模板并设为默认。系统重新播种只替换 `is_system=1` 的固定系统 ID，不删除用户模板。

`storyboard_prompt`、`frame_head_prompt`、`frame_key_prompt`、`frame_tail_prompt`、`bgm`、`sfx` 和 `combined` 当前仍可用于实验室或作为分类保留，但没有全部接入生产编排，因此系统不为这些类别制造“看似可用”的默认模板。

## 图片模板

资产和场景模板使用自然语言组织主体、用途、环境、构图、光线、风格和避免项。若存在参考图，图片按稳定顺序进入模型请求；素材说明和受支持文档正文作为软上下文追加，不会把“参考”变成强制复刻。

首帧、关键帧和尾帧模板已由 `ShotFramePromptRenderer` 实际消费：

- 首帧：空间建立、动作触发和上一镜头承接；
- 关键帧：动作峰值、因果信息或情绪转折；
- 尾帧：动作结果、情绪余韵和下一镜头入口。

模板渲染后仍会经过原有 guidance 排序与 `图1/图2` 映射，最终预览、提交和任务快照使用同一份结果。

## 视频模板与连续性 Skill

视频模板把镜头标题、剧本摘录、角色、场景、道具、服装、动作节拍、景别、机位、运镜、时长、对白、相邻镜头和负面约束组合成单镜头指令。连续性方法采用以下状态链：

```text
上一镜头结束状态
→ 当前镜头触发
→ 动作过程与峰值
→ 当前镜头结束状态
→ 下一镜头衔接目标
```

该方法借鉴开源短剧工作流的“资产锁定、动作因果、空间/视线连续”思想，但实现为 Jellyfish 自有的确定性服务，不复制第三方完整提示词。方法参考：[ai-shortfilm-prompts methodology](https://github.com/jnMetaCode/ai-shortfilm-prompts/blob/main/methodology.zh.md) 与 [short-drama-agent workflow adapter](https://github.com/MrMO0802/short-drama-agent/blob/main/references/mx-shell-workflow-adapter.md)。

## 供应商适配

生产镜头提交时，门禁根据冻结的供应商和模型修订应用最小适配，并把规则名写入 `prompt_profile_rules`：

- 阿里百炼 Wan 2.7/3.x：追加单镜头声明；参考图片和视频分别编号，严格匹配 Provider 请求中的媒体顺序；首尾帧保持独立语义，不错误计入参考图编号。
- Vidu 命名主体：使用 `@主体名` 写入提示词，媒体仍按主体分组发送。
- 火山引擎、OpenAI、可灵及没有命中明确规则的模型：保持已渲染提示词，不注入其他厂商专有语法。

实验室的自由提示词不会自动扩写。供应商适配只作用于项目中的正式 `shot_video`，以免测试提示词被系统暗改。

## 官方依据

- [阿里百炼 Wan 视频 Prompt 指南](https://help.aliyun.com/zh/model-studio/text-to-video-prompt)
- [阿里百炼 Wan 2.7 图像 API](https://help.aliyun.com/zh/model-studio/wan-image-generation-and-editing-api-reference)
- [火山引擎 Seedream 4.0–5.0 提示词指南](https://www.volcengine.com/docs/82379/1829186)
- [火山引擎 Seedance 1.5 提示词指南](https://www.volcengine.com/docs/82379/2168087)
- [Vidu 文生视频 API](https://platform.vidu.com/docs/text-to-video)

