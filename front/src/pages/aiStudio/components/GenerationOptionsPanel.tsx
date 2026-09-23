import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Checkbox, Select, Space, Spin, Typography } from 'antd'
import { LlmService } from '../../../services/generated'
import { rateFor, type GenerationChoice } from './GenerationParameterDialog'

/** Show executable options before Generate; scope each choice to the inspected immutable model revision. */
export function GenerationOptionsPanel({ category, modelId, ratio, references = 0, quantity = 1, onChange }: {
  category: 'image' | 'video'; modelId?: string | null; ratio?: string | null; references?: number
  quantity?: number | null; onChange: (choice: GenerationChoice | null) => void
}) {
  const [spec, setSpec] = useState<Record<string, any> | null>(null)
  const [choice, setChoice] = useState<GenerationChoice | null>(null)
  const previousChoice = useRef<GenerationChoice | null>(null)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    let active = true
    setSpec(null); setError(''); setChoice(null); onChange(null)
    const request = LlmService.getGenerationSpecificationApiV1LlmGenerationSpecificationGet({
      modelId, category, ratio: ratio || undefined, references,
    })
    request.then(response => {
      if (!active) return
      const next = response.data
      if (!next) throw new Error('empty specification')
      setSpec(next)
      const previous = previousChoice.current
      const keep = previous?.revision === String(next.revision_id) && (!next.options?.length || next.options.some((item: { value: string }) => item.value === previous.value))
      const initial = { spec: next, revision: String(next.revision_id), value: keep ? previous!.value : next.default ?? null, audio: keep && next.generate_audio ? previous!.audio : next.generate_audio?.default ?? null }
      previousChoice.current = initial
      setChoice(initial); onChange(initial)
    }).catch(() => { if (active) setError('参数与费用读取失败，请检查模型配置后刷新') })
    return () => { active = false; request.cancel() }
  }, [category, modelId, ratio, references, refresh, onChange])
  /** Re-read the current default when returning from model settings, without overwriting an active choice on every render. */
  useEffect(() => {
    const reload = () => setRefresh(value => value + 1)
    window.addEventListener('focus', reload)
    return () => window.removeEventListener('focus', reload)
  }, [])
  /** Keep UI changes and the final submission choice in sync. */
  const change = (values: Partial<GenerationChoice>) => {
    if (!choice) return
    const next = { ...choice, ...values }
    previousChoice.current = next
    setChoice(next); onChange(next)
  }
  return <section className="my-3 w-full rounded-lg border border-slate-200 bg-slate-50 p-3" aria-label={category === 'image' ? '图片参数与费用' : '视频参数与费用'}>
    <div className="mb-2 flex items-center justify-between"><strong>{category === 'image' ? '图片参数与费用' : '视频参数与费用'}</strong>
      <Button size="small" type="link" onClick={() => setRefresh(value => value + 1)}>刷新模型参数</Button></div>
    {error ? <Alert type="warning" message={error} /> : !spec || !choice ? <Spin size="small" /> : <Space direction="vertical" className="w-full" size={6}>
      <Typography.Text>{spec.provider} · {spec.model_name}</Typography.Text>
      {spec.options?.length ? <Select aria-label={category === 'image' ? '图片分辨率' : '视频分辨率'} className="w-full"
        value={choice.value} options={spec.options.map((item: any) => ({value:item.value,label:item.label + (item.value === spec.default ? ' · 默认' : '')}))}
        onChange={value => change({value})} /> : <Typography.Text type="secondary">此模型暂无已核验的可选分辨率。</Typography.Text>}
      {spec.provider === 'jimeng' && <Typography.Text type="secondary">{spec.notice}</Typography.Text>}
      {spec.generate_audio && <Checkbox checked={choice.audio ?? false} onChange={event => change({audio:event.target.checked})}>生成原生音频</Checkbox>}
      {[['price','预计费用'],['reference_price','按量原价参考'],['package_reference','套餐参考']].map(([field,label]) => {
        const price = spec[field]
        const rate = rateFor(price, choice.value, choice.audio)
        if (!price && field !== 'price') return null
        return <Typography.Text key={field} strong={field === 'price'}>{label}：{rate != null && quantity
          ? (price.currency === 'CNY' ? '¥' : '') + (rate * quantity).toFixed(4) + (price.currency === 'AFP' ? ' AFP' : '')
          : '暂无法准确估算'} {price?.source && <a href={price.source} target="_blank" rel="noreferrer">依据</a>}</Typography.Text>
      })}
      <Typography.Text type="secondary" className="text-xs">按当前数量／时长估算。按量原价和套餐参考分开计算，实际扣费以账户账单为准。</Typography.Text>
    </Space>}
  </section>
}
