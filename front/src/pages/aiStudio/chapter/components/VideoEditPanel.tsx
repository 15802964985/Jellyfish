import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Checkbox, Input, InputNumber, Modal, Pagination, Select, Space, Upload, message } from 'antd'
import { FilmService, LlmService, StudioFilesService, StudioGenerationTasksService } from '../../../../services/generated'
import type { FileRead, ModelRead, ProviderRead, GenerationTaskLinkRead } from '../../../../services/generated'
import { loadAllPaginated } from '../../../../services/loadAllPaginated'
import { buildFileDownloadUrl } from '../../assets/utils'

const FAL_MODEL = 'fal-ai/kling-video/o3/pro/video-to-video/edit'
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
  const [preserve, setPreserve] = useState('')
  const [keepAudio, setKeepAudio] = useState(true)
  const [consent, setConsent] = useState(false)
  const [models, setModels] = useState<ModelRead[]>([])
  const [modelId, setModelId] = useState<string>()
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
  const [checkSummary, setCheckSummary] = useState('')
  const [picker, setPicker] = useState<'image' | 'video'>()
  const [files, setFiles] = useState<FileRead[]>([])
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState('')
  const [total, setTotal] = useState(0)
  const [history, setHistory] = useState<GenerationTaskLinkRead[]>([])
  const [historyPage, setHistoryPage] = useState(1)
  const [historyTotal, setHistoryTotal] = useState(0)
  const requestId = useRef(crypto.randomUUID())
  const active = Boolean(taskId && !terminal.has(status))
  const locked = active || submitting || checking
  const runway = models.find(m => m.id === modelId)?.name === 'aleph2'
  const maxImages = runway ? 5 : 4

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
    Promise.all([
      loadAllPaginated<ModelRead>((page, pageSize) => LlmService.listModelsApiV1LlmModelsGet({ category: 'video', page, pageSize })),
      loadAllPaginated<ProviderRead>((page, pageSize) => LlmService.listProvidersApiV1LlmProvidersGet({ page, pageSize })),
    ]).then(([items, providers]) => {
      if (disposed) return
      const byId = new Map(providers.map(p => [p.id, p]))
      setModels(items.filter(m => {
        const p = byId.get(m.provider_id)
        const key = p?.adapter_key || p?.name.toLowerCase()
        return p?.status !== 'disabled' && ((['fal', 'fal.ai'].includes(key || '') && m.name === FAL_MODEL) || (key === 'runway' && m.name === 'aleph2'))
      }))
    }).catch(e => { if (!disposed) setError(String(e)) })
    return () => { disposed = true }
  }, [open])

  useEffect(() => {
    if (!picker) return
    let disposed = false
    const timer = window.setTimeout(() => {
      StudioFilesService.listFilesApiApiV1StudioFilesGet({ fileType: picker, q: query, page, pageSize: 12 }).then(r => {
        if (disposed) return
        setFiles(r.data?.items || []); setTotal(r.data?.pagination.total || 0)
      }).catch(e => { if (!disposed) setError(String(e)) })
    }, 250)
    return () => { disposed = true; window.clearTimeout(timer) }
  }, [picker, page, query])

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
  const preflight = async () => {
    if (!modelId || !source) throw new Error('请先选择模型和原视频')
    const r = await StudioGenerationTasksService.preflightVideoEditApiV1StudioGenerationTasksShotsShotIdVideoEditPreflightPost({ shotId, requestBody: {
      model_id: modelId, media: { source: { file_id: source, media_kind: 'video', ordinal: 0 }, references: references.map((file_id, ordinal) => ({ file_id, media_kind: 'image', ordinal })) },
      reference_positions: runway ? references.map(id => positions[id] || 0) : [],
    } })
    setCheckSummary(`本地检查通过：${r.data?.seconds} 秒，${r.data?.width}×${r.data?.height}；仅验证输入规格，不保证内容质量或账号额度。`)
  }
  const submit = async () => {
    if (!modelId || !source || !prompt.trim() || !consent) return
    setSubmitting(true); setError(''); setResultFile(undefined)
    try {
      await preflight()
      const response = await StudioGenerationTasksService.submitShotVideoEditTaskApiV1StudioGenerationTasksShotsShotIdVideoEditsPost({ shotId,
        requestBody: { model_id: modelId, execution_prompt: prompt,
          media: { source: { file_id: source, media_kind: 'video', ordinal: 0 }, references: references.map((file_id, ordinal) => ({ file_id, media_kind: 'image', ordinal })) },
          operation_input: { kind: 'video_edit', client_request_id: requestId.current, preserve_instructions: preserve,
            keep_audio: keepAudio, reference_positions: runway ? references.map(id => positions[id] || 0) : [], external_transfer_confirmed: true, billing_confirmed: true } } })
      if (!response.data?.task_id) throw new Error('未返回任务 ID，请勿改变请求重复提交')
      setTaskId(response.data.task_id); setStatus('pending')
      setPollRevision(v => v + 1)
    } catch (e) { setError(String(e)) } finally { setSubmitting(false) }
  }

  return <>
    <Button size="small" onClick={() => setOpen(true)}>文字编辑视频</Button>
    <Modal title="编辑已有视频 · 生成新版本后再采用" open={open} onCancel={() => setOpen(false)} footer={null} width={1000} styles={{ body: { maxHeight: '75vh', overflowY: 'auto' } }}>
      <Alert type="info" showIcon message="编辑并非逐像素修补；先比较新旧结果，原文件始终保留。" />
      {historyTotal > 0 && <details className="my-3"><summary>编辑历史（{historyTotal}）· 关闭或重新进入后仍可查询</summary>
        {history.map(item => <Button key={item.id} block disabled={locked} onClick={() => { setTaskId(item.task_id); setStatus('pending'); setResultFile(undefined); setError('') }}>{item.task_id} · {item.status === 'accepted' ? '曾采用' : '查看任务/结果'}</Button>)}
        <Pagination current={historyPage} total={historyTotal} pageSize={10} showSizeChanger={false} onChange={setHistoryPage} />
      </details>}
      {!models.length && <Alert className="my-3" type="warning" message="尚无可用编辑模型" description={<>
        在模型管理新增 fal.ai（视频编辑）供应商，Base URL 填 https://queue.fal.run，使用独立 API Key，添加 Kling O3 编辑型号。可灵会员和百炼额度不能用于此服务。
        <a href="https://fal.ai/models/fal-ai/kling-video/o3/pro/video-to-video/edit/api" target="_blank" rel="noreferrer">查看官方配置与价格入口</a>，购买前确认 API 余额和地区可用性。
        也可新增 Runway（视频编辑），Base URL 为 https://api.dev.runwayml.com，添加 aleph2。<a href="https://docs.dev.runwayml.com/guides/models/" target="_blank" rel="noreferrer">Runway Dev 官方说明</a>；网页会员不等于 API 余额。
      </>} />}
      <div className="my-3 grid grid-cols-1 md:grid-cols-2 gap-3">
        <section><h4>原视频（不会被删除）</h4>{source && <video controls src={buildFileDownloadUrl(source)} className="w-full max-h-64 bg-black" />}
          <Button disabled={locked} onClick={() => { setPicker('video'); setPage(1); setQuery('') }}>从素材库选择原视频</Button>
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
        <Select aria-label="编辑模型" placeholder="选择编辑模型" className="w-full" value={modelId} disabled={locked} onChange={v => { setModelId(v); changed() }} options={models.map(m => ({ value: m.id, label: m.name }))} />
        <Input.TextArea aria-label="修改要求" rows={3} value={prompt} disabled={locked} onChange={e => { setPrompt(e.target.value); changed() }} placeholder={runway ? '描述原视频需要修改的内容；下方图片按指定秒数指导画面。' : '描述要修改的内容。@Video1 代表原视频，@Image1 等代表下方参考图片。'} />
        <Input.TextArea aria-label="保持不变的内容" rows={2} value={preserve} disabled={locked} onChange={e => { setPreserve(e.target.value); changed() }} placeholder="希望保持的内容，例如角色外观、机位、其他动作。不能保证其他像素完全不变。" />
        <Space wrap><Button disabled={locked || references.length >= maxImages} onClick={() => { setPicker('image'); setPage(1); setQuery('') }}>从素材库选择参考图</Button>
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
        <div className="flex gap-3 flex-wrap">{references.map((id, i) => <div key={id}><img src={buildFileDownloadUrl(id)} alt={`参考图 ${i + 1}`} className="h-24 w-24 object-contain" />{runway && <label>指导时间（秒）<InputNumber min={0} value={positions[id] || 0} disabled={locked} onChange={v => { setPositions(p => ({ ...p, [id]: v || 0 })); changed() }} /></label>}<Button disabled={locked} onClick={() => { setReferences(references.filter(v => v !== id)); changed() }}>移除参考图 {i + 1}</Button></div>)}</div>
        <Checkbox checked={keepAudio} disabled={locked} onChange={e => { setKeepAudio(e.target.checked); changed() }}>要求保留原视频音轨</Checkbox>
        <Alert type="warning" message={runway ? 'Runway Aleph 2：MP4/MOV、2–30 秒、最高1080p、30FPS；当前直传每个文件编码后最多5MB。参考图须指定时间，原音轨通过本地重新合成保留。不自动裁剪。' : 'Kling O3：MP4/MOV、3–15 秒、720–3840px、200MB 内；最多四张参考图片。超限拒绝，不自动裁剪。'} />
        <Checkbox checked={consent} disabled={locked} onChange={e => setConsent(e.target.checked)}>我确认将所选视频、图片与说明发送给 {runway ? 'Runway Dev' : 'fal.ai'}，并接受该服务的 API 费用；取消不保证停止计费。</Checkbox>
        {error && <Alert type="error" message={error} />}
        {status === 'failed' && rawFile && <Alert type="warning" message={<span>供应商原始结果已保留，但音轨合成等后处理未完成，未采用。<a href={buildFileDownloadUrl(rawFile)} target="_blank" rel="noreferrer">检查原始编辑结果</a>，不要因后处理失败重复付费生成。</span>} />}
        {checkSummary && <Alert type="success" message={checkSummary} />}
        <Button loading={checking} disabled={active || submitting || !source || !modelId} onClick={async () => {
          setChecking(true); setError(''); setCheckSummary('')
          try { await preflight() } catch (e) { setError(String(e)) } finally { setChecking(false) }
        }}>免费检查输入规格（不外发）</Button>
        {references.length > maxImages && <Alert type="error" message={`所选模型最多支持 ${maxImages} 张图片，请移除多余图片。`} />}
        <Space><Button type="primary" loading={submitting} disabled={active || references.length > maxImages || !modelId || !source || !prompt.trim() || !consent} onClick={() => void submit()}>生成编辑版本</Button>
          {taskId && terminal.has(status) && <Button onClick={() => { setTaskId(undefined); setStatus(''); setResultFile(undefined); setError(''); changed() }}>新建一次编辑（需重新确认费用）</Button>}
          {active && <Button loading={cancelling} onClick={async () => { setCancelling(true); try { await FilmService.cancelTaskApiV1FilmTasksTaskIdCancelPost({ taskId: taskId!, requestBody: {} }) } catch (e) { setError(String(e)); setCancelling(false) } }}>取消任务</Button>}
          <span>{({ pending: '等待中', running: '进行中', succeeded: '已完成', failed: '失败', cancelled: '已取消' } as Record<string, string>)[status] || status}</span>
        </Space>
      </Space>
    </Modal>
    <Modal title={picker === 'video' ? '选择原视频' : '选择参考图片'} open={Boolean(picker)} onCancel={() => setPicker(undefined)} footer={<Pagination current={page} total={total} pageSize={12} showSizeChanger={false} onChange={setPage} />}>
      <Input.Search placeholder="搜索文件名" onSearch={v => { setQuery(v); setPage(1) }} />
      <div className="max-h-80 overflow-y-auto">{files.map(file => <Button key={file.id} block className="my-2" onClick={() => {
        if (picker === 'video') setSource(file.id)
        else setReferences(prev => Array.from(new Set([...prev, file.id])).slice(0, maxImages))
        changed(); setPicker(undefined)
      }}>{file.name}</Button>)}</div>
    </Modal>
  </>
}
