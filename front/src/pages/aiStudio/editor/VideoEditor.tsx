import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Button, Card, Empty, Input, InputNumber, Modal, Progress, Select, Space, Switch, Tag, message } from 'antd'
import { Link, useParams } from 'react-router-dom'
import { FilmService, OpenAPI, StudioTimelineService, type ProjectEditPlan, type ProjectEditRead, type ProjectTimelineRead, type EditVideoClip, type FileRead } from '../../../services/generated'
import { MediaFilePicker } from '../files/MediaFilePicker'
import { PreviewImage } from '../../../components/PreviewImage'
import './video-editor.css'
import { EditVisualReviewPanel } from './EditVisualReviewPanel'
import { AudioWaveformClip } from './AudioWaveformClip'

/** 统一素材地址，源片监看和最终成片均使用实际文件。 */
function media(fileId: string, action = 'preview') {
  return `${String(OpenAPI.BASE || '').replace(/\/$/, '')}/api/v1/studio/files/${encodeURIComponent(fileId)}/${action}`
}
/** 精确展示剪辑时间，保留毫秒而非按整秒舍入。 */
function time(seconds: number) { return `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(2).padStart(5, '0')}` }
/** 提示后端的可操作冲突原因，未知异常保留默认说明。 */
function errorText(error: unknown) {
  const detail = (error as { body?: { detail?: unknown } })?.body?.detail
  return typeof detail === 'string' ? detail : '操作失败，请重试；当前草稿仍保留。'
}
/** 可复用秒数编辑控件，避免入出点和音轨使用不同单位。 */
function Seconds({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label className="ve-field"><span>{label}（秒）</span><InputNumber aria-label={label} min={0} max={86400} step={0.04} precision={3} value={value} onChange={v => v != null && onChange(v)} /></label>
}
/** 连续主视频轨、多轨声音和字幕的非破坏性剪辑工作台。 */
export default function VideoEditor() {
  const { projectId = '' } = useParams()
  const [record, setRecord] = useState<ProjectEditRead | null>(null)
  const [timeline, setTimeline] = useState<ProjectTimelineRead | null>(null)
  const [plan, setPlan] = useState<ProjectEditPlan | null>(null)
  const [history, setHistory] = useState<ProjectEditPlan[]>([])
  const [future, setFuture] = useState<ProjectEditPlan[]>([])
  const [selected, setSelected] = useState('')
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [picker, setPicker] = useState(false)
  const [includeSubtitles, setIncludeSubtitles] = useState(true)
  const [taskId, setTaskId] = useState('')
  const [progress, setProgress] = useState(0)
  const [exportFile, setExportFile] = useState('')
  const [exportRevision, setExportRevision] = useState<number | null>(null)
  const [compare, setCompare] = useState(false)
  const [playerError, setPlayerError] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const submitLock = useRef(false)
  const draftRef = useRef(plan)
  draftRef.current = plan

  /** 只在主动加载时替换工程，轮询不能覆盖尚未保存的剪辑。 */
  const load = useCallback(async () => {
    setBusy(true); setLoadError('')
    try {
      const [edit, source] = await Promise.all([
        StudioTimelineService.getProjectEditApiV1StudioTimelineProjectsProjectIdEditGet({ projectId }),
        StudioTimelineService.getProjectTimelineApiV1StudioTimelineProjectsProjectIdGet({ projectId }),
      ])
      if (!edit.data) throw new Error('empty')
      setRecord(edit.data); setPlan(edit.data.plan); setTimeline(source.data || null)
      setSelected(edit.data.plan.clips?.[0]?.id || ''); setDirty(false); setHistory([]); setFuture([])
      setExportFile(source.data?.latest_export_file_id || '')
    } catch (error) { setLoadError(errorText(error)) } finally { setBusy(false) }
  }, [projectId])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    /** 离开页面前提醒保存；不会把浏览器缓存当作工程持久化。 */
    const warn = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  useEffect(() => {
    if (!taskId) return
    let disposed = false
    let timer: ReturnType<typeof setTimeout>
    /** 导出轮询只更新产物，不刷新和覆盖剪辑草稿。 */
    const poll = async () => {
      try {
        const response = await FilmService.getTaskResultApiV1FilmTasksTaskIdResultGet({ taskId })
        if (disposed) return
        const task = response.data
        setProgress(Number(task?.progress || 0))
        if (task?.status === 'succeeded') {
          const result = task.result as { file_id?: string; edit_revision?: number } | undefined
          setExportFile(result?.file_id || ''); setExportRevision(result?.edit_revision || null); setTaskId('')
          message.success('成片已完成，可播放核对混音、字幕和镜头衔接'); return
        }
        if (task?.status === 'failed' || task?.status === 'cancelled') {
          message.error(task.error || '导出未完成，可到任务中心查看'); setTaskId(''); return
        }
      } catch { /* 网络短暂异常不创建重复导出任务，继续查询原任务。 */ }
      if (!disposed) timer = setTimeout(poll, 5000)
    }
    void poll()
    return () => { disposed = true; clearTimeout(timer) }
  }, [taskId])

  /** 记录有限撤销历史；改变内容会清除整段的旧审片结论。 */
  const change = (next: ProjectEditPlan, affectsReview = true) => {
    if (!plan) return
    setHistory(values => [...values.slice(-29), plan]); setFuture([])
    setPlan(affectsReview ? { ...next, clips: next.clips?.map((c, i) => ({ ...c, review: 'unchecked', transition: i === next.clips!.length - 1 ? 'cut' : c.transition || 'cut' })) } : next)
    setDirty(true)
  }
  const clips = plan?.clips || []
  const audio = plan?.audio || []
  const subtitles = plan?.subtitles || []
  const selectedIndex = clips.findIndex(c => c.id === selected)
  const clip = clips[selectedIndex]
  const previous = clips[selectedIndex - 1]
  useEffect(() => {
    setPlayerError(false)
    const player = videoRef.current
    if (player && clip) { player.volume = Math.min(1, clip.volume ?? 1); player.currentTime = clip.in_seconds || 0 }
  }, [clip?.id, clip?.in_seconds, clip?.volume])
  const duration = clips.reduce((sum, c, index) => sum + Math.max(0, c.out_seconds - (c.in_seconds || 0)) - (index < clips.length - 1 && c.transition && c.transition !== 'cut' ? c.transition_seconds || .4 : 0), 0)
  const missing = Math.max(0, (timeline?.total_shots || 0) - new Set(clips.map(c => c.shot_id)).size)
  const unchecked = clips.filter(c => c.review !== 'approved').length
  const current = timeline?.clips?.find(c => c.shot_id === clip?.shot_id)

  /** 修改当前片段只影响工程，源视频和分镜版本保持独立。 */
  const updateClip = (patch: Partial<EditVideoClip>, reviewOnly = false) => {
    if (plan && clip) change({ ...plan, clips: clips.map(c => c.id === clip.id ? { ...c, ...patch } : c) }, !reviewOnly)
  }
  /** 明确重新排序后保留各片段入出点；绝对时间音频/字幕需复核。 */
  const move = (offset: number) => {
    if (!plan || selectedIndex + offset < 0 || selectedIndex + offset >= clips.length) return
    const next = [...clips]; [next[selectedIndex], next[selectedIndex + offset]] = [next[selectedIndex + offset], next[selectedIndex]]
    change({ ...plan, clips: next })
  }
  /** 服务端返回规范化后的工程和修订号，冲突时不清除草稿。 */
  const save = async () => {
    if (!plan || !record || submitLock.current) return
    submitLock.current = true; setBusy(true)
    try {
      const response = await StudioTimelineService.putProjectEditApiV1StudioTimelineProjectsProjectIdEditPut({ projectId,
        requestBody: { expected_revision: record.revision, plan } })
      if (response.data) { setRecord(response.data); if (draftRef.current === plan) { setPlan(response.data.plan); setDirty(false) }; message.success(draftRef.current === plan ? '剪辑工程已保存' : '已保存提交时的工程，后续修改仍待保存') }
    } catch (error) { message.error(errorText(error)) } finally { setBusy(false); submitLock.current = false }
  }
  /** 每次导出锁定已保存修订，缺片与未复核项在创建任务前显式确认。 */
  const exportVideo = () => {
    if (dirty || !record?.revision || !clips.length) { message.info('请先保存当前剪辑工程'); return }
    Modal.confirm({ title: '合成预览并导出 MP4', content: <div>
      <p>使用已保存工程 v{record.revision}，时长 {time(duration)}。本地编码，不调用付费模型。</p>
      {missing > 0 && <p>有 {missing} 个镜头未纳入工程，继续将导出不完整版本。</p>}
      {unchecked > 0 && <p>有 {unchecked} 个片段未通过人工复核，请确认人物、服装、道具、声音与前后衔接。</p>}
      <p>字幕按当前校时时间生成可开关字幕轨；部分浏览器不显示 MP4 内嵌字幕，可下载后查看。</p>
    </div>, okText: missing ? '确认跳过缺片并导出' : '开始合成', onOk: async () => {
      if (submitLock.current) return
      submitLock.current = true; setBusy(true)
      try {
        const response = await StudioTimelineService.exportProjectVideoApiV1StudioTimelineProjectsProjectIdExportsPost({ projectId,
          requestBody: { allow_partial: missing > 0, include_subtitles: includeSubtitles, edit_revision: record.revision } })
        if (response.data) { window.dispatchEvent(new CustomEvent('jellyfish:task-accepted',{detail:{taskId:response.data.task_id,title:'成片导出'}})); setTaskId(response.data.task_id); setProgress(0) }
      } catch (error) { message.error(errorText(error)) } finally { submitLock.current = false; setBusy(false) }
    } })
  }
  /** 音频默认放入音乐轨，限制到成片范围，用户再调整起点和音量。 */
  const addAudio = (file: FileRead) => {
    if (!plan || !duration || !file.duration_ms) { message.warning('需要有视频片段且音频时长已识别'); return }
    change({ ...plan, audio: [...audio, { id: crypto.randomUUID(), file_id: file.id, label: file.name, track: 'music',
      start_seconds: 0, in_seconds: 0, duration_seconds: Math.min(duration, file.duration_ms / 1000), volume: 0.3 }] })
    setPicker(false)
  }
  /** 重新读取素材目录不会改工程，适合从分镜修正返回后主动换片。 */
  const refreshSources = async () => {
    try { const result = await StudioTimelineService.getProjectTimelineApiV1StudioTimelineProjectsProjectIdGet({ projectId }); setTimeline(result.data || null) }
    catch (error) { message.error(errorText(error)) }
  }
  let cursor = 0
  const spans = clips.map((c, index) => { if (index && clips[index - 1].transition && clips[index - 1].transition !== 'cut') cursor -= clips[index - 1].transition_seconds || .4; const start = cursor; cursor += c.out_seconds - (c.in_seconds || 0); return { ...c, start, length: cursor - start } })
  const references = record?.character_references?.filter(r => r.shot_id === clip?.shot_id) || []

  return <div className="ve-workspace">
    <header className="ve-toolbar">
      <div><Link to={`/projects/${projectId}`} onClick={e => { if (dirty && !window.confirm('有未保存修改，确认离开？')) e.preventDefault() }}>返回项目</Link>
        <h1>成片剪辑工作台 <Tag color={dirty ? 'orange' : 'blue'}>{dirty ? '未保存' : `工程 v${record?.revision || 0}`}</Tag></h1>
        <p>选定镜头 → 剪辑与混音 → 一致性复核 → 合成成片</p></div>
      <Space wrap><Button disabled={!history.length || busy} onClick={() => { const prior = history[history.length - 1]; if (prior && plan) { setFuture(v => [...v, plan]); setPlan(prior); setHistory(v => v.slice(0, -1)); setDirty(true) } }}>撤销</Button>
        <Button disabled={!future.length || busy} onClick={() => { const next = future[future.length - 1]; if (next && plan) { setHistory(v => [...v, plan]); setPlan(next); setFuture(v => v.slice(0, -1)); setDirty(true) } }}>重做</Button>
        <Button onClick={() => { if (!dirty || window.confirm('重新加载会丢弃未保存修改，继续？')) void load() }} disabled={busy}>重新加载</Button>
        <Button onClick={() => void save()} loading={busy} disabled={!plan}>保存工程</Button>
        <Button type="primary" onClick={exportVideo} disabled={busy || Boolean(taskId) || dirty || !record?.revision || !clips.length}>合成预览 / 导出</Button></Space>
    </header>
    {loadError && <Alert type="error" message={loadError} action={<Button onClick={() => void load()}>重试</Button>} />}
    {Boolean(taskId) && <Alert type="info" message="正在本地合成，可继续编辑下一版本；当前任务使用提交时的工程。" description={<Progress percent={progress} />} />}
    <div className="ve-main">
      <section className="ve-monitor">
        <div className="ve-monitor-heading"><strong>{clip?.label || '片段监看'}</strong><Tag>源片裁剪预览</Tag></div>
        {clip ? <video key={`${clip.id}:${clip.file_id}`} ref={videoRef} controls playsInline preload="metadata" src={media(clip.file_id)}
          onError={() => setPlayerError(true)} onLoadedMetadata={e => { setPlayerError(false); e.currentTarget.currentTime = clip.in_seconds || 0; e.currentTarget.volume = Math.min(1, clip.volume ?? 1) }}
          onPlay={e => { if (e.currentTarget.currentTime >= clip.out_seconds || e.currentTarget.currentTime < (clip.in_seconds || 0)) e.currentTarget.currentTime = clip.in_seconds || 0 }}
          onTimeUpdate={e => { if (e.currentTarget.currentTime >= clip.out_seconds) { e.currentTarget.pause(); e.currentTarget.currentTime = clip.in_seconds || 0 } }} /> : <Empty description="先在分镜工作室生成视频，再刷新素材并加入工程" />}
        {playerError && clip && <Alert type="warning" message="兼容预览未加载，请重试或下载原片检查。" action={<Button href={media(clip.file_id, 'download')}>下载原片</Button>} />}
        <p>此处监看源片入出点；首次兼容预览可能需要片刻。混音、字幕和大于 1 的增益以合成成片为准。</p>
        {previous && <Button onClick={() => setCompare(v => !v)}>{compare ? '收起前镜头' : '对照前镜头：检查人物与衔接'}</Button>}
        {compare && previous && <div><p>{previous.label} · 查看出点前画面</p><video key={previous.file_id} controls preload="metadata" src={media(previous.file_id)} onLoadedMetadata={e => { e.currentTarget.currentTime = Math.max(previous.in_seconds || 0, previous.out_seconds - 2) }} /></div>}
      </section>
      <aside className="ve-inspector">
        <Card title="当前片段" size="small">
          {clip ? <div className="ve-stack">
            <div className="ve-fields"><Seconds label="源片入点" value={clip.in_seconds || 0} onChange={v => updateClip({ in_seconds: v })} /><Seconds label="源片出点" value={clip.out_seconds} onChange={v => updateClip({ out_seconds: v })} /></div>
            <label className="ve-field"><span>原声音量（0 = 静音，1 = 原声）</span><InputNumber aria-label="原声音量" min={0} max={2} step={0.1} value={clip.volume ?? 1} onChange={v => v != null && updateClip({ volume: v })} /></label>
            {selectedIndex < clips.length - 1 && <div className="ve-fields"><label className="ve-field"><span>与下一镜头转场</span><Select aria-label="镜头转场" value={clip.transition || 'cut'} onChange={v => updateClip({ transition: v })} options={[{value:'cut',label:'直接切换'},{value:'fade',label:'交叉叠化'},{value:'dissolve',label:'溶解'},{value:'wipeleft',label:'向左擦除'},{value:'slideright',label:'向右滑动'},{value:'fadeblack',label:'淡入黑场'}]} /></label>{clip.transition && clip.transition !== 'cut' && <Seconds label="转场时长" value={clip.transition_seconds || .4} onChange={v => updateClip({ transition_seconds: v })} />}</div>}
            <Space wrap><Button onClick={() => move(-1)} disabled={selectedIndex === 0}>前移</Button><Button onClick={() => move(1)} disabled={selectedIndex === clips.length - 1}>后移</Button>
              <Button danger onClick={() => plan && Modal.confirm({ title: '从工程移除此片段？', content: '源视频保留；音轨和字幕采用绝对时间，请重新校时。', onOk: () => change({ ...plan, clips: clips.filter(c => c.id !== clip.id) }) })}>移出工程</Button></Space>
            <Button onClick={() => void refreshSources()}>刷新分镜素材目录</Button>
            {current && current.file_id !== clip.file_id && <Alert type="warning" message="分镜已选用另一视频，工程仍锁定旧版" action={<Button onClick={() => Modal.confirm({ title: '采用分镜当前视频？', content: '保持剪辑位置与音量；新视频较短时收紧出点，入点越界则归零。需重新审片并核对字幕。', onOk: () => updateClip({ file_id: current.file_id, in_seconds: (clip.in_seconds || 0) < current.duration_seconds ? clip.in_seconds : 0, out_seconds: Math.min(clip.out_seconds, current.duration_seconds) }) })}>替换</Button>} />}
            {current && <Link target="_blank" rel="noreferrer" to={`/projects/${projectId}/chapters/${current.chapter_id}/studio?shotId=${clip.shot_id}`}>返回此分镜修正 / 重生成</Link>}
            <div className="ve-file-id" title={clip.file_id}>固定视频：{clip.file_id}</div>
          </div> : <Empty description="点击视频轨上的片段" />}
        </Card>
        <Card title="人物与连续性复核" size="small">
          {references.length ? references.map(r => <div className="ve-character" key={r.character_id}>
            {r.image_file_id && <PreviewImage src={media(r.image_file_id)} alt={`${r.name}角色基准图`} />}
            <div><strong>{r.name}</strong><p>演员：{r.actor_name || '未关联'} · 服装：{r.costume_name || '未关联'}</p><p>{r.description}</p></div>
          </div>) : <p>当前镜头没有关联角色基准；无人镜头可直接检查场景与衔接。</p>}
          <p className="ve-help">对照实际画面核对脸型/年龄、发型与服装、道具归属、声音和前后镜头动作。关联一致不代表画面已一致，不调用模型。</p>
          {clip && <div className="ve-stack"><Select aria-label="人工复核状态" value={clip.review || 'unchecked'} onChange={v => updateClip({ review: v }, true)} options={[{ value: 'unchecked', label: '待复核' }, { value: 'approved', label: '人工已复核' }, { value: 'rework', label: '需返工' }]} />
            <Input.TextArea aria-label="复核备注" value={clip.review_note || ''} maxLength={2000} rows={2} placeholder="记录具体不一致的位置和修正要求" onChange={e => updateClip({ review_note: e.target.value }, true)} /></div>}
        </Card>
        {clip && <EditVisualReviewPanel key={clip.id} projectId={projectId} clipId={clip.id} shotId={clip.shot_id} hasPrevious={selectedIndex > 0} revision={record?.revision || 0} dirty={dirty} />}
      </aside>
      <aside className="ve-delivery">
        <Card title="成片检查" size="small"><p>{clips.length} 个片段 · {time(duration)}</p><p>{missing ? `有 ${missing} 个镜头未纳入工程` : '项目镜头已纳入工程'}</p><p>{unchecked} 个片段待复核 / 返工</p>
          <label className="ve-field"><span>成片分辨率</span><Select aria-label="成片分辨率" value={plan?.resolution || 720} onChange={v => plan && change({ ...plan, resolution: v }, false)} options={[{ value: 720, label: '720p' }, { value: 1080, label: '1080p' }]} /></label>
          <p className="ve-help">保持项目画幅，25 fps。提高输出尺寸不能补回源片细节。</p>
          <Space>包含校时字幕 <Switch checked={includeSubtitles} onChange={setIncludeSubtitles} /></Space>
        </Card>
        <Card title={`最近合成成片${exportRevision ? ` · v${exportRevision}` : ''}`} size="small">
          {exportFile ? <div className="ve-stack"><video controls preload="metadata" src={media(exportFile)} /><Button href={media(exportFile, 'download')}>下载 MP4</Button><p className="ve-help">这是此前已完成的成片，修改工程后需重新合成。</p></div> : <Empty description="保存后点击合成预览 / 导出" />}
        </Card>
      </aside>
    </div>
    <Card title="多轨时间线" extra={<span>{time(duration)} · 25 fps</span>} className="ve-timeline-card">
      <div className="ve-track-scroll"><div className="ve-tracks" style={{ width: Math.max(760, duration * 28) }}>
        <div className="ve-ruler"><span>00:00</span><span>{time(duration / 2)}</span><span>{time(duration)}</span></div>
        <div className="ve-track"><strong>视频 / 原声</strong><div className="ve-track-lane">
          {spans.map(c => <button key={c.id} title={`${c.label} · ${time(c.length)} · ${c.review === 'approved' ? '人工已复核' : '待复核 / 返工'}`} className={`ve-clip ${c.id === selected ? 've-selected' : ''}`} style={{ left: `${c.start / duration * 100}%`, width: `${c.length / duration * 100}%` }} onClick={() => setSelected(c.id)}>{c.label}<small>{time(c.length)} · {c.review === 'approved' ? '已复核' : '待复核'}</small></button>)}
        </div></div>
        {(['voice', 'music', 'effect'] as const).map(track => <div className="ve-track" key={track}><strong>{{ voice: '配音', music: '音乐', effect: '音效' }[track]}</strong><div className="ve-track-lane" style={{ height: Math.max(52, audio.filter(a => a.track === track).length * 34) }}>
          {audio.filter(a => a.track === track).map((a, i) => <AudioWaveformClip key={a.id} clip={a} total={duration} top={i * 34} url={media(a.file_id, 'download')} onChange={next => plan && change({ ...plan, audio: audio.map(x => x.id === a.id ? next : x) })} />)}
        </div></div>)}
        <div className="ve-track"><strong>字幕</strong><div className="ve-track-lane">{subtitles.map(c => <a href={`#subtitle-${c.id}`} key={c.id} className="ve-subtitle" title={c.text} style={{ left: `${c.start_seconds / duration * 100}%`, width: `${(c.end_seconds - c.start_seconds) / duration * 100}%` }}>{c.text}</a>)}</div></div>
      </div></div>
      <p className="ve-help">点击视频选择片段；拖动音频波形移动，拖动左右手柄裁剪，方向键微调。声音与字幕使用成片绝对时间。调整镜头顺序或裁剪后，请重新校时。重叠音频会同时混音。</p>
      <Space wrap><Button onClick={() => void refreshSources()}>刷新可用镜头</Button><Select aria-label="加入镜头" placeholder="补入尚未纳入的镜头" value={null} style={{ minWidth: 240, maxWidth: '100%' }} options={timeline?.clips?.filter(c => !clips.some(v => v.shot_id === c.shot_id)).map(c => ({ value: c.shot_id, label: c.label }))} onChange={id => { const c = timeline?.clips?.find(v => v.shot_id === id); if (c && plan) change({ ...plan, clips: [...clips, { id: crypto.randomUUID(), shot_id: c.shot_id, file_id: c.file_id, label: c.label, in_seconds: 0, out_seconds: c.duration_seconds, volume: 1, review: 'unchecked' }] }) }} /></Space>
    </Card>
    <Card title="声音编排" extra={<Button onClick={() => setPicker(true)} disabled={!duration}>添加已有音频</Button>}>
      <p className="ve-help">添加配音时检查视频是否已有相同对白，必要时把原声音量设为 0，避免重复人声。音乐建议先低音量试听。</p>
      {!audio.length && <Empty description="保留视频原声；可添加配音、音乐和音效" />}
      {audio.map(a => <div className="ve-audio-row" key={a.id} id={`audio-${a.id}`}>
        <strong title={a.label}>{a.label}</strong><audio controls preload="metadata" src={media(a.file_id)} />
        <Select aria-label={`音轨 ${a.label}`} value={a.track} options={[{ value: 'voice', label: '配音' }, { value: 'music', label: '音乐' }, { value: 'effect', label: '音效' }]} onChange={v => plan && change({ ...plan, audio: audio.map(x => x.id === a.id ? { ...x, track: v } : x) })} />
        {(['start_seconds', 'in_seconds', 'duration_seconds'] as const).map(key => <Seconds key={key} label={{ start_seconds: '成片起点', in_seconds: '音频入点', duration_seconds: '使用时长' }[key]} value={a[key] || 0} onChange={v => plan && change({ ...plan, audio: audio.map(x => x.id === a.id ? { ...x, [key]: v } : x) })} />)}
        <label className="ve-field"><span>音量</span><InputNumber aria-label={`音量 ${a.label}`} min={0} max={2} step={0.1} value={a.volume} onChange={v => v != null && plan && change({ ...plan, audio: audio.map(x => x.id === a.id ? { ...x, volume: v } : x) })} /></label>
        <Button danger onClick={() => plan && change({ ...plan, audio: audio.filter(x => x.id !== a.id) })}>移除</Button>
      </div>)}
    </Card>
    <Card title="字幕校时" extra={<Button disabled={!duration} onClick={() => plan && change({ ...plan, subtitles: [...subtitles, { id: crypto.randomUUID(), start_seconds: 0, end_seconds: Math.min(2, duration), text: '新字幕' }] })}>添加字幕</Button>}>
      <p className="ve-help">首次草案按对白字数估算时间，不是语音识别结果。请根据成片实际声音修正文字与时间。</p>
      <div className="ve-cues">{subtitles.map(c => <div className="ve-cue" id={`subtitle-${c.id}`} key={c.id}>
        <Seconds label="字幕开始" value={c.start_seconds} onChange={v => plan && change({ ...plan, subtitles: subtitles.map(x => x.id === c.id ? { ...x, start_seconds: v } : x) })} />
        <Seconds label="字幕结束" value={c.end_seconds} onChange={v => plan && change({ ...plan, subtitles: subtitles.map(x => x.id === c.id ? { ...x, end_seconds: v } : x) })} />
        <Input.TextArea aria-label="字幕内容" rows={2} maxLength={2000} value={c.text} onChange={e => plan && change({ ...plan, subtitles: subtitles.map(x => x.id === c.id ? { ...x, text: e.target.value } : x) })} />
        <Button danger onClick={() => plan && change({ ...plan, subtitles: subtitles.filter(x => x.id !== c.id) })}>移除</Button>
      </div>)}</div>
    </Card>
    {picker && <MediaFilePicker kind="audio" selectedIds={[]} onClose={() => setPicker(false)} onSelect={addAudio} />}
  </div>
}
