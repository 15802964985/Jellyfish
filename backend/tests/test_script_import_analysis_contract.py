"""Contract regression tests without remote or billable model calls."""
import json
from types import SimpleNamespace

import pytest

from app.chains.agents.script_import_analysis_agent import ScriptImportAnalysisAgent


class Model:
    """Record the exact messages and number of explicit model invocations."""
    def __init__(self, result):
        self.result = result
        self.calls = []

    def bind(self, **kwargs):
        return self

    def invoke(self, messages):
        self.calls.append(messages)
        return SimpleNamespace(content=json.dumps(self.result, ensure_ascii=False))


def candidate():
    """Minimal valid semantic entity, independent of any screenplay template."""
    return {'candidate_id': 'person-a', 'entity_type': 'character', 'name': '小林',
            'evidence': [{'block_id': 'b1', 'quote': '小林打开门'}]}


def test_schema_and_source_reach_model_in_one_call():
    model = Model({'entities': [candidate()]})
    result = ScriptImportAnalysisAgent(model).analyze(parsed_document_json='{"text":"小林打开门"}')
    assert len(model.calls) == 1
    assert '"entity_type"' in model.calls[0][0].content
    assert '"required"' in model.calls[0][0].content
    assert '小林打开门' in model.calls[0][1].content
    assert result.entities[0].name == '小林'


def test_wrapped_brief_retains_evidence_and_conservative_metadata():
    wrapped = {'value': '第一次出门', 'confidence': .7, 'source_kind': 'inferred',
               'evidence': [{'block_id': 'b1', 'quote': '小林打开门'}], 'warnings': ['片名为建议']}
    model = Model({'project_brief': {'title': wrapped}, 'entities': [candidate()]})
    result = ScriptImportAnalysisAgent(model).analyze(parsed_document_json='{}')
    assert result.project_brief.title == '第一次出门'
    assert result.project_brief.confidence == .7
    assert result.project_brief.evidence[0].block_id == 'b1'
    assert '片名为建议' in result.warnings
    assert wrapped['value'] == '第一次出门'


def test_missing_semantic_identity_fails_without_retry_or_script_leak():
    entity = candidate()
    del entity['entity_type']
    entity['name'] = '不得出现在普通日志的剧本私密文本'
    model = Model({'entities': [entity]})
    with pytest.raises(ValueError) as error:
        ScriptImportAnalysisAgent(model).analyze(parsed_document_json='{}')
    assert 'entities.0.entity_type' in str(error.value)
    assert '私密文本' not in str(error.value)
    assert len(model.calls) == 1


def test_empty_result_is_not_success():
    model = Model({})
    with pytest.raises(ValueError, match='未返回可用'):
        ScriptImportAnalysisAgent(model).analyze(parsed_document_json='{}')
    assert len(model.calls) == 1


def test_unknown_wrapper_data_is_not_silently_discarded():
    model = Model({'project_brief': {'title': {'value': '片名', 'unknown_business_fact': '不能丢弃'}},
                   'entities': [candidate()]})
    with pytest.raises(ValueError, match='结构校验失败'):
        ScriptImportAnalysisAgent(model).analyze(parsed_document_json='{}')


@pytest.mark.parametrize('style', ['json', 'markdown', 'blocks'])
def test_provider_content_variants_share_the_same_business_contract(style):
    """Different transport envelopes must preserve the same semantic candidates."""
    payload = json.dumps({'entities': [candidate()]}, ensure_ascii=False)
    content = payload
    if style == 'markdown':
        content = '```json\n' + payload + '\n```'
    if style == 'blocks':
        content = [{'type': 'text', 'text': payload}]
    model = Model({})
    calls = []
    def invoke(messages):
        calls.append(messages)
        return SimpleNamespace(content=content)
    model.invoke = invoke
    result = ScriptImportAnalysisAgent(model).analyze(parsed_document_json='{}')
    assert result.entities[0].entity_type == 'character'
    assert result.entities[0].evidence[0].quote == '小林打开门'
    assert len(calls) == 1


@pytest.mark.parametrize('metadata,extras,content', [
    ({'finish_reason': 'length'}, {}, '{}'),
    ({'finish_reason': 'content_filter'}, {}, '{}'),
    ({}, {'refusal': 'rejected'}, '{}'),
    ({}, {}, [{'type': 'refusal', 'refusal': 'rejected'}]),
])
def test_incomplete_or_refused_response_never_becomes_candidates(metadata, extras, content):
    """Provider refusal/truncation cannot be repaired into a successful empty analysis."""
    model = Model({})
    model.invoke = lambda messages: SimpleNamespace(content=content, response_metadata=metadata, additional_kwargs=extras)
    with pytest.raises(ValueError):
        ScriptImportAnalysisAgent(model).analyze(parsed_document_json='{}')
