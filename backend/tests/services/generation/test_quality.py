"""Quality compiler regressions; no external model calls or fixed story-specific heuristics."""
from app.core.contracts.generation_quality import QualityFact
from app.schemas.studio.shots import ShotVideoPromptPackRead, ShotPromptAssetRef
from app.services.generation.quality import build_quality_report, append_quality_instructions, quality_for_video_pack
from app.services.studio.shot_video_prompt_pack import enrich_rendered_video_prompt
from app.services.generation.quality import quality_trace_for_execution
from hashlib import sha256
from types import SimpleNamespace
from unittest.mock import AsyncMock
import pytest


def test_partial_marker_cannot_suppress_other_guidance_and_is_idempotent():
    """Previously one heading discarded every remaining guidance line."""
    pack = ShotVideoPromptPackRead(shot_id='s', script_excerpt='人物打开门', action_beats=['开门'],
        continuity_guidance='保持空间', composition_anchor='门在右侧', next_shot_goal='进入走廊')
    prompt = enrich_rendered_video_prompt(rendered_prompt='动作节拍：开门', pack=pack)
    assert '构图锚点：门在右侧' in prompt
    assert '下一镜头目标：进入走廊' in prompt
    assert enrich_rendered_video_prompt(rendered_prompt=prompt, pack=pack) == prompt


def test_linked_prop_description_reaches_execution_without_invented_size():
    """Names alone lose the proportions and ownership written in asset descriptions."""
    pack = ShotVideoPromptPackRead(shot_id='s', props=[ShotPromptAssetRef(type='prop', name='鞋', description='适合使用者脚部的白色鞋')])
    prompt = enrich_rendered_video_prompt(rendered_prompt='拿起鞋', pack=pack)
    assert '适合使用者脚部的白色鞋' in prompt
    assert '鞋码' not in prompt and '两岁' not in prompt
    assert 'props' in {rule.id for rule in quality_for_video_pack(pack).rules}


def test_fantasy_changes_remain_authoritative():
    """Generic continuity rules must explicitly yield to authored transformations."""
    report = build_quality_report(facts=[QualityFact(source='shot', text='角色变为巨人并换装')], characters=True, costumes=True)
    result = append_quality_instructions('角色变为巨人并换装', report)
    assert result.startswith('角色变为巨人并换装')
    assert '剧情指定的变身' in result and '剧情要求时' in result


def test_no_context_no_fabricated_facts_or_visual_pass():
    """Missing descriptions cannot be reported as a verified scene."""
    report = build_quality_report(facts=[])
    assert report.rules == [] and report.warnings
    assert report.visual_verified is False


def test_frame_and_video_rules_preserve_different_temporal_semantics():
    """An image describes one instant, not an entire animated action."""
    facts = [QualityFact(source='shot', text='物体旋转')]
    frame = build_quality_report(facts=facts, video=False)
    video = build_quality_report(facts=facts, video=True)
    assert 'frame' in {r.id for r in frame.rules}
    assert 'temporal' not in {r.id for r in frame.rules}
    assert 'identity' not in {r.id for r in video.rules}
    assert append_quality_instructions(append_quality_instructions('物体旋转', frame), frame) == append_quality_instructions('物体旋转', frame)


def test_execution_trace_records_only_remaining_exact_rules():
    """A heading or deleted/rewritten rule is not evidence that the rule was sent."""
    report = build_quality_report(facts=[QualityFact(source='shot', text='开门')])
    prompt = append_quality_instructions('开门', report)
    prompt = prompt.replace(report.rules[0].instruction, '用户改写的要求')
    trace = quality_trace_for_execution(prompt)
    assert 'intent' not in {r.id for r in trace.rules}
    assert 'spatial' in {r.id for r in trace.rules}
    assert trace.execution_prompt_sha256 == sha256(prompt.encode('utf-8')).hexdigest()
    assert trace.visual_verified is False
    assert all(r.sources == ['final_execution_prompt'] for r in trace.rules)
    assert quality_trace_for_execution('质量约束（shot-quality-v1/intent）：').rules == []


@pytest.mark.asyncio
async def test_gate_freezes_post_profile_trace_and_payload_roundtrips(monkeypatch):
    """Exercise the real gate and persistence serializer, after provider compilation."""
    from app.core.contracts.generation import (GenerationCommand, GenerationSubmitRequest,
        GenerationTarget, VideoGenerationOperationInput, ResolvedGenerationSnapshot)
    from app.services.generation.gate import GenerationEntityGate
    from app.services.generation.submission.submitter import _task_payload
    import app.services.generation.gate as gate_module
    from unittest.mock import AsyncMock
    monkeypatch.setattr('app.services.studio.creative_direction.direction_for_target', AsyncMock(return_value=None))

    command = GenerationCommand(modality='video', operation='video_generation',
        delivery='async_polling', target=GenerationTarget(kind='shot_video', entity_id='s'),
        request=GenerationSubmitRequest(execution_prompt='开门',
            operation_input=VideoGenerationOperationInput(ratio='16:9')))
    gate = GenerationEntityGate()
    from app.core.contracts.generation_quality import QualitySourceBundle
    monkeypatch.setattr(gate_module, 'collect_quality_sources', AsyncMock(return_value=QualitySourceBundle()))
    monkeypatch.setattr(gate, '_validate_target', AsyncMock())
    monkeypatch.setattr(gate, '_resolve_model', AsyncMock(return_value=(
        SimpleNamespace(id='m'), SimpleNamespace(id='rev', provider_key='volcengine',
            model_name='test', credential_ref='private-ref', category='video', model_id='m', model_params={}, endpoint_config={}))))
    monkeypatch.setattr(gate, '_resolve_asset_references', AsyncMock(return_value=(None, '开门')))
    monkeypatch.setattr(gate, '_validate_media', AsyncMock())
    monkeypatch.setattr(gate, '_target_version', AsyncMock(return_value=1))
    final = append_quality_instructions('开门', build_quality_report(
        facts=[QualityFact(source='shot', text='开门')]))
    monkeypatch.setattr(gate_module, 'apply_generation_prompt_profile',
        lambda **kwargs: SimpleNamespace(prompt=final, applied_rules=['test-profile']))
    snapshot = await gate.validate(None, command)
    payload = _task_payload(command=command, snapshot=snapshot)
    assert 'credential_ref' not in payload['snapshot']
    restored = ResolvedGenerationSnapshot.model_validate(payload['snapshot'])
    assert restored.execution_prompt == final
    assert restored.quality_trace == quality_trace_for_execution(final)
    assert restored.quality_trace.rules
    legacy = dict(payload['snapshot'])
    legacy.pop('quality_trace')
    assert ResolvedGenerationSnapshot.model_validate(legacy).quality_trace is None
