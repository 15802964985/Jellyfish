import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Card, Empty, Modal, Progress, Skeleton, Switch, Tag, Tooltip, message } from 'antd'
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  CloudDownloadOutlined,
  ExportOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  VideoCameraOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import { Link, useParams } from 'react-router-dom'
import {
  FilmService,
  OpenAPI,
  StudioTimelineService,
  type ProjectTimelineClipRead,
  type ProjectTimelineRead,
} from '../../../services/generated'

function mediaUrl(fileId: string, action: 'preview' | 'download' = 'preview') {
  const base = String(OpenAPI.BASE || '').replace(/\/$/, '')
  return `${base}/api/v1/studio/files/${encodeURIComponent(fileId)}/${action}`
}

function formatDuration(seconds: number) {
  const total = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(total / 60)
  const remain = total % 60
  return `${minutes}:${String(remain).padStart(2, '0')}`
}

function errorDetail(error: unknown, fallback: string) {
  const detail = (error as { body?: { detail?: unknown } })?.body?.detail
  return typeof detail === 'string' && detail ? detail : fallback
}

const VideoEditor: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>()
  const [timeline, setTimeline] = useState<ProjectTimelineRead | null>(null)
  const [selectedClipId, setSelectedClipId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState(0)
  const [exportTaskId, setExportTaskId] = useState<string>('')
  const [exportedFileId, setExportedFileId] = useState<string>('')
  const [includeSubtitles, setIncludeSubtitles] = useState(true)

  const load = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    try {
      const response = await StudioTimelineService.getProjectTimelineApiV1StudioTimelineProjectsProjectIdGet({
        projectId,
      })
      const next = response.data ?? null
      setTimeline(next)
      const clips = next?.clips ?? []
      setSelectedClipId((current) => (clips.some((clip) => clip.id === current) ? current : clips[0]?.id ?? ''))
      setExportedFileId(String(next?.latest_export_file_id ?? ''))
    } catch (error) {
      message.error(errorDetail(error, '时间线加载失败，请检查项目和后端服务'))
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!exportTaskId) return
    let disposed = false
    let timer: number | undefined
    const poll = async () => {
      try {
        const response = await FilmService.getTaskResultApiV1FilmTasksTaskIdResultGet({ taskId: exportTaskId })
        if (disposed || !response.data) return
        const result = response.data
        setExportProgress(Number(result.progress ?? 0))
        if (result.status === 'succeeded') {
          const fileId = String((result.result as { file_id?: string } | null)?.file_id ?? '')
          setExportedFileId(fileId)
          setExporting(false)
          setExportTaskId('')
          message.success('成片导出完成')
          await load()
          return
        }
        if (result.status === 'failed' || result.status === 'cancelled') {
          setExporting(false)
          setExportTaskId('')
          message.error(result.error || (result.status === 'cancelled' ? '导出任务已取消' : '成片导出失败'))
          return
        }
        timer = window.setTimeout(() => void poll(), 8000)
      } catch {
        if (!disposed) timer = window.setTimeout(() => void poll(), 8000)
      }
    }
    void poll()
    return () => {
      disposed = true
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [exportTaskId, load])

  const clips = timeline?.clips ?? []
  const selectedClip = useMemo(
    () => clips.find((clip) => clip.id === selectedClipId) ?? clips[0] ?? null,
    [clips, selectedClipId],
  )

  const submitExport = useCallback(
    async (allowPartial: boolean) => {
      if (!projectId) return
      setExporting(true)
      setExportProgress(0)
      try {
        const response = await StudioTimelineService.exportProjectVideoApiV1StudioTimelineProjectsProjectIdExportsPost({
          projectId,
          requestBody: { allow_partial: allowPartial, include_subtitles: includeSubtitles },
        })
        const task = response.data
        if (!task?.task_id) throw new Error('missing task id')
        setExportTaskId(task.task_id)
        message.success(task.reused ? '已继续跟踪正在执行的成片任务' : '成片任务已提交，可在任务中心查看')
      } catch (error) {
        setExporting(false)
        message.error(errorDetail(error, '成片任务提交失败'))
      }
    },
    [includeSubtitles, projectId],
  )

  const requestExport = useCallback(() => {
    if (!timeline || clips.length === 0) {
      message.warning('至少需要一个已生成的视频镜头才能导出')
      return
    }
    const missingCount = timeline.missing_shot_ids?.length ?? 0
    if (missingCount > 0) {
      Modal.confirm({
        title: `仍有 ${missingCount} 个镜头没有视频`,
        content: '继续后会按章节和镜头顺序跳过这些空缺，只导出当前已有的视频。建议先补齐镜头，避免剧情断裂。',
        okText: '仍要导出已有镜头',
        cancelText: '返回补齐',
        okButtonProps: { danger: true },
        onOk: () => submitExport(true),
      })
      return
    }
    void submitExport(false)
  }, [clips.length, submitExport, timeline])

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-4 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            to={projectId ? `/projects/${projectId}/chapters` : '/projects'}
            className="mb-2 flex items-center gap-1 text-sm text-gray-500 hover:text-blue-600"
          >
            <ArrowLeftOutlined /> 返回项目工作台
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="m-0 text-2xl font-semibold tracking-tight text-slate-900">成片工作台</h1>
            <Tag color={timeline?.export_ready ? 'success' : 'warning'}>
              {timeline?.export_ready ? '镜头已齐' : '待补镜头'}
            </Tag>
          </div>
          <p className="mb-0 mt-1 text-sm text-slate-500">按章节与镜头顺序检查成片，再导出标准 MP4。</p>
        </div>
        <div className="flex items-center gap-2">
          <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
            刷新素材
          </Button>
          <Button
            type="primary"
            size="large"
            icon={<ExportOutlined />}
            onClick={requestExport}
            loading={exporting}
            disabled={!timeline || clips.length === 0}
          >
            {exporting ? '正在导出' : '导出 MP4 成片'}
          </Button>
        </div>
      </div>

      {exporting && (
        <Alert
          type="info"
          showIcon
          message="正在统一镜头尺寸、帧率和音轨后拼接"
          description={<Progress percent={exportProgress} size="small" status="active" />}
        />
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="overflow-hidden rounded-2xl bg-[#0b1220] shadow-[0_18px_50px_rgba(15,23,42,0.18)]">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-3 text-white">
            <div className="flex items-center gap-2 text-sm font-medium">
              <PlayCircleOutlined className="text-cyan-300" />
              {selectedClip?.label ?? '镜头监看器'}
            </div>
            {selectedClip && <span className="font-mono text-xs text-slate-400">{formatDuration(selectedClip.duration_seconds)}</span>}
          </div>
          <div className="flex min-h-[460px] items-center justify-center bg-black/30 p-5">
            {loading ? (
              <Skeleton active paragraph={{ rows: 8 }} className="max-w-3xl" />
            ) : selectedClip ? (
              <video
                key={selectedClip.file_id}
                controls
                preload="metadata"
                className="max-h-[66vh] w-full rounded-lg bg-black object-contain shadow-2xl"
                src={mediaUrl(selectedClip.file_id)}
              />
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<span className="text-slate-400">还没有可预览的镜头视频</span>} />
            )}
          </div>
        </section>

        <aside className="space-y-4">
          <Card title="交付检查" className="border-slate-200">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-xs text-slate-500">视频镜头</div>
                <div className="mt-1 text-xl font-semibold text-slate-900">
                  {timeline?.ready_shots ?? 0}<span className="text-sm font-normal text-slate-400"> / {timeline?.total_shots ?? 0}</span>
                </div>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-xs text-slate-500">预计时长</div>
                <div className="mt-1 font-mono text-xl font-semibold text-slate-900">
                  {formatDuration(timeline?.total_duration_seconds ?? 0)}
                </div>
              </div>
            </div>
            <div className="mt-4 flex items-start gap-2 text-sm text-slate-600">
              {timeline?.export_ready ? (
                <CheckCircleOutlined className="mt-0.5 text-emerald-500" />
              ) : (
                <WarningOutlined className="mt-0.5 text-amber-500" />
              )}
              <span>
                {timeline?.export_ready
                  ? '所有镜头都已有视频，可以导出完整成片。'
                  : `还有 ${timeline?.missing_shot_ids?.length ?? 0} 个镜头缺少视频，默认不会静默跳过。`}
              </span>
            </div>
          </Card>

          <Card title="最近成片" className="border-slate-200">
            {exportedFileId ? (
              <div className="space-y-3">
                <video controls preload="metadata" className="aspect-video w-full rounded-lg bg-black object-contain" src={mediaUrl(exportedFileId)} />
                <Button block icon={<CloudDownloadOutlined />} href={mediaUrl(exportedFileId, 'download')}>
                  下载 MP4
                </Button>
              </div>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="完成一次导出后在这里下载" />
            )}
          </Card>
          <Card title="导出选项" className="border-slate-200">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-slate-800">包含对白字幕</div>
                <div className="mt-1 text-xs leading-5 text-slate-500">按镜头时段生成 SRT，并作为可开关字幕轨写入 MP4。</div>
              </div>
              <Switch checked={includeSubtitles} onChange={setIncludeSubtitles} />
            </div>
          </Card>
        </aside>
      </div>

      <Card
        title="镜头时间线"
        extra={<span className="text-xs text-slate-400">真实成片顺序 · 点击片段预览</span>}
        className="overflow-hidden border-slate-200"
      >
        {clips.length > 0 ? (
          <div className="overflow-x-auto pb-2">
            <div className="mb-2 flex min-w-max items-center gap-2 font-mono text-[11px] text-slate-400">
              <span>00:00</span>
              <div className="h-px min-w-[720px] flex-1 bg-slate-200" />
              <span>{formatDuration(timeline?.total_duration_seconds ?? 0)}</span>
            </div>
            <div className="flex min-w-max gap-1 rounded-xl bg-slate-100 p-2">
              {clips.map((clip: ProjectTimelineClipRead) => {
                const active = clip.id === selectedClip?.id
                const width = Math.max(150, Math.min(360, clip.duration_seconds * 28))
                return (
                  <Tooltip key={clip.id} title={`${clip.label} · ${formatDuration(clip.duration_seconds)}`}>
                    <button
                      type="button"
                      onClick={() => setSelectedClipId(clip.id)}
                      style={{ width }}
                      className={`group relative h-20 shrink-0 overflow-hidden rounded-lg border px-3 text-left transition ${
                        active
                          ? 'border-cyan-400 bg-[#13243c] text-white shadow-[0_0_0_2px_rgba(34,211,238,0.2)]'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50'
                      }`}
                    >
                      <span className={`absolute left-0 top-0 h-full w-1 ${active ? 'bg-cyan-300' : 'bg-blue-500'}`} />
                      <span className="block truncate text-xs font-semibold">
                        镜头 {clip.shot_index} · {clip.label.split(' · ').slice(-1)[0]}
                      </span>
                      <span className={`mt-2 block font-mono text-[11px] ${active ? 'text-slate-300' : 'text-slate-400'}`}>
                        {formatDuration(clip.start_seconds)} — {formatDuration(clip.end_seconds)}
                      </span>
                    </button>
                  </Tooltip>
                )
              })}
            </div>
            <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
              <VideoCameraOutlined />
              片段长度按镜头时长比例展示；导出时会统一到项目画幅并补齐无声视频的静音轨。
            </div>
          </div>
        ) : (
          <Empty description="请先在章节中生成镜头视频，时间线会自动出现" />
        )}
      </Card>
    </div>
  )
}

export default VideoEditor
