import { ReferencePlanSuggestions } from './ReferencePlanSuggestions'
import { CharacterViewPicker } from '../../components/CharacterViewPicker'
import { Button, Checkbox, Image, Space, Tag } from 'antd'
import { buildFileDownloadUrl, buildFilePreviewUrl } from '../../assets/utils'

type Props = {
  shotId?: string
  selected: string[]
  candidates: string[]
  names: Map<string, string>
  disabled: boolean
  saving: boolean
  onChange: (ids: string[]) => void
  onSave: () => void
  onAdd: () => void
  onRestore: () => void
}

/** Keep selected references ordered and excluded candidates visible, including explicit zero-reference choices. */
export function FrameReferenceSelector({ shotId, selected, candidates, names, disabled, saving, onChange, onSave, onAdd, onRestore }: Props) {
  const all = [...new Set([...selected, ...candidates])]
  /** Swap selected positions without changing membership or the identity of excluded images. */
  const move = (index: number, offset: number) => {
    const next = [...selected]
    ;[next[index], next[index + offset]] = [next[index + offset], next[index]]
    onChange(next)
  }
  return <section className="rounded-xl border border-slate-200 bg-white p-4">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div><strong>参考图映射</strong><p className="mb-0 text-xs text-slate-500">
        按当前帧保存；选中顺序决定图号。取消全部表示仅按文字生成。
      </p></div>
      <Space wrap>
        <Button disabled={disabled} onClick={onAdd}>从文件库补选</Button>
        <Button disabled={disabled} onClick={onRestore}>恢复推荐</Button>
        <Button disabled={disabled} onClick={() => onChange([])}>取消全部</Button>
        <Button type="primary" disabled={disabled} loading={saving} onClick={onSave}>保存本帧参考</Button>
      </Space>
    </div>
    {shotId && <ReferencePlanSuggestions shotId={shotId} disabled={disabled} onApply={onChange} />}
    {shotId && <CharacterViewPicker shotId={shotId} selected={selected} disabled={disabled} onClearFiles={ids=>onChange(selected.filter(id=>!ids.includes(id)))} onToggle={(_group, view, checked) => onChange(checked ? [...selected, view.file_id] : selected.filter(id => id !== view.file_id))} />}
    <div className="flex gap-3 overflow-x-auto pb-2">
      <Image.PreviewGroup>
        {all.map(fid => {
          const index = selected.indexOf(fid)
          return <div key={fid} className="w-32 shrink-0 rounded border border-slate-200 p-2">
            <Image alt={names.get(fid) ?? '参考图'} preview={{ src: buildFileDownloadUrl(fid) }} src={buildFilePreviewUrl(fid)} width={104} height={80} style={{ objectFit: 'contain' }} />
            <div className="my-1 truncate text-xs" title={names.get(fid) ?? fid}>{names.get(fid) ?? fid}</div>
            <Checkbox disabled={disabled} checked={index >= 0} onChange={event => onChange(
              event.target.checked ? [...selected, fid] : selected.filter(id => id !== fid)
            )}>{index >= 0 ? <Tag color="blue">图{index + 1}</Tag> : '不使用'}</Checkbox>
            {index >= 0 && <Space size={2} className="mt-2">
              <Button size="small" disabled={disabled || index === 0} onClick={() => move(index, -1)}>左移</Button>
              <Button size="small" disabled={disabled || index === selected.length - 1} onClick={() => move(index, 1)}>右移</Button>
            </Space>}
          </div>
        })}
      </Image.PreviewGroup>
      {all.length === 0 && <span className="text-sm text-slate-500">暂无参考图，可从文件库补选。</span>}
    </div>
  </section>
}
