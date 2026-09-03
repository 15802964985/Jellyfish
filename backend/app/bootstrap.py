"""应用级注册入口：统一初始化供应商能力与任务执行器（均幂等）。"""

from __future__ import annotations


def bootstrap_all_registries() -> None:
    """启动时或惰性路径中调用一次即可；顺序固定为 provider 先于 task adapter。"""
    from app.core.tasks.bootstrap import bootstrap_task_adapters
    from app.services.llm.provider_bootstrap import bootstrap_builtin_providers

    bootstrap_builtin_providers()
    bootstrap_task_adapters()
    validate_provider_execution_matrix()


def validate_provider_execution_matrix() -> None:
    """阻止供应商声明超前于执行器与能力解析器，启动时尽早暴露接入缺口。"""
    from app.core.integrations.image_capabilities import resolve_image_capability
    from app.core.integrations.video_capabilities import resolve_video_capability
    from app.core.tasks.registry import list_registered_task_adapters
    from app.models.llm import ModelCategoryKey
    from app.services.llm.provider_registry import list_registered_providers

    task_adapters = set(list_registered_task_adapters())
    text_compatible = {"openai", "volcengine", "aliyun_bailian"}
    for spec in list_registered_providers():
        declared = set(spec.supported_categories)
        if ModelCategoryKey.text in declared:
            if spec.key not in text_compatible or not spec.default_base_url:
                raise RuntimeError(f"provider {spec.key!r} declares text without compatible runtime")
        for category, task_kind in (
            (ModelCategoryKey.image, "image_generation"),
            (ModelCategoryKey.video, "video_generation"),
        ):
            adapter_key = (task_kind, spec.key)
            if category in declared and adapter_key not in task_adapters:
                raise RuntimeError(f"provider {spec.key!r} declares {category.value} without task adapter")
            if category not in declared and adapter_key in task_adapters:
                raise RuntimeError(f"provider {spec.key!r} registers undeclared {category.value} adapter")
        if ModelCategoryKey.image in declared:
            resolve_image_capability(provider=spec.key, model=None)  # type: ignore[arg-type]
        if ModelCategoryKey.video in declared:
            resolve_video_capability(provider=spec.key, model=None)  # type: ignore[arg-type]
