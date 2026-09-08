"""供应商声明、能力解析器与任务执行器的一致性测试。"""

from app.bootstrap import bootstrap_all_registries, validate_provider_execution_matrix
from app.core.tasks.registry import list_registered_task_adapters
from app.models.llm import ModelCategoryKey
from app.services.llm.provider_registry import list_registered_providers


def test_builtin_provider_execution_matrix_is_closed() -> None:
    """所有内置 image/video 声明都必须有相应任务执行器。"""
    bootstrap_all_registries()
    validate_provider_execution_matrix()
    adapters = set(list_registered_task_adapters())
    for spec in list_registered_providers():
        if ModelCategoryKey.image in spec.supported_categories:
            assert ("image_generation", spec.key) in adapters
        if ModelCategoryKey.video in spec.supported_categories:
            if spec.video_operations == ('video_edit',):
                from app.core.integrations.video_edit_registry import VIDEO_EDIT_ADAPTERS
                assert spec.key in VIDEO_EDIT_ADAPTERS
                assert ("video_generation", spec.key) not in adapters
            else:
                assert ("video_generation", spec.key) in adapters
        if ModelCategoryKey.audio in spec.supported_categories:
            assert spec.key in {"aliyun_bailian", "minimax"}
