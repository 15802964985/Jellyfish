import { useEffect, useMemo, useRef, useState } from 'react'
import type { EditAudioClip } from '../../../services/generated'

type Envelope = { duration: number; peaks: number[] }
const cache = new Map<string, Envelope>()

/** 从真实解码样本提取包络，不能以随机波形冒充音频内容。 */
export function audioEnvelope(buffer: AudioBuffer): Envelope {
  const bins = Math.min(1600, buffer.length)
  const peaks = Array.from({ length: bins }, () => 0)
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel)
    for (let i = 0; i < bins; i++) {
      const start = Math.floor(i * data.length / bins), end = Math.floor((i + 1) * data.length / bins)
      for (let n = start; n < end; n++) peaks[i] = Math.max(peaks[i], Math.abs(data[n]))
    }
  }
  return { duration: buffer.duration, peaks }
}

/** 真实波形的单个音轨片段；拖动结束只提交一次修改，避免污染撤销栈。 */
export function AudioWaveformClip({ clip, total, top, url, onChange }: {
  clip: EditAudioClip; total: number; top: number; url: string; onChange: (clip: EditAudioClip) => void
}) {
  const [envelope, setEnvelope] = useState<Envelope | null>(cache.get(url) || null)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState<EditAudioClip | null>(null)
  const node = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; width: number; mode: 'move' | 'left' | 'right' } | null>(null)
  const pending = useRef<EditAudioClip | null>(null)
  const latest = useRef(clip)
  latest.current = clip
  useEffect(() => {
    setEnvelope(null); setError('')
    if (cache.has(url)) { setEnvelope(cache.get(url)!); return }
    const abort = new AbortController()
    let disposed = false
    let context: AudioContext | null = null
    /** 浏览器解码失败时保留数字校时；限制下载体积和时长以免大文件阻塞界面。 */
    const load = async () => {
      try {
        const response = await fetch(url, { signal: abort.signal })
        if (!response.ok) throw new Error('无法读取音频')
        if (Number(response.headers.get('content-length')) > 30 * 1024 * 1024) throw new Error('音频超过30MB，请使用数字校时')
        const content = await response.arrayBuffer()
        if (content.byteLength > 30 * 1024 * 1024) throw new Error('音频超过30MB，请使用数字校时')
        context = new AudioContext({ sampleRate: 8000 })
        const buffer = await context.decodeAudioData(content)
        if (buffer.duration > 1800) throw new Error('长音频请使用数字校时')
        const value = audioEnvelope(buffer)
        if (!disposed) { if (cache.size >= 20) cache.delete(cache.keys().next().value!); cache.set(url, value); setEnvelope(value); setError('') }
      } catch (e) { if (!disposed) setError(e instanceof Error ? e.message : '波形不可用，可使用数字校时') }
      finally { if (context && context.state !== 'closed') await context.close() }
    }
    void load()
    return () => { disposed = true; abort.abort() }
  }, [url])
  const value = draft || clip
  const path = useMemo(() => {
    if (!envelope) return ''
    const begin = Math.floor((value.in_seconds || 0) / envelope.duration * envelope.peaks.length)
    const end = Math.ceil(((value.in_seconds || 0) + value.duration_seconds) / envelope.duration * envelope.peaks.length)
    const section = envelope.peaks.slice(begin, end)
    return section.map((peak, i) => `M${i / Math.max(1, section.length - 1) * 1000},${14 - peak * 13}v${peak * 26}`).join(' ')
  }, [envelope, value.in_seconds, value.duration_seconds])
  /** 移动/裁剪受源时长与成片范围双重约束，左裁剪同步调整源入点和成片起点。 */
  const adjust = (delta: number, mode: 'move' | 'left' | 'right'): EditAudioClip => {
    const origin = latest.current, start = origin.start_seconds || 0, input = origin.in_seconds || 0
    const next = { ...origin }
    if (mode === 'move') next.start_seconds = Math.min(Math.max(0, start + delta), Math.max(0, total - origin.duration_seconds))
    else if (mode === 'left') {
      delta = Math.min(Math.max(delta, -input, -start), origin.duration_seconds - .04)
      next.in_seconds = input + delta; next.start_seconds = start + delta; next.duration_seconds -= delta
    } else {
      const sourceRemaining = envelope ? envelope.duration - input : origin.duration_seconds
      next.duration_seconds = Math.min(Math.max(.04, origin.duration_seconds + delta), sourceRemaining, total - start)
    }
    next.start_seconds = Math.round((next.start_seconds || 0) * 1000) / 1000
    next.in_seconds = Math.round((next.in_seconds || 0) * 1000) / 1000
    next.duration_seconds = Math.round(next.duration_seconds * 1000) / 1000
    return next
  }
  return <div ref={node} role="button" tabIndex={0} aria-label={`拖动音频 ${clip.label}`} title={`${clip.label} · ${error || '拖动移动；两侧手柄裁剪；方向键微调起点'}`}
    className={`ve-audio ve-waveform ve-${clip.track}`} style={{ left: `${(value.start_seconds || 0) / total * 100}%`, width: `${value.duration_seconds / total * 100}%`, top, touchAction: 'none' }}
    onPointerDown={e => { if (e.button !== 0) return; e.preventDefault(); const mode = (e.target as HTMLElement).dataset.edge as 'left' | 'right' | undefined; drag.current = { x: e.clientX, width: node.current!.parentElement!.getBoundingClientRect().width, mode: mode || 'move' }; pending.current = null; e.currentTarget.setPointerCapture(e.pointerId) }}
    onPointerMove={e => { if (!drag.current) return; const next = adjust((e.clientX - drag.current.x) / drag.current.width * total, drag.current.mode); pending.current = next; setDraft(next) }}
    onPointerUp={e => { if (!drag.current) return; drag.current = null; e.currentTarget.releasePointerCapture(e.pointerId); if (pending.current) onChange(pending.current); pending.current = null; setDraft(null) }}
    onPointerCancel={() => { drag.current = null; pending.current = null; setDraft(null) }}
    onKeyDown={e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); onChange(adjust((e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 1 : .04), 'move')) } }}>
    <svg viewBox="0 0 1000 28" preserveAspectRatio="none" aria-label={envelope ? '真实音频波形' : error ? '波形不可用' : '正在解析波形'}><path d={path} fill="none" stroke="currentColor" strokeWidth="2" /></svg>
    <span>{clip.label}{!envelope ? error ? ' · 数字校时' : ' · 解析中' : ''}</span>
    <i data-edge="left" title="拖动裁剪音频入点" /><i data-edge="right" title="拖动裁剪音频出点" />
  </div>
}
