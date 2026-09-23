import { CharacterAppearanceSelect } from './CharacterAppearanceManager'
import { useEffect, useState } from 'react'
import { Alert, Button, Checkbox, Collapse, Image, Space, Spin } from 'antd'
import { StudioTimelineService, type CharacterAngleGroup, type CharacterAngleView } from '../../../services/generated'
import { buildFileDownloadUrl, buildFilePreviewUrl } from '../assets/utils'

/** 三个业务共用镜头人物角度目录，切换镜头后旧请求不能覆盖新目录。 */
export function CharacterViewPicker({ shotId, selected, disabled, canAdd, ordinalOffset = 0, onClearFiles, onToggle }: {
  shotId: string; selected: string[]; disabled?: boolean; ordinalOffset?: number;
  canAdd?: (group: CharacterAngleGroup, view: CharacterAngleView) => boolean;
  onClearFiles: (fileIds: string[]) => void;
  onToggle: (group: CharacterAngleGroup, view: CharacterAngleView, checked: boolean) => void
}) {
  const [groups, setGroups] = useState<CharacterAngleGroup[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    let disposed = false
    setGroups([]); setError('')
    if (!shotId) return
    setLoading(true)
    void StudioTimelineService.getShotCharacterViewsApiV1StudioTimelineShotsShotIdCharacterViewsGet({ shotId })
      .then(response => { if (!disposed) setGroups(response.data || []) })
      .catch(() => { if (!disposed) setError('人物角度目录加载失败，请重试') })
      .finally(() => { if (!disposed) setLoading(false) })
    return () => { disposed = true }
  }, [shotId, refresh])
  return <section aria-label="人物多角度参考目录">
    <Space wrap><strong>按角色选择多角度图片</strong><Button size="small" disabled={loading || disabled} onClick={() => setRefresh(v => v + 1)}>刷新人物图片</Button></Space>
    <p style={{ color: '#64748b', fontSize: 12 }}>角色定妆图与演员基准分开标注。只使用勾选的图片；演员服装可能不同，请按本镜头需要选择。</p>
    {loading && <Spin size="small" />}{error && <Alert type="warning" message={error} />}
    {!loading && !error && !groups.length && <p>本镜头尚未关联角色，请在分镜准备中确认角色。</p>}
    <Collapse size="small" items={groups.map(group => ({ key: group.character_id,
      label: `${group.name}${group.actor_name ? ` · 演员：${group.actor_name}` : ' · 未关联演员'} · ${group.views?.length || 0} 张`,
      children: <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}><CharacterAppearanceSelect key={`${shotId}:${group.character_id}`} shotId={shotId} characterId={group.character_id} value={group.appearance_id} disabled={disabled} onChanged={()=>{onClearFiles((group.views||[]).map(view=>view.file_id));setRefresh(v=>v+1)}}/><Image.PreviewGroup>
        {(group.views || []).map(view => <div key={`${view.source_type}:${view.image_id}`} style={{ width: 124 }}>
          <Image width={120} height={100} style={{ objectFit: 'contain' }} src={buildFilePreviewUrl(view.file_id)} preview={{ src: buildFileDownloadUrl(view.file_id) }} alt={`${group.name} ${view.label}`} />
          <div style={{ fontSize: 12, margin: '4px 0' }}>{view.label}</div>
          <Checkbox aria-label={`${group.name} ${view.label}`} checked={selected.includes(view.file_id)} disabled={disabled || (!selected.includes(view.file_id) && canAdd && !canAdd(group, view))}
            onChange={event => onToggle(group, view, event.target.checked)}>{selected.includes(view.file_id) ? `已选 · 图${selected.indexOf(view.file_id) + 1 + ordinalOffset}` : '选用此角度'}</Checkbox>
        </div>)}
        {!group.views?.length && <span>暂无可用图片，请先生成/采用角色或关联演员的图片。</span>}
      </Image.PreviewGroup></div> }))} />
  </section>
}
