import { BackgroundTaskNotice } from '../../components/BackgroundTaskNotice'
import { formatStudioTime } from '../../components/studioTime'
import { PreviewImage } from '../../../../components/PreviewImage'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Button, Checkbox, Input, Pagination, Select, Space, Tag, message } from 'antd'
import { FilmService, StudioGenerationTasksService } from '../../../../services/generated'
import type { QualityReviewRecord, ReviewGenerationContext_Input as ReviewGenerationContext } from '../../../../services/generated'
import { loadAllPaginated } from '../../../../services/loadAllPaginated'
import { buildFileDownloadUrl } from '../../assets/utils'

const terminal = new Set(['succeeded', 'failed', 'cancelled'])
type Scope = 'video' | 'first' | 'key' | 'last'
/** 固定字段顺序比较具体生成输入；预检模型不等于生成视频模型。 */
export function reviewContextKey(c?: ReviewGenerationContext | null) {
  return JSON.stringify(c ? [c.model_revision_id, c.reference_mode, c.image_file_ids, c.ratio, c.seconds, c.resolution, c.generate_audio, c.subjects || [], c.stage || 'before', c.output_file_id || null, c.source_fingerprint || null, c.draft_prompt || null, c.shot_id || null] : null)
}
/** 读取已有报告不计费；新预检/调整显式提交，应用由业务草稿负责。 */
export function QualityReviewPanel({ shotId, prompt, imageFileIds = [], scope = 'video', inputReady = true, generationContext, sourceFingerprint, onApply, onLineage, onLatestApplied, onRestore, disabledReason }: {
  sourceFingerprint?: string | null
  disabledReason?: string
  onLatestApplied?: (record: QualityReviewRecord | null) => void
  onRestore?: (record: QualityReviewRecord) => Promise<void>
  inputReady?: boolean
  shotId: string; prompt: string; imageFileIds?: string[]; scope?: Scope; generationContext?: ReviewGenerationContext
  onApply?: (record: QualityReviewRecord, prompt: string) => Promise<void>
  onLineage?: (record: QualityReviewRecord | null) => void
}) {
  const [models, setModels] = useState<Array<{id:string;name:string;supports_images:boolean}>>([])
  const [modelId, setModelId] = useState<string>()
  const [consent, setConsent] = useState(false)
  const [latestApplied, setLatestApplied] = useState<QualityReviewRecord | null>(null)
  const [records, setRecords] = useState<QualityReviewRecord[]>([])
  const [selectedId, setSelectedId] = useState<string>()
  const [selected, setSelected] = useState<QualityReviewRecord | null>(null)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [refresh, setRefresh] = useState(0)
  const [loading, setLoading] = useState(false)
  const submitLock = useRef(false)
  const submitIntent = useRef<{ key: string; id: string } | null>(null)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState('')
  const [reviewImages, setReviewImages] = useState<string[]>([])
  const [referenceReports, setReferenceReports] = useState<QualityReviewRecord[]>([])
  const [referenceId, setReferenceId] = useState<string>()
  const [constraints, setConstraints] = useState('')
  const [proposal, setProposal] = useState('')
  const imageKey = imageFileIds.join('|')
  const contextKey = reviewContextKey(generationContext)
  const active = !!selected && !terminal.has(selected.status)
  const unsupportedImages = reviewImages.length > 0 && !!modelId && !models.find(m=>m.id===modelId)?.supports_images
  const sameVersion = !!selected && (!sourceFingerprint || selected.source_fingerprint === sourceFingerprint) && (scope === 'video' && selected.application?.active ? selected.application.prompt : selected.prompt) === prompt && reviewContextKey(selected.generation_context) === contextKey
  useEffect(() => {
    let disposed = false
    StudioGenerationTasksService.qualityReviewModelsApiV1StudioGenerationTasksQualityReviewModelsGet()
      .then(r => { if (!disposed) setModels((r.data || []) as Array<{id:string;name:string;supports_images:boolean}>) }).catch(e => { if (!disposed) setError(String(e)) })
    return () => { disposed = true }
  }, [])
  useEffect(() => { setConsent(false) }, [prompt, reviewImages, constraints, contextKey, selectedId, referenceId])
  useEffect(() => { setReviewImages(generationContext?.output_file_id ? [generationContext.output_file_id, ...imageFileIds.filter(id=>id!==generationContext.output_file_id)].slice(0,4) : []) }, [imageKey, generationContext?.output_file_id])
  useEffect(() => { setSelectedId(undefined); setSelected(null); setPage(1) }, [shotId, scope])
  useEffect(() => {
    let disposed = false
    const request = StudioGenerationTasksService.getQualityReviewHistoryApiV1StudioGenerationTasksShotsShotIdQualityReviewsGet({ shotId, scope, stage: generationContext?.stage || 'before', outputFileId: generationContext?.output_file_id, page, pageSize: 10 })
    request.then(r => {
      if (disposed || !r.data) return
      setRecords(r.data.items); setTotal(r.data.total); setLatestApplied(r.data.latest_applied || null)
      const running = r.data.active_tasks?.find(item => reviewContextKey(item.generation_context) === contextKey && item.prompt === prompt)
      const chosen = running || r.data.items.find(item => item.task_id === selectedId) || (!selectedId ? r.data.items.find(item => item.application?.active && item.application.prompt === prompt && reviewContextKey(item.generation_context) === contextKey) || r.data.items[0] : undefined)
      if (chosen) { setSelected(chosen); setSelectedId(chosen.task_id) }
    }).catch(e => { if (!disposed) setError(`历史读取失败：${String(e)}`) })
    return () => { disposed = true; request.cancel() }
  }, [shotId, scope, page, refresh, selectedId, generationContext?.stage, generationContext?.output_file_id])
  useEffect(() => { onLatestApplied?.(latestApplied) }, [latestApplied, onLatestApplied])
  useEffect(() => {
    let disposed = false
    setReferenceId(undefined); setReferenceReports([])
    Promise.all((scope === 'video' ? ['legacy'] : ['video', 'legacy']).map(sourceScope =>
      loadAllPaginated<QualityReviewRecord>((page, pageSize) => StudioGenerationTasksService.getQualityReviewHistoryApiV1StudioGenerationTasksShotsShotIdQualityReviewsGet({shotId, scope: sourceScope as 'video' | 'legacy', page, pageSize: Math.min(pageSize, 50)}))
    )).then(groups => {if(!disposed)setReferenceReports(groups.flat())}).catch(() => {})
    return () => {disposed=true}
  }, [shotId, scope])
  useEffect(() => { setProposal(selected?.application?.prompt || selected?.revision?.revised_prompt || '') }, [selected?.task_id, selected?.revision?.revised_prompt, selected?.application?.prompt])
  // 关联只在版本严格一致时成立；历史报告仍可查看，不自动当成本次已预检。
  useEffect(() => {
    const application = selected?.application
    const matches = selected?.status === 'succeeded' && (!sourceFingerprint || selected.source_fingerprint === sourceFingerprint) && reviewContextKey(selected.generation_context) === contextKey &&
      (application?.active ? application.prompt === prompt : selected.action === 'review' && selected.prompt === prompt)
    onLineage?.(matches ? selected : null)
  }, [selected, prompt, contextKey, sourceFingerprint, onLineage])
  useEffect(() => {
    if (!selectedId || !active) return
    let disposed = false
    let timer: ReturnType<typeof setTimeout>
    /** 轮询既有任务，不重新提交；终态刷新持久记录和应用标记。 */
    const poll = async () => {
      try {
        const r = await FilmService.getTaskResultApiV1FilmTasksTaskIdResultGet({ taskId: selectedId })
        if (disposed) return
        if (r.data && terminal.has(r.data.status)) {
          setSelected(prev => prev ? { ...prev, status: r.data!.status, error: r.data!.error || '', text: String(r.data!.result?.text || '') } : prev)
          setRefresh(v => v + 1); return
        }
      } catch (e) { if (!disposed) setError(String(e)) }
      if (!disposed) timer = setTimeout(poll, 3000)
    }
    void poll()
    return () => { disposed = true; clearTimeout(timer) }
  }, [active, selectedId])
  /** 新调用必须由用户点击且确认费用；旧任务/方案不自动收费重跑。 */
  const submit = useCallback(async (action: 'review' | 'revise' | 'review_and_revise') => {
    if (submitLock.current || active || !inputReady || !modelId || !consent || unsupportedImages) return
    submitLock.current = true
    setLoading(true); setError('')
    try {
      const body = {
        model_id: modelId, prompt, external_and_billing_confirmed: true, image_file_ids: reviewImages, scope,
        generation_context: generationContext, action, source_task_id: action === 'revise' ? selected?.task_id : undefined,
        user_constraints: constraints, reference_report_task_id: referenceId,
      }
      // A confirmed explicit attempt gets its own key, including revision retries after failure.
      // If the acceptance response is lost, reuse the same intent instead of billing twice.
      const key = JSON.stringify([shotId, body])
      if (submitIntent.current?.key !== key) submitIntent.current = { key, id: crypto.randomUUID() }
      const r = await StudioGenerationTasksService.submitQualityReviewApiV1StudioGenerationTasksShotsShotIdQualityReviewPost({ shotId, requestBody: { ...body, retry_request_id: submitIntent.current.id } })
      if (!r.data?.task_id) throw new Error('没有返回任务编号')
      submitIntent.current = null
      setSelectedId(r.data.task_id); setSelected({ task_id: r.data.task_id, status: 'pending', action, scope, prompt,
        created_at: new Date().toISOString(), image_file_ids: reviewImages, generation_context: generationContext })
      window.dispatchEvent(new CustomEvent('jellyfish:task-accepted',{detail:{taskId:r.data!.task_id,title:'AI检查与优化'}}))
      setPage(1); setRefresh(v => v + 1); setConsent(false)
    } catch (e) { setError(String(e)) } finally { submitLock.current = false; setLoading(false) }
  }, [active, modelId, consent, shotId, prompt, reviewImages, scope, generationContext, selected, constraints, inputReady, referenceId, unsupportedImages])
  /** 应用不调用模型；保存成功后才标记已应用。 */
  const apply = async () => {
    if (!inputReady || !selected || !onApply) return
    setApplying(true); setError('')
    try { await onApply(selected, proposal); setRefresh(v => v + 1); message.success('优化稿已保存，已同步到提示词与发送预览') }
    catch (e) { setError(String(e)) } finally { setApplying(false) }
  }
  const currentApplied = latestApplied?.application?.active && (!sourceFingerprint || latestApplied.source_fingerprint === sourceFingerprint) && latestApplied.application.prompt === prompt && reviewContextKey(latestApplied.application.generation_context) === contextKey
  const currentStatus = currentApplied ? '当前生成稿已应用智能优化' : latestApplied ? '历史优化已应用，当前版本不同' : selected?.revision ? '优化方案已生成，尚未应用' : selected?.optimization_status === 'applied' ? '此预检的优化曾应用' : selected?.optimization_status ? '已有优化方案，待查看' : total ? (onApply ? '已有预检，尚未智能优化' : '已有预检记录') : '尚无预检记录'
  /** 从历史分页定位同一预检的关联方案，读取免费，不重复调用优化模型。 */
  const showRelatedRevision = async (target = selected?.optimization_task_id) => {
    if (!target) return
    setLoading(true); setError('')
    try {
      for (let historyPage = 1; historyPage <= Math.max(1, Math.ceil(total / 50)); historyPage++) {
        const response = await StudioGenerationTasksService.getQualityReviewHistoryApiV1StudioGenerationTasksShotsShotIdQualityReviewsGet({ shotId, scope, stage: generationContext?.stage || 'before', outputFileId: generationContext?.output_file_id, page: historyPage, pageSize: 50 })
        const index = response.data?.items.findIndex(item => item.task_id === target) ?? -1
        if (index >= 0 && response.data) {
          setSelected(response.data.items[index]); setSelectedId(target); setPage(Math.floor(((historyPage - 1) * 50 + index) / 10) + 1); return
        }
      }
      setError('关联方案已不可读取；旧预检仍保留，不会自动重新调用模型。')
    } catch (e) { setError(String(e)) } finally { setLoading(false) }
  }
  const unavailable = !inputReady ? (disabledReason || '请先更新最终提示词和参数（免费）') : !prompt.trim() ? '请先填写提示词并更新发送预览（免费）' : !modelId ? '请选择预检使用的文本模型' : unsupportedImages ? '所选模型当前未接入看图检查，请改选标注“支持看图”的模型，或在生成前取消送检图片' : !consent ? '请确认本次外发内容和调用费用' : active ? '当前检查任务尚未结束' : ''
  const targetLabel = scope === 'video' ? '视频' : ({first:'首帧',key:'关键帧',last:'尾帧'}[scope])
  return <details open={scope === 'video' ? true : undefined} className="mb-3 rounded-lg border border-slate-200 p-3 text-xs">
    <summary className="cursor-pointer">{targetLabel} AI 检查与优化（可选）· 历史读取免费 <Tag color={currentApplied ? 'green' : 'blue'}>{currentStatus}</Tag></summary>
    <Space direction="vertical" className="mt-2 w-full">
      <BackgroundTaskNotice active={active} />
      {unavailable && <Alert type="info" message={unavailable} />}
      <Alert type="info" message="进入页面只读取已有记录，不调用模型。只有主动点击重新预检或智能调整并确认费用才发起新调用。历史建议可复用，应用已有方案不计费。" />
      <Select className="w-full" placeholder="选择成功返回的预检或优化记录" disabled={active || loading} value={records.some(item => item.task_id === selectedId) ? selectedId : undefined} onChange={id => { setSelectedId(id); setSelected(records.find(r => r.task_id === id) || null) }} options={records.map(r => ({ value: r.task_id, label: `${formatStudioTime(r.created_at)} · ${r.scope === 'legacy' ? '旧记录（用途未标注）' : r.action === 'revise' ? '智能优化' : '预检'} · ${r.application?.active ? '已应用优化' : r.optimization_status === 'applied' ? '优化已应用' : r.revision || r.optimization_status ? '已有优化方案' : r.status === 'succeeded' ? '已完成' : r.status}` }))} />
      {total > 10 && <Pagination size="small" current={page} total={total} pageSize={10} showSizeChanger={false} onChange={value => { setSelectedId(undefined); setPage(value) }} />}
      <Button size="small" onClick={() => setRefresh(v => v + 1)}>刷新历史（免费）</Button>
      <Alert type={currentApplied ? 'success' : 'info'} message={currentStatus}
        description={currentApplied ? `应用时间（本地）：${formatStudioTime(latestApplied?.application?.applied_at)}。当前生成稿与保存的应用版本一致。` : scope === 'video' ? '手动触发流程：选择成功预检 → 选文本模型并确认本次费用 → 智能调整 → 查看前后对比 → 应用优化。刷新或打开页面不会自动优化。' : '可直接生成；需要辅助时：选择检查模型并确认费用 → 一次检查并生成优化稿 → 对比 → 自主应用。已有报告可复用，打开页面不会自动调用模型。'} />
      {selected?.optimization_task_id && <Button type="primary" loading={loading} onClick={() => void showRelatedRevision()}>查看此预检的优化方案（免费）</Button>}
      {selected?.source_task_id && <Button onClick={() => void showRelatedRevision(selected.source_task_id || undefined)}>返回来源预检继续调整（读取免费）</Button>}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-3" aria-label="智能优化操作区">
        <strong>{scope !== 'video' ? `检查${targetLabel}并优化单张画面提示词` : onApply ? '根据已选预检智能优化当前生成提示词' : '预检当前帧图提示词'}</strong>
        {onApply && <p className="mb-0 text-xs leading-6 text-slate-600">此操作额外调用一次文本模型，返回完整优化稿、修改说明和待核对项。应用已有优化稿免费，应用后可直接生成，不要求再次预检；生成图片或视频按对应模型另计费。</p>}
      {!!referenceReports.length && <details><summary>引用其他用途的历史建议（可选，读取免费）</summary>
        <p>仅作线索，不代表当前用途已检查；用途未标注的旧报告在此单独保留。</p>
        <Select className="w-full" allowClear aria-label="引用历史报告" placeholder="选择视频建议或用途未标注的旧报告" value={referenceId} onChange={setReferenceId} options={referenceReports.map(r=>({value:r.task_id,label:`${r.scope === 'legacy' ? '用途未标注' : '视频建议'} · ${formatStudioTime(r.created_at)}`}))}/>
        {referenceId && <pre className="max-h-48 overflow-auto whitespace-pre-wrap">{referenceReports.find(r=>r.task_id===referenceId)?.text}</pre>}
      </details>}
      <Select className="w-full" aria-label="检查模型" placeholder="选择预检/优化使用的文本模型" value={modelId} disabled={active || loading} onChange={value => { setConsent(false); setModelId(value) }} options={models.map(m => ({ label: `${m.name} · ${m.supports_images ? '支持看图' : '仅文字检查'}`, value: m.id }))} />
      {!!imageFileIds.length && <div><p>可选将当前参考图片发给模型（最多4张；仅已接入视觉预检的型号支持）。不勾选时，优化只依据文字及旧报告。</p><div className="flex flex-wrap gap-3">{Array.from(new Set(imageFileIds)).map((id, i) => <div key={id}><PreviewImage src={buildFileDownloadUrl(id)} alt={`当前参考 ${i + 1}`} className="h-20 w-24 object-contain" /><Checkbox checked={reviewImages.includes(id)} disabled={id === generationContext?.output_file_id || active || loading || (!reviewImages.includes(id) && reviewImages.length >= 4)} onChange={e => setReviewImages(prev => e.target.checked ? [...prev, id] : prev.filter(v => v !== id))}>{id === generationContext?.output_file_id ? '待检查的图片版本（必传）' : `基准/参考图片 ${i + 1}`}</Checkbox></div>)}</div></div>}
      {onApply && <Input.TextArea rows={2} value={constraints} onChange={e => setConstraints(e.target.value)} placeholder="可选补充：明确哪些判断有误、哪些设定必须保留。无需手工重写提示词。" />}
      <Checkbox checked={consent} disabled={active || loading} onChange={e => setConsent(e.target.checked)}>同意本次将提示词、来源、所选报告和勾选图片发送给所选模型，并承担一次 API 调用费用</Checkbox>
      <Space wrap><Button loading={loading} disabled={!inputReady || unsupportedImages || !consent || !modelId || !prompt.trim() || active} onClick={() => void submit(scope === 'video' ? 'review' : 'review_and_revise')}>{scope !== 'video' ? '检查并生成优化稿（一次模型调用）' : total ? '重新预检（调用模型）' : '智能预检（调用模型）'}</Button>
        {onApply && <Button type="primary" disabled={!inputReady || unsupportedImages || !consent || !modelId || active || !selected || !['review','review_and_revise'].includes(selected.action) || selected.status !== 'succeeded'} loading={loading} onClick={() => void submit('revise')}>依据此预检智能调整（调用模型）</Button>}
        {active && <Button onClick={async () => { try { await FilmService.cancelTaskApiV1FilmTasksTaskIdCancelPost({ taskId: selectedId!, requestBody: {} }) } catch (e) { setError(String(e)) } }}>取消任务</Button>}
      </Space>
        {onApply && !consent && <div className="text-xs text-slate-600">按钮未启用时，请先选择文本模型并勾选本次调用费用确认；已有方案可直接免费查看和应用。</div>}
      </div>
      {latestApplied?.application?.active && onRestore && <Button onClick={async()=>{try {await onRestore(latestApplied);setRefresh(v=>v+1)}catch(e){setError(String(e))}}}>恢复原始发送稿（免费）</Button>}
      {selected && <>
        <div>创建时间（本地）：{formatStudioTime(selected.created_at)}<br />预检/优化任务：{selected.task_id}<br />调用模型：{selected.model_name || '以任务记录为准'}</div>
        {selected.source_task_id && <div>来源预检：{selected.source_task_id}</div>}
        {selected.application && <Alert type={selected.application.prompt === prompt && reviewContextKey(selected.application.generation_context) === contextKey ? 'success' : 'warning'} message={`已应用优化 · ${formatStudioTime(selected.application.applied_at)}${selected.application.prompt === prompt && reviewContextKey(selected.application.generation_context) === contextKey ? '' : ' · 当前内容或参数与应用版本不同'}`} />}
        {!sameVersion && !selected.application && <Alert type="warning" message="此记录对应旧提示词或其他生成参数，仅供参考，不代表本次生成已预检。可结合当前版本继续智能调整。" />}
        <details><summary>查看当时提示词及参考图片</summary><pre className="max-h-48 overflow-auto whitespace-pre-wrap font-sans">{selected.prompt}</pre>
          <div className="flex flex-wrap gap-2">{selected.image_file_ids.map((id, i) => <PreviewImage key={id} src={buildFileDownloadUrl(id)} alt={`预检图片 ${i + 1}`} className="h-20 w-24 object-contain" />)}</div>
          {selected.generation_context && <div className="mt-2 space-y-1">
            <div>目标生成模型：{selected.generation_model_name || '旧记录未保存名称'}（与预检文本模型分开）</div>
            <div>参考模式：{({ subjects: '主体多图', text_only: '纯文本', first: '首帧', last: '尾帧', key: '关键帧', first_last: '首尾帧' } as Record<string, string>)[selected.generation_context.reference_mode || ''] || selected.generation_context.reference_mode}</div>
            <div>时长：{selected.generation_context.seconds ?? '未指定'} 秒 · 比例：{selected.generation_context.ratio || '未指定'} · 分辨率：{selected.generation_context.resolution || '模型默认'}</div>
            <div>生成参考图顺序：{selected.generation_context.image_file_ids?.length ? selected.generation_context.image_file_ids.map((id, i) => `${i + 1}. ${id}`).join('；') : '无图片参考'}</div>
          </div>}
        </details>
        {selected.error && <Alert type="error" message={selected.error} />}
        {selected.text && !selected.revision && <div><strong>{selected.action === 'revise' ? '智能调整原始返回（未识别完整优化稿）' : '预检建议（事实与推断仍需核对）'}</strong><pre className="max-h-72 overflow-auto whitespace-pre-wrap font-sans">{selected.text}</pre></div>}
        {selected.revision && <>
          <Alert type="info" message={selected.application ? '此方案曾应用，可回看修改；再次应用仍需版本一致。' : '优化方案已生成，尚未应用。下方对比左侧为原稿，右侧为优化稿；点击应用后才进入实际生成。'} />
          <ul>{selected.revision.changes?.map((text, i) => <li key={i}>{text}</li>)}</ul>
          {!!selected.revision.unresolved?.length && <Alert type="warning" message="以下问题未通过提示词自动解决" description={<ul>{selected.revision.unresolved.map((text, i) => <li key={i}>{text}</li>)}</ul>} />}
          <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-2" aria-label="提示词优化前后对比">
            <div className="min-w-0"><strong>优化前（此次方案输入原稿）</strong><Input.TextArea aria-label="优化前提示词" rows={9} readOnly value={selected.application?.before_prompt || selected.prompt} /></div>
            <div className="min-w-0"><strong>优化后（可微调，应用后生效）</strong><Input.TextArea aria-label="优化后提示词" rows={9} value={proposal} onChange={e => setProposal(e.target.value)} /></div>
          </div>
          {onApply && <Button type="primary" loading={applying} disabled={!inputReady || !proposal.trim() || !sameVersion} onClick={() => void apply()}>应用并保存为生成稿（免费）</Button>}
        </>}
      </>}
      {error && <Alert type="error" message={error} />}
    </Space>
  </details>
}
