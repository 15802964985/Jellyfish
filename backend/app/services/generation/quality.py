"""Compile scoped production constraints without calling a model or guessing story facts."""
from app.core.contracts.generation_quality import GenerationQualityReport, QualityFact, QualityRule
from app.core.contracts.generation_quality import ExecutionQualityTrace
from hashlib import sha256


def build_quality_report(*, facts: list[QualityFact], characters: bool = False,
                         props: bool = False, costumes: bool = False,
                         video: bool = True) -> GenerationQualityReport:
    """Activate rules from supplied context; explicit story changes override continuity defaults."""
    evidence = [fact for fact in facts if fact.text.strip()]
    report = GenerationQualityReport(facts=evidence)
    if not evidence:
        report.warnings.append('缺少当前镜头描述，无法建立有依据的质量约束；请补充后再生成。')
        return report
    sources = [fact.source for fact in evidence]
    rules = [
        ('intent', '以当前镜头明确剧情、风格和用户确认的变化为准；连续性约束仅适用于未要求改变的部分，不新增无依据的尺寸、身份或情节。'),
        ('spatial', '保持画面主体的空间关系、接触和遮挡合理；物体比例符合剧情中的使用者和环境，明确设定的夸张或幻想效果除外。'),
    ]
    if characters:
        rules.append(('identity', '依据当前角色设定保持身份、年龄外观、体型和辨识特征；剧情指定的变身或外观变化按其过程表现。'))
    if props:
        rules.append(('props', '依据道具描述保持用途、数量、归属和相对尺寸；拿取、放下或转交应有合理接触与位置变化。'))
    if costumes:
        rules.append(('costumes', '依据当前服装设定保持款式、配色与穿着关系；只在剧情要求时发生换装或损坏。'))
    if video:
        rules.extend([
            ('temporal', '在镜头动作过程中保持未要求变化的物体尺寸、形态和位置连续，按动作顺序完成接触、移动和状态转换。'),
            ('scope', '只表现当前镜头的动作；相邻镜头信息用于衔接，不提前演完后续剧情。镜头运动与主体动作协调。'),
            ('timing', '按给定镜头时长安排动作节奏，优先完成核心动作；不为容纳过多动作擅自跳切、倍速或改变镜头时长，明确剧情要求除外。'),
            ('sound', '区分画面、对白、旁白、字幕和音效的职责：对白按角色归属，旁白不强加口型；除非明确要求画面文字，否则不把字幕或音效说明画进场景。'),
        ])
    else:
        rules.append(('frame', '呈现当前帧职责对应的单一时刻，保持主体结构、道具比例与接触关系，不把连续动作的多个时刻叠在一张图中。'))
        rules.append(('frame_text', '声音、旁白与制作备注只用于理解情境，不作为画面文字或实体物体；明确要求出现的招牌、字幕等文字除外。'))
    report.rules = [QualityRule(id=key, instruction=text, sources=sources) for key, text in rules]
    report.warnings.append('基础规则已编译，未调用 AI 或检查图片像素；不能据此认定参考图无穿帮。')
    return report


def quality_for_video_pack(pack) -> GenerationQualityReport:
    """Preserve exact shot and linked-asset descriptions instead of only their names."""
    facts = [QualityFact(source='shot.script_excerpt', text=pack.script_excerpt)]
    for category in ('characters', 'props', 'costumes'):
        for index, asset in enumerate(getattr(pack, category)):
            facts.append(QualityFact(source=f'linked.{category}[{index}]', text=f'{asset.name}：{asset.description}' if asset.description else asset.name))
    if pack.scene:
        facts.append(QualityFact(source='linked.scene', text=f'{pack.scene.name}：{pack.scene.description}'))
    return build_quality_report(facts=facts, characters=bool(pack.characters), props=bool(pack.props), costumes=bool(pack.costumes))


def quality_for_frame(prompt: str, mappings) -> GenerationQualityReport:
    """Activate frame rules from explicit reference roles without claiming pixel inspection."""
    facts = [QualityFact(source='frame.prompt', text=prompt)]
    kinds = {mapping.type for mapping in mappings}
    for mapping in mappings:
        facts.append(QualityFact(source=f'reference.{mapping.token}', text=f'{mapping.token}：{mapping.name}'))
    return build_quality_report(facts=facts, characters=bool(kinds & {'character', 'actor'}),
        props='prop' in kinds, costumes='costume' in kinds, video=False)


def append_quality_instructions(prompt: str, report: GenerationQualityReport) -> str:
    """Append each exact instruction once; a title/marker alone never suppresses missing rules."""
    text = prompt.strip()
    lines = [f'质量约束（{report.version}/{rule.id}）：{rule.instruction}' for rule in report.rules if rule.instruction not in text]
    return '\n'.join([text, *lines]).strip()


def quality_trace_for_execution(prompt: str | None) -> ExecutionQualityTrace:
    """Freeze exact known instructions surviving user edits and provider compilation.

    Never parse arbitrary model prose as evidence, restore deleted rules, or trust
    a heading alone. The hash binds this trace to the actual immutable prompt.
    Full chapter/asset provenance must be implemented separately.
    """
    text = prompt or ''
    candidates: dict[str, QualityRule] = {}
    for video in (True, False):
        report = build_quality_report(
            facts=[QualityFact(source='final_execution_prompt', text='context')],
            characters=True, props=True, costumes=True, video=video,
        )
        for rule in report.rules:
            if rule.instruction in text:
                candidates[rule.id] = rule
    return ExecutionQualityTrace(
        execution_prompt_sha256=sha256(text.encode('utf-8')).hexdigest(),
        rules=list(candidates.values()),
    )
