import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Empty, InputNumber, Modal, Select, Slider, Space, Switch, Tag, message } from 'antd'
import { DeleteOutlined, PlusOutlined, SoundOutlined } from '@ant-design/icons'
import type { AudioAssetRead, ShotAudioTrackRead, ShotAudioTrackType } from '../../../../services/generated'
import { StudioMediaAssetsService } from '../../../../services/generated'
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

/** 镜头真实音轨管理器：从素材库选择音频，持久化时间、音量和循环参数。 */
export function ShotAudioTracksPanel({ shotId }: { shotId: string | null }) {
  const [tracks, setTracks] = useState<ShotAudioTrackRead[]>([])
  const [assets, setAssets] = useState<AudioAssetRead[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [audioAssetId, setAudioAssetId] = useState<string>()
  const [trackType, setTrackType] = useState<ShotAudioTrackType>('sfx')

  const load = useCallback(async () => {
    if (!shotId) {
      setTracks([])
      return
    }
    setLoading(true)
    try {
      const response = await StudioMediaAssetsService.listShotAudioTracksApiApiV1StudioMediaAssetsShotsShotIdAudioTracksGet({ shotId })
      setTracks(response.data ?? [])
    } catch {
      message.error('加载镜头音轨失败')
    } finally {
      setLoading(false)
    }
  }, [shotId])

  useEffect(() => { void load() }, [load])

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
      <div className="grid grid-cols-3 gap-2">
        <Button onClick={() => void openPicker('bgm')}><PlusOutlined />配乐 {groupedCount.music || ''}</Button>
        <Button onClick={() => void openPicker('narration')}><PlusOutlined />配音 {groupedCount.voice || ''}</Button>
        <Button onClick={() => void openPicker('sfx')}><PlusOutlined />音效 {groupedCount.effect || ''}</Button>
      </div>

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
    </div>
  )
}
