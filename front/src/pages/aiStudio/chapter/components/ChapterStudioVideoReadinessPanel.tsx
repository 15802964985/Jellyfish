import { Alert, Button, Spin, Tag } from 'antd'
import { VideoCameraAddOutlined } from '@ant-design/icons'
import type { ShotRead, ShotVideoReadinessRead } from '../../../../services/generated'

type ChapterStudioVideoReadinessPanelProps = {
  selectedShot: ShotRead | null
  videoReadinessLoading: boolean
  videoReadiness: ShotVideoReadinessRead | null
  onGoToPreparation: () => void
  onGoToParameters: () => void
  onGoToFrames: () => void
  videoReferenceMode: string
}

/** Present failed prerequisites before passed checks, with concrete next actions. */
export function ChapterStudioVideoReadinessPanel({
  selectedShot,
  videoReadinessLoading,
  videoReadiness,
  videoReferenceMode,
  onGoToPreparation, onGoToParameters, onGoToFrames,
}: ChapterStudioVideoReadinessPanelProps) {
  const failed = (videoReadiness?.checks ?? []).filter(check => !check.ok)
  const labels: Record<string, string> = { extraction_ready: '信息提取确认', duration_ready: '镜头时长', prompt_ready: '视频提示词', reference_frames_ready: '参考帧', model_reference_mode: '参考模式兼容', video_model_ready: '视频模型', provider_ready: '供应商配置', no_active_video_task: '进行中的任务' }
  const modes: Record<string, string> = { text_only: '纯文本', first: '首帧', last: '尾帧', key: '关键帧', first_last: '首尾帧', first_last_key: '首帧、尾帧与关键帧' }
  return (
    <div className="cs-group">
      <div className="cs-group-title">
        <VideoCameraAddOutlined /> 视频准备度
      </div>
      <div className="cs-hint">这里优先回答当前镜头能不能生成视频，以及还差哪些前置条件。</div>
      {videoReadinessLoading ? (
        <div className="py-6 text-center">
          <Spin />
        </div>
      ) : !selectedShot ? (
        <div className="text-xs text-gray-400">请先选择一个分镜。</div>
      ) : !videoReadiness ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-500">
          暂时无法获取当前镜头的视频准备度，请稍后重试。
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div>
              <div className="text-sm font-medium text-slate-900">
                {videoReadiness.ready ? '当前镜头已满足视频生成条件' : `还需处理 ${failed.length || '未知'} 项条件，暂不能生成视频`}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                当前按 <Tag className="!mx-1">{modes[videoReferenceMode] ?? videoReferenceMode}</Tag> 参考模式检查视频生成条件。
              </div>
            </div>
            <Tag color={videoReadiness.ready ? 'green' : 'gold'}>
              {videoReadiness.ready ? '可生成' : '待补齐'}
            </Tag>
          </div>

          {failed.length ? <div className="space-y-3">
            {failed.map(check => <Alert key={check.key} type="warning" showIcon message={labels[check.key] ?? '生成前置条件'}
              description={<div className="whitespace-normal break-words">
                <div>{(check.message || '服务未返回具体原因，请重新检查。').replace(/\b(first_last_key|first_last|first|last|key|text_only)\b/g, mode => modes[mode] ?? mode)}</div>
                {check.key === 'extraction_ready' && <Button className="mt-2" size="small" onClick={onGoToPreparation}>去分镜准备确认</Button>}
                {check.key === 'duration_ready' && <Button className="mt-2" size="small" onClick={onGoToParameters}>设置镜头时长</Button>}
                {check.key.includes('frame') && <Button className="mt-2" size="small" onClick={onGoToFrames}>检查关键帧与参考图</Button>}
                {check.key === 'prompt_ready' && <div className="mt-1">请检查当前镜头的视频提示词及提示词模板管理中的视频模板。</div>}
                {check.key.includes('model') || check.key.includes('provider') ? <a className="mt-2 inline-block" href="/models">打开模型管理</a> : null}
                {check.key === 'no_active_video_task' && <div className="mt-1">请在任务中心查看进度，等待当前视频任务结束后再生成。</div>}
              </div>} />)}
          </div> : !videoReadiness.ready ? <Alert type="warning" message="检查结果没有提供具体缺失项，请刷新准备度后重试。" /> : null}
          <details className="text-xs text-slate-500"><summary className="cursor-pointer">已通过 {(videoReadiness.checks ?? []).filter(check => check.ok).length} 项检查</summary>
            {(videoReadiness.checks ?? []).filter(check => check.ok).map(check => <div key={check.key} className="mt-2">✓ {check.message || labels[check.key] || check.key}</div>)}
          </details>
        </div>
      )}
    </div>
  )
}
