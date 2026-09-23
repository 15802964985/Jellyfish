import { useEffect, useState } from 'react'
import { Alert, Button, Card, Modal, Select, Space, Tag, message } from 'antd'
import { StudioEntitiesService, StudioShotLinksService } from '../../../../services/generated'
import { loadAllPaginated } from '../../../../services/loadAllPaginated'
import { notifyProjectDataChanged } from './projectDataEvents'

type ActorOption = { id: string; name: string; description?: string }
/** 已有角色可后补、更换或解除演员；仅更新关联，不覆盖角色文案、图片和视频。 */
export function RoleActorPanel({ characterId, projectId }: { characterId: string; projectId?: string }) {
  const [actors, setActors] = useState<ActorOption[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    let disposed = false
    /** 项目演员候选与当前关联分别读取，历史关联不因候选列表变化而丢失。 */
    const load = async () => {
      setBusy(true); setError('')
      try {
        const role = await StudioEntitiesService.getEntityApiV1StudioEntitiesEntityTypeEntityIdGet({ entityType: 'character', entityId: characterId })
        const actorId = (role.data?.actor_id as string | null) || null
        const links = projectId ? await loadAllPaginated<{ actor_id: string }>((page, pageSize) => StudioShotLinksService.listProjectEntityLinksApiV1StudioShotLinksEntityTypeGet({ entityType: 'actor', projectId, page, pageSize })) : []
        const ids = [...new Set([...links.map(item => item.actor_id), ...(actorId ? [actorId] : [])])]
        const rows = await Promise.all(ids.map(async entityId => {
          const response = await StudioEntitiesService.getEntityApiV1StudioEntitiesEntityTypeEntityIdGet({ entityType: 'actor', entityId })
          return response.data as ActorOption
        }))
        if (!disposed) { setActors(rows.filter(Boolean)); setSelected(actorId); setSaved(actorId) }
      } catch { if (!disposed) setError('演员关联加载失败，请刷新页面后重试') }
      finally { if (!disposed) setBusy(false) }
    }
    void load(); return () => { disposed = true }
  }, [characterId, projectId])
  /** 明确保存关联字段，解除使用null；失败保留选择供重试。 */
  const save = async () => {
    setBusy(true)
    try {
      await StudioEntitiesService.updateEntityApiV1StudioEntitiesEntityTypeEntityIdPatch({ entityType: 'character', entityId: characterId, requestBody: { actor_id: selected } })
      setSaved(selected)
      if (projectId) notifyProjectDataChanged({ projectId, resources: ['project', 'characters'] })
      message.success('演员关联已保存；已有图片和视频保留，请核对是否需要重新定妆')
    } catch { message.error('保存演员关联失败，选择已保留，请重试') }
    finally { setBusy(false) }
  }
  /** 更换或解除已有演员时解释影响，再由用户确认保存。 */
  const confirmSave = () => {
    if (saved && saved !== selected) Modal.confirm({ title: selected ? '更换角色演员？' : '解除角色演员关联？', content: '已有角色图片、三视图、分镜和视频不会自动更新。请重新核对主形象和定妆，需要时主动生成新版本。', okText: '确认保存关联', onOk: save })
    else void save()
  }
  return <Card title="角色演员关联（可选）" size="small">
    {error && <Alert type="error" message={error} />}
    <p>可以先建立剧情角色，之后再选演员。候选来自项目的“演员”列表；可先从资产库关联演员到本项目。</p>
    <Space wrap>
      <Select aria-label="角色关联演员" allowClear showSearch optionFilterProp="label" style={{ width: 280, maxWidth: '100%' }} placeholder="暂不关联演员" loading={busy} disabled={busy || !!error} value={selected || undefined} onChange={value => setSelected(value || null)} options={actors.map(actor => ({ value: actor.id, label: actor.name, title: actor.description || actor.name }))} />
      <Button type="primary" disabled={busy || !!error || selected === saved} loading={busy} onClick={confirmSave}>保存演员关联</Button>
      <Tag>{saved ? `当前演员：${actors.find(actor => actor.id === saved)?.name || saved}` : '当前未关联演员'}</Tag>
    </Space>
    <p style={{ marginTop: 8, marginBottom: 0, color: '#64748b' }}>修改关联不修改已有图像；生成前请核对角色主形象及实际参考图。</p>
  </Card>
}
