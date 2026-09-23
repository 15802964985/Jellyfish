import { BackgroundTaskNotice } from '../components/BackgroundTaskNotice'
import { CharacterViewPicker } from '../components/CharacterViewPicker'
import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Card, Collapse, Image, Modal, Select, Space, Tag, message } from 'antd'
import { FilmService, OpenAPI, StudioTimelineService, type EditVisualEvidence, type EditVisualModel, type EditVisualReport } from '../../../services/generated'

/** 只在用户要求时本地抽帧、明确确认后付费审片；历史记录始终绑定保存工程及具体片段。 */
export function EditVisualReviewPanel({ projectId, clipId, shotId, hasPrevious, revision, dirty }: { projectId: string; clipId: string; shotId: string; hasPrevious: boolean; revision: number; dirty: boolean }) {
  const [baselineIds, setBaselineIds] = useState<string[]>([])
  const [sampleMode, setSampleMode] = useState<'start' | 'bounds' | 'continuity'>('continuity')
  const sampleCount = sampleMode === 'start' ? 1 : sampleMode === 'bounds' || !hasPrevious ? 2 : 3
  const baselineLimit = 4 - sampleCount
  const [open, setOpen] = useState(false)
  const [models, setModels] = useState<EditVisualModel[]>([])
  const [modelId, setModelId] = useState('')
  const [evidence, setEvidence] = useState<EditVisualEvidence | null>(null)
  const [reports, setReports] = useState<EditVisualReport[]>([])
  const [reportId, setReportId] = useState('')
  const [busy, setBusy] = useState(false)
  const [taskId, setTaskId] = useState('')
  const [error, setError] = useState('')
  const scope = `${projectId}:${clipId}:${revision}`
  const currentScope = useRef(scope); currentScope.current = scope
  const requestId = useRef('')
  /** 异步响应核对当前选片，防止切换镜头后旧报告进入新面板。 */
  const loadHistory = async () => {
    const requested = scope
    const response = await StudioTimelineService.getEditVisualHistoryApiV1StudioTimelineProjectsProjectIdVisualReviewsGet({ projectId, clipId })
    if (currentScope.current === requested) { setReports(response.data || []); setReportId(response.data?.[0]?.task_id || '') }
  }
  useEffect(() => {
    let disposed = false
    setBaselineIds([]); setSampleMode('continuity'); setEvidence(null); setReports([]); setReportId(''); setTaskId(''); setError(''); setBusy(false)
    try { setTaskId(sessionStorage.getItem(`jellyfish_visual_task:${scope}`) || '') } catch { /* 仅指针恢复 */ }
    if (revision > 0) void loadHistory().catch(() => { if (!disposed) setError('历史报告加载失败，可手动刷新') })
    void StudioTimelineService.getEditVisualModelsApiV1StudioTimelineVisualReviewModelsGet().then(r => { if (!disposed) setModels(r.data || []) }).catch(() => { if (!disposed) setError('检查模型加载失败') })
    return () => { disposed = true }
  }, [scope])
  useEffect(() => {
    /** 配置变化或重新打开时只刷新有效性，不自动付费复检。 */
    const refresh=()=>{setEvidence(null);if(revision>0)void loadHistory().catch(()=>setError('设定变化后历史状态刷新失败，请手动刷新'))}
    window.addEventListener('creative-direction-updated',refresh)
    if(open)refresh()
    return()=>window.removeEventListener('creative-direction-updated',refresh)
  },[scope,open])
  useEffect(() => {
    if (!taskId) return
    let disposed = false
    /** 轮询只读任务状态；失败停止，不自动再次收费。 */
    const poll = async () => {
      try {
        const response = await FilmService.getTaskResultApiV1FilmTasksTaskIdResultGet({ taskId })
        if (disposed) return
        const status = response.data?.status
        if (status === 'succeeded') { try { sessionStorage.removeItem(`jellyfish_visual_task:${scope}`) } catch { /* 无存储 */ }; setTaskId(''); await loadHistory() }
        else if (status === 'failed' || status === 'cancelled') { setTaskId(''); setError('本次检查未成功，请在任务中心查看原因；系统不会自动付费重试') }
      } catch { if (!disposed) setError('状态查询失败，稍后重试查询；不会重复提交模型') }
    }
    void poll(); const timer = window.setInterval(() => void poll(), 3000)
    return () => { disposed = true; clearInterval(timer) }
  }, [taskId, scope])
  /** 准备材料仅消耗本地抽帧资源，并展示实际准备外发的图片和局限。 */
  const prepare = async () => {
    const requested = scope; setBusy(true); setError('')
    try {
      const response = await StudioTimelineService.prepareEditVisualApiV1StudioTimelineProjectsProjectIdVisualEvidencePost({ projectId, requestBody: { expected_revision: revision, clip_id: clipId, baseline_file_ids: baselineIds, sample_mode: sampleMode } })
      if (currentScope.current === requested) { setEvidence(response.data || null); requestId.current = crypto.randomUUID() }
    } catch (e) { if (currentScope.current === requested) setError((e as {body?: {detail?: string}}).body?.detail || '抽帧失败，请核对文件和工程版本') }
    finally { if (currentScope.current === requested) setBusy(false) }
  }
  /** 确认框明确外发和费用；网络失败保留幂等请求号，不无意重复收费。 */
  const submit = () => {
    const model = models.find(item => item.id === modelId)
    if (!evidence || !model || dirty) return
    const requested = scope
    Modal.confirm({ title: '确认付费 AI 视觉检查', content: `将向 ${model.name} 发送下方 ${evidence.images.length} 张图片及当前片段、人物设定。此次调用按供应商实际账单收费，暂不能准确预估金额。仅生成检查建议，不修改视频或人工复核状态。`, okText: '确认外发并检查',
      onOk: async () => {
        if (currentScope.current !== requested) throw new Error('选片已变化，请重新准备')
        setBusy(true)
        try {
          const response = await StudioTimelineService.submitEditVisualApiV1StudioTimelineProjectsProjectIdVisualReviewsPost({ projectId, requestBody: { evidence_id: evidence.evidence_id, model_id: model.id, model_revision_id: model.revision_id, request_id: requestId.current, external_and_billing_confirmed: true } })
          if (response.data?.task_id) { try { sessionStorage.setItem(`jellyfish_visual_task:${requested}`,response.data.task_id) } catch { /* 全局任务中心仍可查 */ }; window.dispatchEvent(new CustomEvent('jellyfish:task-accepted',{detail:{taskId:response.data.task_id,title:'视觉一致性检查'}})) }
          if (currentScope.current === requested) { setTaskId(response.data?.task_id || ''); setEvidence(null); message.success('检查已提交，可在任务中心查看状态') }
        } catch (e) { if (currentScope.current === requested) setError((e as {body?: {detail?: string}}).body?.detail || '提交未确认，请检查任务中心后重试'); throw e }
        finally { if (currentScope.current === requested) setBusy(false) }
      } })
  }
  const report = reports.find(item => item.task_id === reportId)
  const visibleEvidence = evidence || report?.evidence
  return <Card size="small" title="AI 视觉一致性检查">
    <p className="ve-help">抽帧对照人物与前后镜头。准备和查看历史免费，调用模型前确认费用。</p>
    <Button onClick={() => setOpen(true)}>打开视觉检查{reports.length ? `（${reports.length}份成功报告）` : ''}</Button>
    {taskId && <Tag color="processing">检查进行中</Tag>}
    <Modal title="片段视觉一致性检查" open={open} onCancel={() => setOpen(false)} footer={null} width={960} styles={{ body: { maxHeight: '72vh', overflowY: 'auto' } }}>

    <BackgroundTaskNotice active={Boolean(taskId)} />
    <p className="ve-help">本地准备抽帧 → 预览外发材料 → 确认付费检查 → 人工决定是否返工。查看历史报告不收费。</p>
    {dirty && <Alert type="warning" message="工程有未保存修改，请保存后检查；下方旧报告不代表当前草稿" />}
    {error && <Alert type="warning" message={error} />}
    <Space direction="vertical" style={{ width: '100%', marginBottom: 12 }}>
      <label>本次检查的采样范围</label>
      <Select aria-label="视觉检查采样模式" value={sampleMode} disabled={busy || !!taskId} onChange={value => { setSampleMode(value); setEvidence(null) }} options={[
        { value: 'start', label: '当前起始画面 · 最多3张人物基准，适合多角度身份对照' },
        { value: 'bounds', label: '当前起止画面 · 最多2张人物基准' },
        { value: 'continuity', label: `当前起止与上一镜头结束 · 最多${hasPrevious ? 1 : 2}张人物基准` }
      ]} />
      <CharacterViewPicker shotId={shotId} selected={baselineIds} onClearFiles={ids=>{setBaselineIds(prev=>prev.filter(id=>!ids.includes(id)));setEvidence(null)}} ordinalOffset={sampleCount} disabled={busy || !!taskId} canAdd={() => baselineIds.length < baselineLimit}
        onToggle={(_group, view, checked) => { setBaselineIds(ids => checked ? [...ids, view.file_id] : ids.filter(id => id !== view.file_id)); setEvidence(null) }} />
      <p className="ve-help">本次选中 {baselineIds.length}/{baselineLimit} 张基准；未选择的角度不会外发。更换选择后请重新准备材料。</p>
      {baselineIds.length > baselineLimit && <Alert type="error" message="所选基准超过当前采样模式容量，请取消部分图片或调整采样模式" />}
    </Space>
    <Space wrap><Button disabled={dirty || revision < 1 || !!taskId || baselineIds.length > baselineLimit} loading={busy} onClick={() => void prepare()}>准备检查材料（本地免费）</Button>
      <Button disabled={!revision} onClick={() => void loadHistory().catch(() => setError('历史加载失败'))}>刷新历史报告</Button></Space>
    {taskId && <Tag color="processing">检查进行中，任务中心可查看状态</Tag>}
    {visibleEvidence && <div style={{ marginTop: 12 }}>
      <strong>{evidence ? '本次外发材料' : '历史报告使用的材料'} · 工程 v{visibleEvidence.revision}</strong>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '8px 0' }}><Image.PreviewGroup>{visibleEvidence.images.map((image, index) => <div key={`${image.file_id}:${index}`} style={{ width: 110 }}>
        <Image width={104} height={90} style={{ objectFit: 'contain' }} src={`${OpenAPI.BASE}/api/v1/studio/files/${encodeURIComponent(image.file_id)}/preview`} />
        <div>{index + 1}. {image.label}{image.seconds != null && ` · 源片 ${image.seconds.toFixed(2)}s`}</div></div>)}</Image.PreviewGroup></div>
      <Collapse items={Object.entries(visibleEvidence.shot_contexts||{}).map(([key,value])=>{
        const context=value as {shot_id:string;creative_direction?:{effective?:Record<string,unknown>;appearances?:Record<string,unknown>};sources?:{sources?:{field:string;text?:string|null}[]}}
        const effective=context.creative_direction?.effective||{}
        return {key,label:`${key===visibleEvidence.clip_id?'当前':'对照片段'} · ${[effective.era,effective.treatment,effective.primary_genre].filter(Boolean).join(' / ')||'未配置时代或风格'}`,children:<><p>镜头：{context.shot_id}</p><p>剧情变化依据取自以下实际摘录；穿越、回忆标签本身不代表每次变化都合理。</p><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{context.sources?.sources?.filter(s=>s.field==='script_excerpt').map(s=>s.text).join('\n')||'未记录剧情摘录，需人工核对'}</pre><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',maxHeight:260,overflow:'auto'}}>{JSON.stringify({effective,appearances:context.creative_direction?.appearances,sources:context.sources},null,2)}</pre></>}
      })}/>
      {!Object.keys(visibleEvidence.shot_contexts||{}).length&&<Alert type="warning" message="历史材料未记录逐镜头设定，不代表完整跨镜头审查"/>}
      {visibleEvidence.limitations.map(text => <p className="ve-help" key={text}>{text}</p>)}
    </div>}
    {evidence && <Space direction="vertical" style={{ width: '100%' }}><Select aria-label="视觉检查模型" style={{ width: '100%' }} placeholder="选择已配置的视觉模型" value={modelId || undefined} onChange={setModelId} options={models.map(m => ({ value: m.id, label: m.name }))} />
      {!models.length && <Alert type="info" message="当前没有已核验且启用的视觉模型，请到模型管理配置；不会自动切换模型" />}
      <Button type="primary" disabled={!modelId || dirty || busy || !!taskId} onClick={submit}>确认费用并检查</Button></Space>}
    {reports.length > 0 && <div style={{ marginTop: 12 }}><Select aria-label="成功的视觉检查报告" style={{ width: '100%' }} value={reportId} onChange={setReportId} options={reports.map(r => ({ value: r.task_id, label: `${new Date(r.created_at).toLocaleString()} · v${r.revision} · ${r.model_name}` }))} />
      {report && <><Tag color={report.matches_current && !dirty ? 'blue' : 'orange'}>{report.matches_current && !dirty ? '对应当前保存工程 · 待人工核对' : '历史版本 · 不代表当前工程'}</Tag><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 400, overflow: 'auto' }}>{report.text}</pre></>}</div>}
    </Modal>
  </Card>
}
