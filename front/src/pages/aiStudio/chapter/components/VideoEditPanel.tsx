import { GenerationChannelActions } from '../../../../components/GenerationChannelActions'
import { WebHandoffButton } from '../../../../components/WebHandoffButton'
import { StudioWebGenerationService as Web } from '../../../../services/generated'
import { CreativePromptPreview, useCreativePrompt } from '../../../../components/CreativePromptPreview'
import { BackgroundTaskNotice } from '../../components/BackgroundTaskNotice'
import { PreviewImage } from '../../../../components/PreviewImage'
import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Checkbox, Input, InputNumber, Modal, Pagination, Select, Space, Upload, message } from 'antd'
import { FilmService, StudioFilesService, StudioGenerationTasksService } from '../../../../services/generated'
import type { VideoEditModelRead, VideoEditPreviewRead, GenerationTaskLinkRead } from '../../../../services/generated'
import { buildFileDownloadUrl } from '../../assets/utils'
import { MediaFilePicker } from '../../files/MediaFilePicker'

const terminal = new Set(['succeeded', 'failed', 'cancelled'])

/** Source/result comparison remains in the studio, never in the generic task center. */
export function VideoEditPanel({ shotId, currentFileId, onAdopted }: {
  shotId: string; currentFileId: string | null; onAdopted: () => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [source, setSource] = useState(currentFileId || '')
  const [references, setReferences] = useState<string[]>([])
  const [positions, setPositions] = useState<Record<string, number>>({})
  const [prompt, setPrompt] = useState('')
  const creativePreview = useCreativePrompt('shot', shotId, 'video', prompt)
  const [preserve, setPreserve] = useState('')
  const [keepAudio, setKeepAudio] = useState(true)
  const [consent, setConsent] = useState(false)
  const [models, setModels] = useState<VideoEditModelRead[]>([])
  const [modelId, setModelId] = useState<string>()
  const [catalogRevision, setCatalogRevision] = useState(0)
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsError, setModelsError] = useState('')
  const [candidates, setCandidates] = useState<Array<Record<string, string>>>([])
  const [resolution, setResolution] = useState<string>()
  const [seconds, setSeconds] = useState<number>()
  const [preview, setPreview] = useState<VideoEditPreviewRead>()
  const [taskId, setTaskId] = useState<string>()
  const [pollRevision, setPollRevision] = useState(0)
  const [status, setStatus] = useState('')
  const [resultFile, setResultFile] = useState<string>()
  const [rawFile, setRawFile] = useState<string>()
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [adopting, setAdopting] = useState(false)
  const [checking, setChecking] = useState(false)
  const [estimating, setEstimating] = useState(false)
  const [estimateError, setEstimateError] = useState('')
  const [checkSummary, setCheckSummary] = useState('')
  const [picker, setPicker] = useState<'image' | 'video'>()
  const [history, setHistory] = useState<GenerationTaskLinkRead[]>([])
  const [historyPage, setHistoryPage] = useState(1)
  const [historyTotal, setHistoryTotal] = useState(0)
  const requestId = useRef(crypto.randomUUID())
  const active = Boolean(taskId && !terminal.has(status))
  const locked = active || submitting || checking
  const selectedModel = models.find(m => m.model_id === modelId)
  const runway = selectedModel?.timed_images || false
  const maxImages = selectedModel?.max_images || 0

  useEffect(() => {
    setOpen(false); setSource(currentFileId || ''); setReferences([]); setPositions({})
    setTaskId(undefined); setStatus(''); setResultFile(undefined); setRawFile(undefined)
    setPrompt(''); setPreserve(''); setConsent(false); setPreview(undefined); setHistoryPage(1)
    setError(''); setCheckSummary(''); requestId.current = crypto.randomUUID()
  }, [shotId])
  useEffect(() => { if (!source && currentFileId) setSource(currentFileId) }, [currentFileId, source])
  useEffect(() => {
    if (!open) return
    let disposed = false
    FilmService.listTaskLinksApiV1FilmTaskLinksGet({ relationType: 'shot_video_edit', relationEntityId: shotId, page: historyPage, pageSize: 10 })
      .then(r => { if (!disposed) { setHistory(r.data?.items || []); setHistoryTotal(r.data?.pagination.total || 0) } })
      .catch(e => { if (!disposed) setError(String(e)) })
    return () => { disposed = true }
  }, [open, shotId, historyPage, status])

  useEffect(() => {
    if (!open) return
    let disposed = false
    setModelsLoading(true); setModelsError('')
    StudioGenerationTasksService.listVideoEditModelsApiV1StudioGenerationTasksVideoEditModelsGet()
      .then(r => {
        if (disposed) return
        const rows = r.data?.models || []
        setModels(rows); setCandidates(r.data?.candidates || [])
        const current = rows.find(m => m.model_id === modelId && m.available)
        if (!current) { setModelId(undefined); setResolution(undefined); setSeconds(undefined) }
        if (current) { setResolution(current.default_resolution || undefined); setSeconds(current.default_seconds || undefined) }
        setPreview(undefined); setConsent(false)
      }).catch(e => { if (!disposed) { setModelsError(String(e)); setModels([]); setModelId(undefined) } })
      .finally(() => { if (!disposed) setModelsLoading(false) })
    return () => { disposed = true }
  }, [open, catalogRevision])


  useEffect(() => {
    if (!open || !taskId) return
    let disposed = false
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try {
        const response = await FilmService.getTaskResultApiV1FilmTasksTaskIdResultGet({ taskId })
        if (disposed) return
        const data = response.data
        if (data) {
          setStatus(data.status)
          setError(data.error || '')
          setRawFile(typeof data.result?.raw_edit_file_id === 'string' ? data.result.raw_edit_file_id : undefined)
          if (typeof data.result?.source_file_id === 'string') setSource(data.result.source_file_id)
          if (data.status === 'succeeded' && typeof data.result?.file_id === 'string') setResultFile(data.result.file_id)
          if (terminal.has(data.status)) { setCancelling(false); return }
        }
      } catch (e) { if (!disposed) setError(`读取任务失败，将继续查询：${String(e)}`) }
      if (!disposed) timer = setTimeout(poll, 10000)
    }
    void poll()
    return () => { disposed = true; clearTimeout(timer) }
  }, [open, taskId, pollRevision])

  /** Keep the same nonce for an uncertain POST response; only explicit new content changes it. */
  const changed = () => { requestId.current = crypto.randomUUID(); setConsent(false); setCheckSummary('') }
  /** Probe local files without transferring media or creating a generation task. */
  const preflight = async (apply = true) => {
    if (!modelId || !source) throw new Error('请先选择模型和原视频')
    const r = await StudioGenerationTasksService.preflightVideoEditApiV1StudioGenerationTasksShotsShotIdVideoEditPreflightPost({ shotId, requestBody: {
      model_id: modelId, options: { resolution, seconds }, keep_audio: keepAudio, expected_revision_id: selectedModel?.revision_id,
      media: { source: { file_id: source, media_kind: 'video', ordinal: 0 }, references: references.map((file_id, ordinal) => ({ file_id, media_kind: 'image', ordinal })) },
      reference_positions: runway ? references.map(id => positions[id] || 0) : [],
    } })
    if (!r.data) throw new Error('检查未返回有效结果')
    if (apply) setPreview(r.data)
    if (apply) setCheckSummary(`本地检查通过：${r.data.seconds} 秒，${r.data.width}×${r.data.height}；仅验证输入规格，不保证内容质量或账号额度。`)
    return r.data
  }
  useEffect(() => {
    setPreview(undefined); setEstimateError('')
    if (!open || !modelId || !source || !selectedModel?.available || active) return
    let disposed = false
    setEstimating(true)
    const timer = setTimeout(() => {
      preflight(false).then(data => { if (!disposed) setPreview(data) })
        .catch(e => { if (!disposed) setEstimateError(String(e)) })
        .finally(() => { if (!disposed) setEstimating(false) })
    }, 500)
    return () => { disposed = true; clearTimeout(timer); setEstimating(false) }
  }, [open, modelId, selectedModel?.revision_id, source, resolution, seconds, references, positions, keepAudio, active])

  /** Recheck the exact model revision and require confirmation before the single paid submission. */
  const submit = async () => {
    if (!modelId || !source || !prompt.trim() || !consent) return
    if (!creativePreview.prompt || creativePreview.error) return message.warning(creativePreview.error || "请等待当前创作设定预览完成")
    setSubmitting(true); setError(''); setResultFile(undefined)
    try {
      const checked = await preflight()
      const accepted = await new Promise<boolean>(resolve => Modal.confirm({
        title: '确认编辑参数与费用',
        content: <Space direction="vertical"><span>{selectedModel?.provider_name} / {selectedModel?.model_name}</span>
          <span>分辨率：{checked.options.resolution || '沿用编辑接口规格'}；输出：{checked.options.seconds || checked.seconds} 秒</span>
          <span>预计：{checked.estimate.amount ? checked.estimate.amount + ' ' + checked.estimate.currency : '未知（不代表免费）'}</span>
          <span>{checked.estimate.note}</span>{checked.warnings?.map(w => <span key={w}>{w}</span>)}</Space>,
        okText: '确认并生成', cancelText: '返回修改', onOk: () => { resolve(true) }, onCancel: () => { resolve(false) },
      }))
      if (!accepted) return
      const response = await StudioGenerationTasksService.submitShotVideoEditTaskApiV1StudioGenerationTasksShotsShotIdVideoEditsPost({ shotId,
        requestBody: { model_id: modelId, expected_model_revision_id: checked.revision_id, execution_prompt: creativePreview.prompt,
          media: { source: { file_id: source, media_kind: 'video', ordinal: 0 }, references: references.map((file_id, ordinal) => ({ file_id, media_kind: 'image', ordinal })) },
          operation_input: { kind: 'video_edit', client_request_id: requestId.current, preserve_instructions: preserve,
            resolution: checked.options.resolution, seconds: checked.options.seconds,
            keep_audio: keepAudio, reference_positions: runway ? references.map(id => positions[id] || 0) : [], external_transfer_confirmed: true, billing_confirmed: true } } })
      if (!response.data?.task_id) throw new Error('未返回任务 ID，请勿改变请求重复提交')
      setTaskId(response.data.task_id); setStatus('pending')
      window.dispatchEvent(new CustomEvent('jellyfish:task-accepted',{detail:{taskId:response.data.task_id,title:'视频编辑'}}))
      setPollRevision(v => v + 1)
    } catch (e) { setError(String(e)) } finally { setSubmitting(false) }
  }

  /** Freeze the original clip and preserve instructions; web edits are never auto-adopted. */
  const prepareWebEdit = async () => {
    if (!source || !creativePreview.prompt || creativePreview.error) throw new Error(creativePreview.error || '请选择原视频并填写编辑要求')
    const entityId=shotId,original=source,text=creativePreview.prompt,refs=[...references],preservation=preserve,audio=keepAudio
    const metadata=(await StudioFilesService.getFileDetailApiV1StudioFilesFileIdGet({fileId:original})).data
    if(!metadata?.duration_ms||!metadata.width||!metadata.height)throw new Error('原视频缺少时长或尺寸信息，请先在文件管理核对')
    const gcd=(a:number,b:number):number=>b?gcd(b,a%b):a
    const divisor=gcd(metadata.width,metadata.height)
    const aspect=`${metadata.width/divisor}:${metadata.height/divisor}`
    const target=await Web.targetApiV1StudioWebGenerationTargetsTargetTypeEntityIdSlotIdGet({targetType:'shot_edit',entityId,slotId:1})
    return {target_type:'shot_edit' as const,entity_id:entityId,expected_version:target.version,source_video_file_id:original,prompt:text,reference_file_ids:refs,preserve_instructions:preservation,keep_audio:audio,duration_seconds:seconds||Math.round(metadata.duration_ms/1000),aspect_ratio:aspect,reference_mode:refs.length?'reference_images' as const:'text' as const}
  }
  return <>
    <Button size="small" onClick={() => setOpen(true)}>文字编辑视频</Button>
    <Modal title="编辑已有视频 · 生成新版本后再采用" open={open} onCancel={() => { setOpen(false); setPicker(undefined) }} footer={null} width={1000} styles={{ body: { maxHeight: '75vh', overflowY: 'auto' } }}>
      <BackgroundTaskNotice active={active} />
      <Alert type="info" showIcon message="编辑并非逐像素修补；先比较新旧结果，原文件始终保留。" />
      {historyTotal > 0 && <details className="my-3"><summary>编辑历史（{historyTotal}）· 关闭或重新进入后仍可查询</summary>
        {history.map(item => <Button key={item.id} block disabled={locked} onClick={() => { setTaskId(item.task_id); setStatus('pending'); setResultFile(undefined); setError('') }}>{item.task_id} · {item.status === 'accepted' ? '曾采用' : '查看任务/结果'}</Button>)}
        <Pagination current={historyPage} total={historyTotal} pageSize={10} showSizeChanger={false} onChange={setHistoryPage} />
      </details>}
      {modelsError && <Alert className="my-3" type="error" message="编辑模型加载失败" description={modelsError} />}
      {!modelsLoading && !modelsError && !models.some(m => m.available) && <Alert className="my-3" type="warning" message="尚未配置可用编辑模型" description="下方列出当前型号不可用的原因及已接通的编辑型号。配置后点击刷新；普通视频生成模型不能替代编辑模型。" />}
      <Space className="my-3"><Button loading={modelsLoading} disabled={locked} onClick={() => setCatalogRevision(v => v + 1)}>刷新编辑模型</Button>
        <a href="/models" target="_blank" rel="noreferrer">打开模型管理配置</a></Space>
      <details className="mb-3"><summary>查看已配置型号状态与可添加的编辑型号</summary>
        {models.map(m => <p key={m.model_id}>{m.provider_name} / {m.model_name}：{m.available ? '已接通，可选择；账号权限需实际验证' : m.reason} {m.source_url && <a href={m.source_url} target="_blank" rel="noreferrer">官方依据</a>}</p>)}
        {candidates.map(c => <p key={c.provider + c.model_name}><a href={c.source_url} target="_blank" rel="noreferrer">{c.provider} / {c.model_name}</a>：{c.requirements}</p>)}
      </details>
      <div className="my-3 grid grid-cols-1 md:grid-cols-2 gap-3">
        <section><h4>原视频（不会被删除）</h4>{source && <video controls src={buildFileDownloadUrl(source)} className="w-full max-h-64 bg-black" />}
          <Button disabled={locked} onClick={() => { setPicker('video') }}>从素材库选择原视频</Button>
        </section>
        <section><h4>编辑结果（尚未自动采用）</h4>{resultFile ? <video controls src={buildFileDownloadUrl(resultFile)} className="w-full max-h-64 bg-black" /> : <p>任务完成后在此展示新版本，可随时关闭窗口。</p>}
          {resultFile && <Button loading={adopting} onClick={() => Modal.confirm({ title: '采用此编辑结果？', content: '当前镜头将使用新版本，原文件仍保留。', onOk: async () => {
            setAdopting(true)
            try { await StudioGenerationTasksService.adoptShotVideoEditApiV1StudioGenerationTasksShotsShotIdVideoEditsTaskIdAdoptPost({ shotId, taskId: taskId!, requestBody: { expected_current_file_id: currentFileId } }); await onAdopted(); message.success('已采用编辑结果') }
            finally { setAdopting(false) }
          } })}>比较后采用</Button>}
        </section>
      </div>
      <Space direction="vertical" className="w-full" size="middle">
        <Select aria-label="编辑模型" placeholder="选择已配置的编辑模型" className="w-full" loading={modelsLoading} value={modelId} disabled={locked || modelsLoading}
          onChange={v => { const m = models.find(item => item.model_id === v); setModelId(v); setResolution(m?.default_resolution || undefined); setSeconds(m?.default_seconds || undefined); changed() }}
          virtual={false}
          options={models.map(m => ({ value: m.model_id, disabled: !m.available,
            label: <div style={{ whiteSpace: 'normal', overflowWrap: 'anywhere', padding: '4px 0' }}>
              <div>{m.provider_name} / {m.model_name}</div>
              {!m.available && <div style={{ color: '#595959', fontSize: 12, marginTop: 4 }}>{m.reason}</div>}
            </div> }))} />
        {selectedModel && <section aria-label="编辑参数与费用" className="rounded border border-blue-100 bg-blue-50 p-3">
          <Space wrap>
            <label>编辑分辨率 <Select aria-label="编辑分辨率" style={{ minWidth: 140 }} disabled={locked || !selectedModel.resolutions?.length} value={resolution}
              placeholder="沿用接口规格" options={selectedModel.resolutions?.map(v => ({ value: v, label: v }))} onChange={v => { setResolution(v); changed() }} /></label>
            {Boolean(selectedModel.durations?.length) ? <label>输出时长 <Select aria-label="编辑输出时长" style={{ minWidth: 100 }} disabled={locked} value={seconds}
              options={selectedModel.durations?.map(v => ({ value: v, label: v + ' 秒' }))} onChange={v => { setSeconds(v); changed() }} /></label> : <span>输出比例与时长：按原视频及编辑接口规则保持</span>}
          </Space>
          <p>{selectedModel.instructions}</p>
          {estimateError && <Alert type="warning" message={estimateError} />}
          {estimating && <span>正在读取原片并计算费用…</span>}
          <p>费用估算：{preview?.estimate.amount ? preview.estimate.amount + ' ' + preview.estimate.currency : preview ? '当前价格未知（不代表免费）' : '按原片实际时长免费计算中'}</p>
          {preview && <><p>{preview.estimate.note}</p><a href={preview.estimate.source} target="_blank" rel="noreferrer">官方计费依据</a>{preview.warnings?.map(w => <p key={w}>{w}</p>)}</>}
        </section>}
        <CreativePromptPreview result={creativePreview} />
        <Input.TextArea aria-label="修改要求" rows={3} value={prompt} disabled={locked} onChange={e => { setPrompt(e.target.value); changed() }} placeholder={selectedModel ? '描述修改要求，原片标记：' + selectedModel.source_label + '。图片标记见下方，可点击插入。' : '请先选择编辑模型'} />
        <Input.TextArea aria-label="保持不变的内容" rows={2} value={preserve} disabled={locked} onChange={e => { setPreserve(e.target.value); changed() }} placeholder="希望保持的内容，例如角色外观、机位、其他动作。不能保证其他像素完全不变。" />
        <Space wrap><Button disabled={locked || references.length >= maxImages} onClick={() => { setPicker('image') }}>从素材库选择参考图</Button>
          <Upload showUploadList={false} disabled={locked} accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,.txt,.md" beforeUpload={async file => {
            try {
              if (/\.(txt|md)$/i.test(file.name)) {
                if (file.size > 1024 * 1024) throw new Error('说明文档请控制在 1MB 内')
                const text = await file.text(); setPrompt(p => `${p}\n${text}`.trim()); changed(); return false
              }
              if (file.type.startsWith('image/') && references.length >= maxImages) throw new Error(`当前模型最多 ${maxImages} 张参考图`)
              // Generated multipart schema uses string for binary; runtime accepts Blob unchanged.
              const r = await StudioFilesService.uploadFileApiApiV1StudioFilesUploadPost({ formData: { file: file as unknown as string } })
              if (!r.data?.id) throw new Error('上传未返回文件 ID')
              if (file.type.startsWith('video/')) setSource(r.data.id)
              else if (file.type.startsWith('image/')) setReferences(prev => [...prev, r.data!.id])
              else throw new Error('此文件类型不能用于编辑')
              changed()
            } catch (e) { setError(String(e)) }
            return false
          }}><Button disabled={locked}>上传视频/参考图/说明 TXT、MD</Button></Upload>
        </Space>
        <Space wrap><Button disabled={locked || !selectedModel} onClick={() => { setPrompt(v => v + ' ' + selectedModel?.source_label); changed() }}>插入原视频标记</Button><span>调整排序会改变图片编号，请核对提示词中的引用。</span></Space>
        <div className="flex gap-3 flex-wrap">{references.map((id, i) => <div key={id} className="rounded border p-2">
          <PreviewImage src={buildFileDownloadUrl(id)} alt={'参考图 ' + (i + 1)} className="h-24 w-24 object-contain" />
          <Button size="small" disabled={locked || !selectedModel} onClick={() => { setPrompt(v => v + ' ' + selectedModel?.image_label?.replace('{n}', String(i + 1))); changed() }}>{selectedModel?.image_label?.replace('{n}', String(i + 1)) || '参考图' + (i + 1)}</Button>
          {runway && <label>指导时间（秒）<InputNumber min={0} value={positions[id] || 0} disabled={locked} onChange={v => { setPositions(p => ({ ...p, [id]: v || 0 })); changed() }} /></label>}
          <Space><Button aria-label={'上移参考图' + (i + 1)} size="small" disabled={locked || i === 0} onClick={() => { const next = [...references]; [next[i-1],next[i]] = [next[i],next[i-1]]; setReferences(next); changed() }}>上移</Button>
            <Button aria-label={'下移参考图' + (i + 1)} size="small" disabled={locked || i === references.length - 1} onClick={() => { const next = [...references]; [next[i],next[i+1]] = [next[i+1],next[i]]; setReferences(next); changed() }}>下移</Button>
            <Button size="small" disabled={locked} onClick={() => { setReferences(references.filter(v => v !== id)); changed() }}>移除</Button></Space>
        </div>)}</div>
        <Checkbox checked={keepAudio} disabled={locked} onChange={e => { setKeepAudio(e.target.checked); changed() }}>要求保留原视频音轨</Checkbox>
        {selectedModel && <Alert type="info" message={selectedModel.instructions} />}
        <Checkbox checked={consent} disabled={locked} onChange={e => setConsent(e.target.checked)}>我确认将所选视频、图片与说明发送给 {selectedModel?.provider_name || '所选供应商'}，并接受该服务的 API 费用；取消不保证停止计费。</Checkbox>
        {error && <Alert type="error" message={error} />}
        {status === 'failed' && rawFile && <Alert type="warning" message={<span>供应商原始结果已保留，但音轨合成等后处理未完成，未采用。<a href={buildFileDownloadUrl(rawFile)} target="_blank" rel="noreferrer">检查原始编辑结果</a>，不要因后处理失败重复付费生成。</span>} />}
        {checkSummary && <Alert type="success" message={checkSummary} />}
        <Button loading={checking} disabled={active || submitting || !source || !modelId} onClick={async () => {
          setChecking(true); setError(''); setCheckSummary('')
          try { await preflight() } catch (e) { setError(String(e)) } finally { setChecking(false) }
        }}>免费检查输入规格（不外发）</Button>
        {references.length > maxImages && <Alert type="error" message={`所选模型最多支持 ${maxImages} 张图片，请移除多余图片。`} />}
        <Space><GenerationChannelActions webAction={<WebHandoffButton prepare={prepareWebEdit} disabled={locked||!source||!prompt.trim()}/> } apiAction={<Button type="primary" loading={submitting} disabled={active || checking || references.length > maxImages || !selectedModel?.available || !modelId || !source || !prompt.trim() || !consent} onClick={() => void submit()}>生成编辑版本</Button>}/>
          {taskId && terminal.has(status) && <Button onClick={() => { setTaskId(undefined); setStatus(''); setResultFile(undefined); setError(''); changed() }}>新建一次编辑（需重新确认费用）</Button>}
          {active && <Button loading={cancelling} onClick={async () => { setCancelling(true); try { await FilmService.cancelTaskApiV1FilmTasksTaskIdCancelPost({ taskId: taskId!, requestBody: {} }) } catch (e) { setError(String(e)); setCancelling(false) } }}>取消任务</Button>}
          <span>{({ pending: '等待中', running: '进行中', succeeded: '已完成', failed: '失败', cancelled: '已取消' } as Record<string, string>)[status] || status}</span>
        </Space>
      </Space>
    </Modal>
    {picker && open && <MediaFilePicker key={picker} kind={picker}
      selectedIds={picker === 'video' ? [source] : references}
      disabled={locked || (picker === 'image' && references.length >= maxImages)}
      onClose={() => setPicker(undefined)} onSelect={file => {
        if (locked) return
        if (picker === 'video') setSource(file.id)
        else setReferences(prev => Array.from(new Set([...prev, file.id])).slice(0, maxImages))
        changed(); setPicker(undefined)
      }} />}
  </>
}
