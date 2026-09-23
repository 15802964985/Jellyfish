import { useEffect, useRef, useState } from 'react'
import { Alert, Select, Typography } from 'antd'

const SUGGESTIONS = ['愤怒', '紧张', '温馨', '压抑', '平静', '喜悦', '悲伤', '惊讶', '期待', '不安']

/** Edit per-shot moods with explicit selected values; failed saves restore the previous selection. */
export function ShotMoodTags({ value, onSave }: { value: string[]; onSave: (tags: string[]) => Promise<void> }) {
  const [tags, setTags] = useState(value)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const busy = useRef(false)
  useEffect(() => { if (!busy.current) setTags(value) }, [value])
  /** Normalize whitespace/duplicates before persisting, including an explicitly empty list. */
  const change = async (next: string[]) => {
    if (busy.current) return
    const normalized = [...new Set(next.map(tag => tag.trim()).filter(Boolean))]
    const previous = tags
    busy.current = true
    setSaving(true); setError(''); setTags(normalized)
    try { await onSave(normalized) }
    catch { setTags(previous); setError('情绪标签保存失败，已恢复原选择，请重试。') }
    finally { busy.current = false; setSaving(false) }
  }
  return <div className="space-y-3">
    <div className="cs-hint">建议词仅供选择，不会默认选中。输入自定义情绪后按回车添加；点击 × 取消，也可全部清空。</div>
    <Select mode="tags" aria-label="当前镜头情绪标签" className="w-full" value={tags} allowClear disabled={saving} loading={saving}
      placeholder="选择或输入情绪标签" options={[...new Set([...SUGGESTIONS, ...tags])].map(tag => ({ value: tag, label: tag }))}
      onChange={next => void change(next)} />
    <Typography.Text type="secondary">{saving ? '正在保存…' : tags.length ? `已选择 ${tags.length} 项，仅用于当前镜头` : '未设置情绪标签，保留剧本原有表达'}</Typography.Text>
    {error && <Alert type="error" showIcon message={error} />}
  </div>
}
