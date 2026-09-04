---
title: "任务计划"
weight: 4
description: "记录当前正在推进的开发计划、改造方案与阶段性执行清单。"
---

这里记录 Jellyfish 当前仍在推进中的任务计划与重构方案。

- 放这里的内容允许持续更新，因为它描述的是**接下来做什么**。
- 当某项计划已经稳定落地后，应优先沉淀到 [当前架构](/docs/architecture/) 或发布到 `blog` 中。

当前未关闭计划入口：

- [开发规划](/docs/plans/development-plan/)
- [任务异步化与取消方案](/docs/plans/task-async-cancellation-plan/)
- [Alembic 统一数据库迁移方案](/docs/plans/alembic-unified-migration-plan/)
- [实验室历史输入回填与重试方案](/docs/plans/experiment-history-retry/)
- [实验室会话持久化交付计划](/docs/plans/experiment-session-persistence-plan/)
- [生成准备架构重构计划](/docs/plans/generation-workspace-refactor/)
- [富媒体资产后续计划](/docs/plans/media-assets/)
- [提示词与 Agent 后续编排计划](/docs/plans/prompt-orchestration-roadmap/)
- [智能剧本导入与生产要素编排计划](/docs/plans/intelligent-script-import-plan/)
- [供应商生成链路补全计划](/docs/plans/provider-generation-integration-plan/)

计划的跨版本续做状态统一登记在仓库根目录 `docs/Jellyfish-二次开发变更清单.md` 的 `PL-*` 台账中。阶段只完成一部分时，必须同时更新来源计划和对应 `PL-*`；上游升级后先复核未关闭计划，再安排下一步系统优化。

已完成、仅保留历史决策的计划：

- [本地二开迁移至 codex/0718](/docs/plans/local-customization-port-to-codex-0718/)
- [统一资产图提示词模板实施计划](/docs/plans/unified-asset-image-template-plan/)
- [统一生成编排与独立提示词渲染实施计划](/docs/plans/unified-generation-orchestration-plan/)
