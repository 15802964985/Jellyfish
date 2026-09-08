import { useEffect, useState } from 'react'
import { Alert, Button, Checkbox, Select, Space } from 'antd'
import { FilmService, LlmService, StudioGenerationTasksService } from '../../../../services/generated'
import type { ModelRead } from '../../../../services/generated'
import { loadAllPaginated } from '../../../../services/loadAllPaginated'
import { buildFileDownloadUrl } from '../../assets/utils'

const terminal = new Set(['succeeded', 'failed', 'cancelled'])

/** Explicit paid review of the current prompt; advice never changes the production prompt. */
export function QualityReviewPanel({ shotId, prompt, imageFileIds = [] }: { shotId: string; prompt: string; imageFileIds?: string[] }) {
  const [models, setModels] = useState<ModelRead[]>([])
  const [modelId, setModelId] = useState<string>()
  const [consent, setConsent] = useState(false)
  const [taskId, setTaskId] = useState<string>()
  const [pollRevision, setPollRevision] = useState(0)
  const [status, setStatus] = useState('')
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [reviewedPrompt, setReviewedPrompt] = useState('')
  const [reviewedSelection, setReviewedSelection] = useState('')
  const [retryId, setRetryId] = useState<string>()
  const [reviewImages, setReviewImages] = useState<string[]>([])
  const [resultMode, setResultMode] = useState('')
  const [cancelling, setCancelling] = useState(false)
  const active = Boolean(taskId && !terminal.has(status))
  useEffect(() => {
    let disposed = false
    loadAllPaginated<ModelRead>((page, pageSize) => LlmService.listModelsApiV1LlmModelsGet({ category: 'text', page, pageSize }))
      .then(items => { if (!disposed) setModels(items) }).catch(e => { if (!disposed) setError(String(e)) })
    return () => { disposed = true }
  }, [])
  const imageKey = imageFileIds.join('|')
  useEffect(() => { setConsent(false) }, [prompt, modelId, reviewImages, imageKey])
  useEffect(() => { setReviewImages([]) }, [imageKey])
  useEffect(() => {
    if (!taskId) return
    let disposed = false
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try {
        const r = await FilmService.getTaskResultApiV1FilmTasksTaskIdResultGet({ taskId })
        if (disposed) return
        if (r.data) {
          setStatus(r.data.status); setError(r.data.error || '')
          if (typeof r.data.result?.text === 'string') setText(r.data.result.text)
          setResultMode(r.data.result?.review_mode === 'image_and_text' ? '图文预检建议（仍需人工核对）' : '文字预检建议')
          if (terminal.has(r.data.status)) { setCancelling(false); return }
        }
      } catch (e) { if (!disposed) setError(`读取预检结果失败：${String(e)}`) }
      if (!disposed) timer = setTimeout(poll, 10000)
    }
    void poll()
    return () => { disposed = true; clearTimeout(timer) }
  }, [taskId, pollRevision])
  return <details className="mb-3 rounded-lg border border-slate-200 p-3 text-xs">
    <summary className="cursor-pointer">可选 AI 质量预检 · 需确认费用</summary>
    <Space direction="vertical" className="w-full mt-2">
      <Alert type="info" message="审核角色、道具、动作与连续性风险。默认仅分析文字；只有勾选图片才做图文预检。建议不会自动写入提示词，相同输入版本复用既有任务。" />
      <Select className="w-full" placeholder="选择已配置的文本模型" value={modelId} disabled={active || loading} onChange={setModelId} options={models.map(m => ({ label: m.name, value: m.id }))} />
      {imageFileIds.length > 0 && <div><p>可选参考图预检（最多4张，单张10MB内）。当前已接入百炼 Qwen3.8/3.7/3.6/3.5 的已核验型号及 Qwen3-VL、Qwen-VL；其他模型请仅做文字预检。</p>
        <div className="flex gap-3 flex-wrap">{Array.from(new Set(imageFileIds)).map((id, i) => <label key={id}>
          <img src={buildFileDownloadUrl(id)} alt={`待检查参考图 ${i + 1}`} className="h-20 w-24 object-contain" />
          <Checkbox checked={reviewImages.includes(id)} disabled={active || loading || (!reviewImages.includes(id) && reviewImages.length >= 4)} onChange={e => setReviewImages(prev => e.target.checked ? [...prev, id] : prev.filter(v => v !== id))}>图片 {i + 1}</Checkbox>
        </label>)}</div></div>}
      <Checkbox checked={consent} disabled={active || loading} onChange={e => setConsent(e.target.checked)}>同意将当前提示词、本地文字依据及勾选的 {reviewImages.length} 张图片发送给所选模型，并承担 API 费用</Checkbox>
      <Space><Button loading={loading} disabled={!consent || !modelId || !prompt.trim() || active} onClick={async () => {
        setLoading(true); setError(''); setText('')
        try {
          const r = await StudioGenerationTasksService.submitQualityReviewApiV1StudioGenerationTasksShotsShotIdQualityReviewPost({ shotId, requestBody: { model_id: modelId!, prompt, external_and_billing_confirmed: true, retry_request_id: retryId, image_file_ids: reviewImages } })
          if (!r.data?.task_id) throw new Error('预检未返回任务 ID')
          setReviewedPrompt(prompt); setTaskId(r.data.task_id); setStatus('pending')
          setReviewedSelection(JSON.stringify([modelId, reviewImages]))
          setPollRevision(v => v + 1)
        } catch (e) { setError(String(e)) } finally { setLoading(false) }
      }}>智能预检</Button>{active && <Button loading={cancelling} onClick={async () => {
        setCancelling(true)
        try { await FilmService.cancelTaskApiV1FilmTasksTaskIdCancelPost({ taskId: taskId!, requestBody: {} }) }
        catch (e) { setError(String(e)); setCancelling(false) }
      }}>取消预检</Button>}<span>{({ pending: '等待中', running: '进行中', succeeded: '已完成', failed: '失败', cancelled: '已取消' } as Record<string, string>)[status]}</span></Space>
      {reviewedPrompt && (reviewedPrompt !== prompt || reviewedSelection !== JSON.stringify([modelId, reviewImages])) && <Alert type="warning" message="提示词、模型或图片选择已变化，以下结果对应旧版本；修改后请重新预检。" />}
      {error && <Alert type="error" message={error} />}
      {(status === 'failed' || status === 'cancelled') && <Button onClick={() => { setRetryId(crypto.randomUUID()); setConsent(false); setError('已准备新的预检请求，请重新勾选费用确认后点击智能预检；旧任务不会被覆盖。') }}>准备手动重试（可能再次计费）</Button>}
      {text && <div><strong>{resultMode}</strong><pre className="max-h-72 overflow-auto whitespace-pre-wrap font-sans">{text}</pre></div>}
    </Space>
  </details>
}
