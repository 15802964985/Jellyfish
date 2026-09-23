import { useState } from 'react'
import { Alert, Checkbox, Descriptions, Modal, Select, Space, Typography } from 'antd'
import { LlmService } from '../../../services/generated'
import type { GenerationSubmitRequest, ImageGenerationOperationInput, VideoGenerationOperationInput } from '../../../services/generated'

/** Generated OpenAPI const fields are strings; validate discriminators before narrowing the union. */
function isImageOperation(value: GenerationSubmitRequest['operation_input']): value is ImageGenerationOperationInput {
  return value.kind === 'image_generation'
}
/** Narrow only a confirmed video operation, keeping text and editing inputs out of generic parameter mappings. */
function isVideoOperation(value: GenerationSubmitRequest['operation_input']): value is VideoGenerationOperationInput {
  return value.kind === 'video_generation'
}
type Spec = Record<string, any>

/** Select the official audio-dependent rate without mixing account currency and package credits. */
export function rateFor(price: Spec | null | undefined, value: string | null | undefined, audio?: boolean | null): number | null {
  const rate = value ? (audio && price?.audio_rates ? price.audio_rates[value] : price?.rates?.[value]) : null
  return rate == null ? null : Number(rate)
}

/** Aggregate known amounts separately from unavailable quotes; never treat unknown prices as zero. */
export async function reviewGenerationBatch(requests: GenerationSubmitRequest[]): Promise<GenerationSubmitRequest[]> {
  if (!requests.length) return []
  const cache: GenerationReviewCache = new Map()
  const reviewed: GenerationSubmitRequest[] = []
  for (const request of requests) reviewed.push(await reviewGenerationRequest(request, cache))
  let known = 0, reference = 0, unknown = 0, referenceCount = 0, afp = 0, afpCount = 0
  for (const request of reviewed) {
    const operation = request.operation_input
    const spec = (await LlmService.getGenerationSpecificationApiV1LlmGenerationSpecificationGet({
      modelId: request.model_id, category: isImageOperation(operation) ? 'image' : 'video',
      ratio: isImageOperation(operation) ? operation.target_ratio : isVideoOperation(operation) ? operation.ratio : undefined,
      references: request.media && 'references' in request.media ? request.media.references?.length ?? 0 : 0,
    })).data as Spec
    if (!spec || spec.revision_id !== request.expected_model_revision_id) throw new Error('批量配置已变化，请重新确认，尚未提交生成任务')
    const value = isImageOperation(operation) ? operation.resolution_profile : isVideoOperation(operation) ? operation.resolution : null
    const quantity = isImageOperation(operation) ? operation.count ?? 1 : isVideoOperation(operation) ? operation.seconds : null
    const audio = isVideoOperation(operation) ? operation.generate_audio : false
    const rate = rateFor(spec.price, value, audio)
    const referenceRate = rateFor(spec.reference_price, value, audio)
    const packageRate = rateFor(spec.package_reference, value, audio)
    if (packageRate != null && quantity) { afp += packageRate * quantity; afpCount += 1 }
    if (rate != null && quantity && spec.price.currency === 'CNY') known += Number(rate) * quantity
    else unknown += 1
    if (referenceRate != null && quantity && spec.reference_price.currency === 'CNY') {
      reference += Number(referenceRate) * quantity
      referenceCount += 1
    }
  }
  await new Promise<void>((resolve, reject) => Modal.confirm({
    title: '确认整批生成', icon: null, okText: '提交整批任务', cancelText: '取消整批',
    content: <Space direction="vertical">
      <Typography.Text>共 {reviewed.length} 个任务。确认后才开始提交。</Typography.Text>
      <Typography.Text strong>{unknown ? '整批费用未知；可估算部分 ¥' + known.toFixed(4) + '，另有 ' + unknown + ' 项无法估算。' : '整批预计 ¥' + known.toFixed(4)}</Typography.Text>
      {referenceCount > 0 && <Typography.Text>其中 {referenceCount} 项的官方按量原价参考合计 ¥{reference.toFixed(4)}，不代表套餐扣费，也不计入上述预计金额。</Typography.Text>}
      {afpCount > 0 && <Typography.Text>Agent Plan 套餐参考：{afpCount} 项合计 {afp.toFixed(4)} AFP。须与账户套餐匹配，不与人民币金额相加。</Typography.Text>}
      <Typography.Text type="secondary">金额以实际账单为准；取消不会创建生成任务，已主动保存的模型默认值仍保留。</Typography.Text>
    </Space>,
    onOk: () => { resolve() }, onCancel: () => { reject(new Error('已取消整批，未提交生成任务')) },
  }))
  return reviewed
}
export type GenerationChoice = { revision: string; value: string | null; audio: boolean | null; spec?: Spec }
export type GenerationReviewCache = Map<string, string | null>

/** Display the final tier and cost basis at every paid image/video submission entry. */
function ParameterForm({ spec, initial, request, onChange, onDefaultChange, audio, onAudioChange, locked = false }: {
  locked?: boolean
  audio: boolean | null; onAudioChange: (value: boolean) => void
  spec: Spec; initial: string | null; request: GenerationSubmitRequest; onChange: (value: string | null) => void; onDefaultChange: (value: boolean) => void
}) {
  const [value, setValue] = useState(initial)
  const [audioValue, setAudioValue] = useState(audio)
  const operation = request.operation_input
  const quantity = isImageOperation(operation) ? operation.count ?? 1 : isVideoOperation(operation) ? operation.seconds : null
  const rate = rateFor(spec.price, value, audioValue)
  const referenceRate = rateFor(spec.reference_price, value, audioValue)
  const packageRate = rateFor(spec.package_reference, value, audioValue)
  const amount = rate != null && quantity ? (Number(rate) * quantity).toFixed(4) : null
  return <Space direction="vertical" className="w-full">
    <Descriptions column={1} size="small" items={[
      { key: 'provider', label: '厂商', children: spec.provider },
      { key: 'model', label: '型号', children: spec.model_name },
      { key: 'quantity', label: '生成数量／时长', children: isImageOperation(operation) ? (quantity + ' 张') : quantity ? (quantity + ' 秒') : '按当前编辑输入规格' },
    ]} />
    {spec.options?.length > 0 && <Select className="w-full" aria-label="生成规格" disabled={locked} value={value}
      options={spec.options.map((option: any) => ({ value: option.value, label: option.label + (option.value === spec.default ? ' · 默认' : '') }))}
      onChange={next => { setValue(next); onChange(next) }} />}
    {spec.generate_audio && <Checkbox disabled={locked} defaultChecked={audio ?? false} onChange={event => { setAudioValue(event.target.checked); onAudioChange(event.target.checked) }}>生成原生音频（可能影响费用）</Checkbox>}
    {!locked && spec.options?.length > 0 && <Checkbox onChange={event => onDefaultChange(event.target.checked)}>{spec.generate_audio ? '将此规格及音频设置设为该模型默认' : '将此规格设为该模型默认'}</Checkbox>}
    <Alert type="info" message={spec.notice} />
    {spec.billing_evidence && <Typography.Text type="secondary">{spec.billing_evidence.reason} <a href={spec.billing_evidence.source} target="_blank" rel="noreferrer">套餐计费依据</a></Typography.Text>}
    <Typography.Text strong>{amount ? '预计 ¥' + amount : '预计费用：暂无法准确估算'}</Typography.Text>
    {packageRate != null && quantity && <Typography.Text>Agent Plan 套餐参考：{(packageRate * quantity).toFixed(4)} AFP；需核对账户套餐，以实际 usage 及账单为准。</Typography.Text>}
    {spec.reference_price && <Typography.Text type="secondary">
      按量原价参考：{referenceRate != null && quantity
        ? '¥' + (referenceRate * quantity).toFixed(4) : '待选择规格'}。
      {spec.reference_price.note}
      <a href={spec.reference_price.source} target="_blank" rel="noreferrer">官方依据</a>
    </Typography.Text>}
    {spec.price ? <Typography.Text type="secondary">
      {spec.price.note} 价格核对：{spec.price.checked_at}。
      <a href={spec.price.source} target="_blank" rel="noreferrer">官方计费依据</a>
    </Typography.Text> : <Typography.Text type="secondary">当前型号／端点缺少已核实价格依据，不代表免费。</Typography.Text>}
  </Space>
}

/** Freeze the inspected model revision and chosen tier; batch caches are confined to one user operation. */
export async function reviewGenerationRequest(request: GenerationSubmitRequest, cache?: GenerationReviewCache, choice?: GenerationChoice | null, lockChoice = false): Promise<GenerationSubmitRequest> {
  const operation = request.operation_input
  if (!['image_generation', 'video_generation', 'video_edit'].includes(operation.kind ?? '')) return request
  const image = isImageOperation(operation)
  const response = await LlmService.getGenerationSpecificationApiV1LlmGenerationSpecificationGet({
    modelId: request.model_id, category: image ? 'image' : 'video',
    ratio: isImageOperation(operation) ? operation.target_ratio : isVideoOperation(operation) ? operation.ratio : undefined,
    references: request.media && 'references' in request.media ? request.media.references?.length ?? 0 : 0,
    editing: operation.kind === 'video_edit',
  })
  const spec = response.data as Spec
  if (!spec) throw new Error('生成规格读取失败')
  if (lockChoice && (!choice || choice.revision !== spec.revision_id)) throw new Error('视频模型配置已变化，请返回工作室刷新模型参数并重新确认，尚未提交任务')
  // A batch choice is reusable only for the same mode, ratio and supported option set.
  const cacheSuffix = ':' + operation.kind + ':' + JSON.stringify([spec.options, image && isImageOperation(operation) ? operation.target_ratio : null])
  const key = String(spec.revision_id) + cacheSuffix
  let value: string | null = image && isImageOperation(operation) ? operation.resolution_profile ?? spec.default
    : isVideoOperation(operation) ? operation.resolution ?? spec.default : null
  let audio: boolean | null = isVideoOperation(operation) && spec.generate_audio
    ? operation.generate_audio ?? spec.generate_audio.default : null
  if (choice && choice.revision === spec.revision_id) { value = choice.value; audio = choice.audio }
  if (cache?.has(key + ":audio")) audio = cache.get(key + ":audio") === "true"
  if (cache?.has(key)) value = cache.get(key) ?? null
  if (lockChoice && value && !spec.options?.some((item: any) => item.value === value)) throw new Error('当前视频规格已失效，请返回工作室重新选择，尚未提交任务')
  if (value && !spec.options.some((item: any) => item.value === value)) value = spec.default
  if (!cache?.has(key)) {
    value = await new Promise<string | null>((resolve, reject) => {
      let chosen = value
      let saveDefault = false
      Modal.confirm({
        title: cache ? '批量生成规格（确认各组规格后查看整批费用）' : '生成规格与预计费用',
        width: 620, icon: null, okText: cache ? '确认本组规格' : '按此规格生成', cancelText: '返回调整',
        content: <><Typography.Paragraph>{lockChoice ? '这是本次视频的费用确认。提示词、图片与参数沿用刚才的预览；修改参数请返回工作室。' : null}</Typography.Paragraph><ParameterForm locked={lockChoice} audio={audio} onAudioChange={next => { audio = next }} spec={spec} initial={value} request={request} onChange={next => { chosen = next }} onDefaultChange={next => { saveDefault = next }} /></>,
        onOk: async () => {
          if (saveDefault && chosen) {
            const saved = await LlmService.setGenerationDefaultApiV1LlmModelsModelIdGenerationDefaultsPatch({
              modelId: spec.model_id, requestBody: { expected_revision_id: spec.revision_id, field: spec.field, value: chosen, generate_audio: audio },
            })
            spec.revision_id = saved.data?.revision_id ?? spec.revision_id
          }
          resolve(chosen)
        },
        onCancel: () => { reject(new Error('已取消生成，未调用模型')) },
      })
    })
    cache?.set(String(spec.revision_id) + cacheSuffix, value)
    if (audio !== null) cache?.set(String(spec.revision_id) + cacheSuffix + ":audio", String(audio))
  }
  return {
    ...request, model_id: spec.model_id, expected_model_revision_id: spec.revision_id,
    operation_input: isImageOperation(operation)
      ? { ...operation, resolution_profile: value, size: spec.options.find((item: any) => item.value === value)?.size }
      : isVideoOperation(operation) ? { ...operation, resolution: value, generate_audio: audio } : operation,
  }
}
