/** Show evidence and instructions without presenting deterministic rules as visual verification. */
export function GenerationQualityPanel({ report }: { report: unknown }) {
  if (!report || typeof report !== 'object') return null
  const data = report as Record<string, unknown>
  const entries = (value: unknown) => Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object') : []
  const facts = entries(data.facts)
  const rules = entries(data.rules)
  const sources = entries(data.sources)
  const warnings = Array.isArray(data.warnings) ? data.warnings.filter((item): item is string => typeof item === 'string') : []
  return (
    <details className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
      <summary className="cursor-pointer font-medium focus-visible:outline focus-visible:outline-2">
        生成依据与质量规则 · {facts.length} 条依据 · {rules.length} 条约束
      </summary>
      <p className="mt-2 text-amber-700">基础编译不收费；尚未做 AI 或图像检查。修改内容后请重新渲染，以下报告对应上次渲染版本。</p>
      <div className="max-h-60 overflow-auto space-y-2 mt-2">
        {warnings.map((item, index) => <p key={index}>{item}</p>)}
        {facts.map((item, index) => <div key={`fact-${index}`}><span className="font-medium">依据 {String(item.source ?? '')}：</span>{String(item.text ?? '')}</div>)}
        {rules.map((item, index) => <div key={`rule-${index}`}><span className="font-medium">约束：</span>{String(item.instruction ?? '')}</div>)}
        {sources.length > 0 && <details><summary>本地来源追溯（{sources.length}）</summary>{sources.map((item, i) => <div key={i} className="mt-2 break-words">
          {String(item.kind)} / {String(item.entity_id)} / {String(item.field)}：{typeof item.text === 'string' ? item.text : '仅记录文件/章节哈希，不外发全文'}
          {item.literal_in_prompt === false && <span className="text-amber-700"> · 未逐字出现在最终提示词中，请核对是否需要补充（不等同于语义遗漏）</span>}
        </div>)}</details>}
      </div>
    </details>
  )
}
