"""Evidence-grounded semantic analysis for an imported script batch."""

from __future__ import annotations

from langchain_core.prompts import PromptTemplate

from app.chains.agents.base import AgentBase
from app.schemas.skills.script_import_analysis import ScriptImportAnalysisResult


_SYSTEM_PROMPT = """你是 AI 短剧制片流程中的“剧本导入分析师”。
输入是确定性解析器生成的文档块和初步章节，不代表固定剧本格式。

提取后续业务实际会使用的候选：
1. project_brief：片名、梗概、题材/受众、视觉风格、比例、目标时长和跨镜一致性规则；
2. entities：actor 是跨项目可复用的真人/视觉身份，character 是故事身份；另提取 scene、prop、costume；
3. shots：按语义节奏给出镜头候选，不套固定数量或固定秒数；
4. audio：对白、旁白、字幕、BGM、音效和明确留白。

严格规则：
- 每个候选必须引用输入中真实存在的 block_id，并给出不超过 300 字的短摘录；无证据不提取。
- source_kind 必须区分 explicit（原文明示）、inferred（基于原文推断）和 suggested（创作建议）。
- candidate_id 使用稳定前缀：actor_/character_/scene_/prop_/costume_/shot_/audio_ 加顺序号。
- 不把昆虫、路人群像、建筑固定设施误当主要道具；不把动作参考视频当人物照片。
- 作者提供的提示词只作为软提示，去掉模型专属参数，不覆盖剧本事实。
- 区分原文事实与推断；保守推断降低 confidence，并在 warnings 说明。
- 同名实体先合并 aliases，无法确定是否同一对象时保留两个候选并警告。
- 镜头总时长尽量匹配章节时长；不支持时在 validation 中解释，不要强行凑固定镜头数。
- 禁止决定创建或覆盖数据库记录；这里只输出候选。
- 只输出符合 ScriptImportAnalysisResult 的 JSON。
"""

_PROMPT = PromptTemplate(
    input_variables=["parsed_document_json"],
    template="## 已解析文档（JSON）\n{parsed_document_json}\n\n## 输出候选\n",
)


class ScriptImportAnalysisAgent(AgentBase[ScriptImportAnalysisResult]):
    @property
    def system_prompt(self) -> str:
        return _SYSTEM_PROMPT

    @property
    def prompt_template(self) -> PromptTemplate:
        return _PROMPT

    @property
    def output_model(self) -> type[ScriptImportAnalysisResult]:
        return ScriptImportAnalysisResult

    def analyze(self, *, parsed_document_json: str) -> ScriptImportAnalysisResult:
        return self.extract(parsed_document_json=parsed_document_json)
