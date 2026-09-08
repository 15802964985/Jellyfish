---
title: "AI 短视频交付主链"
weight: 13
description: "说明从剧本、镜头素材到配音、字幕和最终 MP4 的当前真实链路。"
---

# AI 短视频交付主链

## 当前闭环

当前业务主链是：剧本导入或手工创作 → 章节和镜头确认 → 角色/场景/道具/服装准备 → 关键帧图片 → 镜头视频 → 可选配音/音乐/音效合成 → 项目时间线 → MP4 成片导出。

- “批量关键帧”只创建图片任务，“批量视频”只创建视频任务，不再用图片任务冒充视频生成。
- 视频任务冻结模型 revision 和参考文件 ID；完成后写回镜头视频。镜头已有音轨时，FFmpeg 生成带音频的主结果，同时保留供应商原始视频。
- 成片工作台按 `Chapter.index + Shot.index` 投影真实镜头视频。默认要求全部镜头已有视频；只有用户明确允许时才跳过空缺。
- 导出 Worker 将片段统一为 H.264/AAC、25 fps 和项目画幅，给无声片补静音轨，再按业务顺序拼接并保存到 RustFS。
- 默认根据 `ShotDialogLine` 生成 SRT，并以 `mov_text` 可开关字幕轨写入 MP4；SRT 原文件也作为项目文件保存。

## AI 配音

模型管理新增独立 `audio` 类别和默认语音模型。当前只向阿里百炼声明已打通语音执行：

- Qwen3-TTS 使用 DashScope multimodal-generation 端点。
- Qwen-Audio-TTS/CosyVoice 使用含 WorkspaceId 的 SpeechSynthesizer 端点，必须在模型 `params.audio_endpoint` 写入完整地址。
- 用户在镜头音轨面板明确确认后，`shot_tts` 任务读取已确认对白并冻结模型 revision；任务 payload 不保存 API Key。
- 百炼非流式结果 URL 只有临时有效期，Worker 会立即下载到 RustFS，创建 `FileItem`、`AudioAsset`、`ShotAudioTrack` 和文件使用关系。
- 没有默认语音模型、没有对白、音色或 Workspace 端点缺失时，任务在调用前给出明确错误。

火山引擎语音需要独立产品鉴权和资源配置，当前没有完成其专用协议，因此不会在音频类别中宣称可用。

## 数据和失败边界

任务由 GenerationTask、GenerationTaskLink 和可靠 Outbox 持久化，完成与失败都会留在任务中心。模型版本在提交时冻结，密钥在 Worker 执行时通过 `credential_ref` 读取当前 Provider。AI 配音和媒体生成都是用户主动操作；部署、迁移和自动测试不会调用付费模型。

项目导出只处理已成功归档的本地媒体，不调用第三方模型。导出失败不会删除镜头视频、音轨或先前成片。
