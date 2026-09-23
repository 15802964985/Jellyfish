"""预览与提交共用厂商规则，不进行真实模型请求。"""
import pytest
from app.services.generation.prompts.renderers import compile_video_preview_profile


@pytest.mark.parametrize('mode,images', [('text_only', []), ('first', ['f1']), ('last', ['f2']), ('key', ['f3']), ('first_last', ['f1', 'f2'])])
def test_preview_includes_provider_mapping_once(mode, images):
    """每种帧模式的厂商补充在预览即出现，提交重用不会再次增补改变稿件。"""
    kwargs = dict(provider_key='aliyun_bailian', model_name='wan2.7-r2v', reference_mode=mode, images=images)
    prompt = compile_video_preview_profile('妈妈给孩子穿鞋', **kwargs)
    assert '生成单镜头。' in prompt
    assert ('参考素材编号' in prompt) == bool(images)
    assert compile_video_preview_profile(prompt, **kwargs) == prompt
    if mode == 'first_last':
        assert '首帧=首帧约束、尾帧=尾帧约束' in prompt


def test_other_provider_preserves_prompt():
    """没有登记补充规则的供应商保留原稿，不借预览擅自改写剧情。"""
    assert compile_video_preview_profile('保持剧情', provider_key='volcengine', model_name='seedance', reference_mode='text_only', images=[]) == '保持剧情'
