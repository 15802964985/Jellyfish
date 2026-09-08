"""任务执行器注册表。

职责：
- 通过 task_kind 解析到具体 WorkerTaskExecutor；
- 将任务编排层与 worker 执行层解耦；
- 为后续图片 / 视频 / 文本任务统一执行入口预留注册点。
"""

from __future__ import annotations

from app.services.film.generated_video import run_video_generation_task
from app.services.generation.runtime.text_chat_streaming import run_text_chat_task
from app.services.script_processing_worker import (
    CharacterPortraitTaskExecutor,
    ConsistencyTaskExecutor,
    CostumeInfoTaskExecutor,
    DivideTaskExecutor,
    ExtractTaskExecutor,
    MergeTaskExecutor,
    PropInfoTaskExecutor,
    SceneInfoTaskExecutor,
    ScriptOptimizationTaskExecutor,
    ScriptSimplificationTaskExecutor,
    ScriptImportAnalysisTaskExecutor,
    VariantTaskExecutor,
)
from app.services.studio.image_task_runner import run_image_generation_task
from app.services.studio.project_video_export import run_project_video_export_task
from app.services.studio.shot_tts import run_shot_tts_task
from app.services.worker.task_executor import AbstractAsyncDelegatingExecutor, AbstractWorkerTaskExecutor


class TaskExecutorRegistry:
    def __init__(self) -> None:
        self._executors: dict[str, AbstractWorkerTaskExecutor] = {}

    def register(self, task_kind: str, executor: AbstractWorkerTaskExecutor) -> None:
        self._executors[task_kind] = executor

    def resolve(self, task_kind: str) -> AbstractWorkerTaskExecutor:
        try:
            return self._executors[task_kind]
        except KeyError as exc:  # pragma: no cover - 显式错误路径
            raise RuntimeError(f"Unsupported task_kind: {task_kind}") from exc


task_executor_registry = TaskExecutorRegistry()
from app.services.generation.quality_review import run_quality_review_task
task_executor_registry.register('quality_preflight', AbstractAsyncDelegatingExecutor(
    task_kind='quality_preflight', runner=run_quality_review_task, timeout_seconds=300,
    require_generation_snapshot=True))

# Editing archives a new result and deliberately does not invoke the automatic video publisher.
from app.services.generation.video_edit_runtime import run_video_edit_task
task_executor_registry.register('video_edit', AbstractAsyncDelegatingExecutor(
    task_kind='video_edit', runner=run_video_edit_task, timeout_seconds=3600,
    require_generation_snapshot=True))

task_executor_registry.register("script_divide", DivideTaskExecutor())
task_executor_registry.register("script_extract", ExtractTaskExecutor())
task_executor_registry.register("script_merge", MergeTaskExecutor())
task_executor_registry.register("script_consistency", ConsistencyTaskExecutor())
task_executor_registry.register("script_variant", VariantTaskExecutor())
task_executor_registry.register("script_character_portrait", CharacterPortraitTaskExecutor())
task_executor_registry.register("script_prop_info", PropInfoTaskExecutor())
task_executor_registry.register("script_scene_info", SceneInfoTaskExecutor())
task_executor_registry.register("script_costume_info", CostumeInfoTaskExecutor())
task_executor_registry.register("script_optimize", ScriptOptimizationTaskExecutor())
task_executor_registry.register("script_simplify", ScriptSimplificationTaskExecutor())
task_executor_registry.register("script_import_analyze", ScriptImportAnalysisTaskExecutor())
task_executor_registry.register(
    "text_chat",
    AbstractAsyncDelegatingExecutor(
        task_kind="text_chat",
        runner=run_text_chat_task,
        timeout_seconds=600.0,
        require_generation_snapshot=True,
    ),
)
task_executor_registry.register(
    "video_generation",
    AbstractAsyncDelegatingExecutor(
        task_kind="video_generation",
        runner=run_video_generation_task,
        timeout_seconds=3600.0,
        require_generation_snapshot=True,
    ),
)
task_executor_registry.register(
    "image_generation",
    AbstractAsyncDelegatingExecutor(
        task_kind="image_generation",
        runner=run_image_generation_task,
        timeout_seconds=1800.0,
        require_generation_snapshot=True,
    ),
)
task_executor_registry.register(
    "project_video_export",
    AbstractAsyncDelegatingExecutor(
        task_kind="project_video_export",
        runner=run_project_video_export_task,
        timeout_seconds=7200.0,
    ),
)
task_executor_registry.register(
    "shot_tts",
    AbstractAsyncDelegatingExecutor(
        task_kind="shot_tts",
        runner=run_shot_tts_task,
        timeout_seconds=900.0,
    ),
)
