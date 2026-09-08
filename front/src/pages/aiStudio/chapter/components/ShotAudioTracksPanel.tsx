import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Empty, Input, InputNumber, Modal, Select, Slider, Space, Switch, Tag, message } from 'antd'
import { DeleteOutlined, PlusOutlined, SoundOutlined, ThunderboltOutlined } from '@ant-design/icons'
import type { AudioAssetRead, ShotAudioCuePlan, ShotAudioTrackRead, ShotAudioTrackType } from '../../../../services/generated'
import { FilmService, StudioMediaAssetsService, StudioShotDetailsService } from '../../../../services/generated'
import { buildFileDownloadUrl } from '../../assets/utils'

const TRACK_OPTIONS: Array<{ value: ShotAudioTrackType; label: string; color: string }> = [
  { value: 'dialogue', label: '对白', color: 'blue' },
  { value: 'narration', label: '旁白', color: 'purple' },
  { value: 'bgm', label: '配乐', color: 'cyan' },
  { value: 'ambient', label: '环境声', color: 'green' },
  { value: 'sfx', label: '音效', color: 'orange' },
]

function trackMeta(type: ShotAudioTrackType) {
  return TRACK_OPTIONS.find((item) => item.value === type) ?? TRACK_OPTIONS[0]
}

const CUE_LABELS: Record<string, string> = {
  dialogue: '对白建议',
  voiceover: '旁白建议',
  bgm: '配乐建议',
  ambient: '环境声建议',
  sfx: '音效建议',
  subtitle: '字幕建议',
  silence: '静音要求',
}

function cueTrackType(audioType?: string): ShotAudioTrackType | null {
  if (audioType === 'dialogue') return 'dialogue'
  if (audioType === 'voiceover') return 'narration'
  if (audioType === 'bgm') return 'bgm'
  if (audioType === 'ambient') return 'ambient'
  if (audioType === 'sfx') return 'sfx'
  return null
}

/** 镜头真实音轨管理器：从素材库选择音频，持久化时间、音量和循环参数。 */
export function ShotAudioTracksPanel({ shotId }: { shotId: string | null }) {
  const [tracks, setTracks] = useState<ShotAudioTrackRead[]>([])
  const [cues, setCues] = useState<ShotAudioCuePlan[]>([])
  const [assets, setAssets] = useState<AudioAssetRead[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [audioAssetId, setAudioAssetId] = useState<string>()
  const [trackType, setTrackType] = useState<ShotAudioTrackType>('sfx')
  const [ttsOpen, setTtsOpen] = useState(false)
  const [ttsVoice, setTtsVoice] = useState('')
  const [ttsInstruction, setTtsInstruction] = useState('')
  const [ttsSubmitting, setTtsSubmitting] = useState(false)
  const [ttsTaskId, setTtsTaskId] = useState<string>()

  const load = useCallback(async () => {
    if (!shotId) {
      setTracks([])
      setCues([])
      return
    }
    setLoading(true)
    try {
      const [tracksResponse, detailResponse] = await Promise.all([
        StudioMediaAssetsService.listShotAudioTracksApiApiV1StudioMediaAssetsShotsShotIdAudioTracksGet({ shotId }),
        StudioShotDetailsService.getShotDetailApiV1StudioShotDetailsShotIdGet({ shotId }),
      ])
      setTracks(tracksResponse.data ?? [])
      setCues(detailResponse.data?.audio_cues ?? [])
    } catch {
      message.error('加载镜头音轨失败')
    } finally {
      setLoading(false)
    }
  }, [shotId])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (!ttsTaskId) return
    let disposed = false
    let timer: number | undefined
    const poll = async () => {
      try {
        const response = await FilmService.getTaskStatusApiV1FilmTasksTaskIdStatusGet({ taskId: ttsTaskId })
        const status = response.data?.status
        if (status === 'succeeded') {
          if (!disposed) {
            setTtsTaskId(undefined)
            message.success('AI 配音已生成并加入当前镜头音轨')
            await load()
          }
          return
        }
        if (status === 'failed' || status === 'cancelled') {
          if (!disposed) {
            setTtsTaskId(undefined)
            message.error(status === 'cancelled' ? 'AI 配音任务已取消' : 'AI 配音生成失败，请在任务中心查看原因')
          }
          return
        }
      } catch {
        // 短暂查询失败不丢弃任务，沿用任务中心的持久状态继续轮询。
      }
      if (!disposed) timer = window.setTimeout(() => void poll(), 8000)
    }
    void poll()
    return () => {
      disposed = true
      if (timer) window.clearTimeout(timer)
    }
  }, [load, ttsTaskId])

  const createTts = async () => {
    if (!shotId) return
    setTtsSubmitting(true)
    try {
      const response = await StudioMediaAssetsService.createShotTtsTaskApiApiV1StudioMediaAssetsShotsShotIdTtsTasksPost({
        shotId,
        requestBody: {
          voice: ttsVoice.trim() || null,
          instruction: ttsInstruction.trim() || null,
          language_type: 'Chinese',
        },
      })
      if (!response.data?.task_id) throw new Error('任务创建结果缺少 task_id')
      setTtsTaskId(response.data.task_id)
      setTtsOpen(false)
      message.success(response.data.reused ? '已有配音任务正在执行' : '配音任务已提交，可在任务中心查看')
    } catch {
      message.error('配音任务创建失败，请确认已配置默认语音模型和模型参数')
    } finally {
      setTtsSubmitting(false)
    }
  }

  const openPicker = async (type: ShotAudioTrackType) => {
    setTrackType(type)
    setAudioAssetId(undefined)
    setModalOpen(true)
    try {
      const response = await StudioMediaAssetsService.listAudioAssetsApiApiV1StudioMediaAssetsAudioAssetsGet({ page: 1, pageSize: 100 })
      setAssets(response.data?.items ?? [])
    } catch {
      message.error('加载音频素材库失败')
    }
  }

  const addTrack = async () => {
    if (!shotId || !audioAssetId) {
      message.warning('请选择一个音频素材')
      return
    }
    try {
      await StudioMediaAssetsService.createShotAudioTrackApiApiV1StudioMediaAssetsShotsShotIdAudioTracksPost({
        shotId,
        requestBody: {
          audio_asset_id: audioAssetId,
          track_type: trackType,
          start_ms: 0,
          volume: 1,
          sort_index: tracks.length,
        },
      })
      message.success('音频已加入当前镜头')
      setModalOpen(false)
      await load()
    } catch {
      message.error('添加镜头音轨失败')
    }
  }

  const updateTrack = async (track: ShotAudioTrackRead, body: { start_ms?: number; volume?: number; loop?: boolean }) => {
    try {
      const response = await StudioMediaAssetsService.updateShotAudioTrackApiApiV1StudioMediaAssetsShotAudioTracksTrackIdPatch({ trackId: track.id, requestBody: body })
      if (response.data) setTracks((current) => current.map((item) => item.id === track.id ? response.data! : item))
    } catch {
      message.error('更新音轨失败')
      await load()
    }
  }

  const groupedCount = useMemo(() => ({
    music: tracks.filter((item) => item.track_type === 'bgm' || item.track_type === 'ambient').length,
    voice: tracks.filter((item) => item.track_type === 'dialogue' || item.track_type === 'narration').length,
    effect: tracks.filter((item) => item.track_type === 'sfx').length,
  }), [tracks])

  if (!shotId) return <Empty description="请先选择镜头" />

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-blue-100 bg-blue-50/70 px-3 py-2 text-xs text-slate-600">
        音轨是可选增强：不添加也可继续生成视频；已添加的音频会保存为当前镜头的后期合成配置。
      </div>
      <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
        <Button onClick={() => void openPicker('bgm')}><PlusOutlined />配乐 {groupedCount.music || ''}</Button>
        <Button onClick={() => void openPicker('narration')}><PlusOutlined />配音 {groupedCount.voice || ''}</Button>
        <Button onClick={() => void openPicker('sfx')}><PlusOutlined />音效 {groupedCount.effect || ''}</Button>
        <Button
          type="primary"
          ghost
          loading={Boolean(ttsTaskId)}
          onClick={() => setTtsOpen(true)}
        >
          <ThunderboltOutlined />对白转配音
        </Button>
      </div>

      {cues.length ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3">
          <div className="mb-2 text-sm font-medium text-amber-900">剧本导入的声音计划</div>
          <div className="space-y-2">
            {cues.map((cue, index) => {
              const suggestedType = cueTrackType(cue.audio_type)
              return (
                <div key={cue.candidate_id ?? `${cue.audio_type}-${index}`} className="flex items-start justify-between gap-2 rounded bg-white px-2 py-2 text-xs">
                  <div>
                    <Tag>{CUE_LABELS[cue.audio_type ?? ''] ?? cue.audio_type ?? '声音'}</Tag>
                    {cue.speaker ? <span className="mr-2 font-medium">{cue.speaker}</span> : null}
                    <span>{cue.text}</span>
                    {cue.start_seconds !== null && cue.start_seconds !== undefined ? (
                      <span className="ml-2 text-slate-400">
                        {cue.start_seconds}s{cue.end_seconds !== null && cue.end_seconds !== undefined ? `–${cue.end_seconds}s` : ''}
                      </span>
                    ) : null}
                  </div>
                  {suggestedType ? (
                    <Button type="link" size="small" onClick={() => void openPicker(suggestedType)}>
                      选择素材
                    </Button>
                  ) : null}
                </div>
              )
            })}
          </div>
          <div className="mt-2 text-xs text-amber-800">
            这些是可编辑生产建议，不是音频文件；选择素材后才会进入真实音轨和后期合成。
          </div>
        </div>
      ) : null}

      {tracks.length === 0 && !loading ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前镜头没有音轨" />
      ) : (
        <div className="space-y-3">
          {tracks.map((track) => {
            const meta = trackMeta(track.track_type)
            return (
              <div key={track.id} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <Space size={6}><SoundOutlined /><span className="font-medium">{track.audio_asset.name}</span><Tag color={meta.color}>{meta.label}</Tag></Space>
                  <Button
                    danger
                    type="text"
                    size="small"
                    icon={<DeleteOutlined />}
                    onClick={async () => {
                      await StudioMediaAssetsService.deleteShotAudioTrackApiApiV1StudioMediaAssetsShotAudioTracksTrackIdDelete({ trackId: track.id })
                      await load()
                    }}
                  />
                </div>
                <audio className="h-8 w-full" controls preload="metadata" src={buildFileDownloadUrl(track.audio_asset.file_id)} />
                <div className="mt-3 grid grid-cols-[92px_1fr] items-center gap-x-3 gap-y-2 text-xs text-slate-500">
                  <span>开始时间</span>
                  <InputNumber
                    size="small"
                    min={0}
                    step={100}
                    value={track.start_ms}
                    addonAfter="ms"
                    onChange={(value) => void updateTrack(track, { start_ms: value ?? 0 })}
                  />
                  <span>音量 {Math.round(track.volume * 100)}%</span>
                  <Slider min={0} max={2} step={0.05} value={track.volume} onAfterChange={(value: number) => void updateTrack(track, { volume: value })} />
                  <span>循环播放</span>
                  <Switch size="small" checked={track.loop} onChange={(loop) => void updateTrack(track, { loop })} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal title="从配音音效库添加" open={modalOpen} okText="加入镜头" onOk={() => void addTrack()} onCancel={() => setModalOpen(false)}>
        <div className="space-y-4 pt-3">
          <Select
            className="w-full"
            value={trackType}
            options={TRACK_OPTIONS.map(({ value, label }) => ({ value, label }))}
            onChange={setTrackType}
          />
          <Select
            showSearch
            className="w-full"
            placeholder="选择已有配音或音效"
            value={audioAssetId}
            onChange={setAudioAssetId}
            optionFilterProp="label"
            options={assets.map((item) => ({ value: item.id, label: `${item.name} · ${trackMeta((item.category === 'voice' ? 'dialogue' : item.category === 'transition' ? 'sfx' : item.category) as ShotAudioTrackType).label}` }))}
          />
          <div className="text-xs text-slate-500">没有合适素材时，请先到“资产管理 → 配音音效”上传。</div>
        </div>
      </Modal>

      <Modal
        title="用镜头对白生成 AI 配音"
        open={ttsOpen}
        okText="确认调用并生成"
        confirmLoading={ttsSubmitting}
        onOk={() => void createTts()}
        onCancel={() => setTtsOpen(false)}
      >
        <div className="space-y-4 pt-3">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            将按顺序朗读当前镜头已确认对白，并调用默认语音模型；该操作可能产生供应商费用。生成结果会立即保存到 RustFS、资产管理和当前镜头音轨。
          </div>
          <div>
            <div className="mb-1 text-sm text-slate-600">音色（可选）</div>
            <Input value={ttsVoice} onChange={(event) => setTtsVoice(event.target.value)} placeholder="留空使用模型参数 voice；Qwen3-TTS 默认 Cherry" />
          </div>
          <div>
            <div className="mb-1 text-sm text-slate-600">表演指令（可选）</div>
            <Input.TextArea rows={3} value={ttsInstruction} onChange={(event) => setTtsInstruction(event.target.value)} placeholder="例如：温柔、语速稍慢，带一点紧张感" />
          </div>
        </div>
      </Modal>
    </div>
  )
}
