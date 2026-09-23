import { useEffect, useState } from 'react'
import { Alert, Button, Input, Modal, Pagination, Space, Spin } from 'antd'
import { StudioEntitiesService, StudioShotsService } from '../../../../services/generated'
import type { ShotPreparationStateRead } from '../../../../services/generated'
import { loadAllPaginated } from '../../../../services/loadAllPaginated'
import { DisplayImageCard } from '../../assets/components/DisplayImageCard'
import { resolveAssetUrl } from '../../assets/utils'

type Kind = 'scene' | 'actor' | 'prop' | 'costume'
type Asset = { id: string; name: string; thumbnail?: string; description?: string; project_id?: string }
export type PreparationAssetTarget = { kind: Kind; name: string; description?: string | null; candidateId?: number; create?: boolean }

/** Select or create inside preparation; a failed link retries the created ID instead of creating twice. */
export function PreparationAssetDialog({ target, projectId, chapterId, shotId, visualStyle, style, onClose, onSaved }: {
  target: PreparationAssetTarget; projectId: string; chapterId: string; shotId: string
  visualStyle: string; style: string; onClose: () => void; onSaved: (state: ShotPreparationStateRead) => void
}) {
  const entityType = target.kind === 'actor' ? 'character' : target.kind
  const label = ({ actor: '角色', scene: '场景', prop: '道具', costume: '服装' })[target.kind]
  const [rows, setRows] = useState<Asset[]>([])
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(!!target.create)
  const [name, setName] = useState(target.name)
  const [description, setDescription] = useState(target.description || '')
  const [creationId] = useState(() => crypto.randomUUID())
  const [createdId, setCreatedId] = useState<string>()
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let disposed = false
    setLoading(true); setError('')
    loadAllPaginated((page, pageSize) => StudioEntitiesService.listEntitiesApiV1StudioEntitiesEntityTypeGet({ entityType, page, pageSize }))
      .then(items => { if (!disposed) setRows((items as Asset[]).filter(a => entityType !== 'character' || a.project_id === projectId)) })
      .catch(e => { if (!disposed) setError(String(e)) })
      .finally(() => { if (!disposed) setLoading(false) })
    return () => { disposed = true }
  }, [entityType, projectId, revision])
  const filtered = rows.filter(a => (a.name + ' ' + (a.description || '')).toLowerCase().includes(query.toLowerCase()))
    .sort((a,b) => Number(b.name === target.name) - Number(a.name === target.name))
  /** Link target and candidate atomically, then replace the page's aggregate preparation state. */
  const link = async (id: string) => {
    const response = await StudioShotsService.linkExistingAssetForPreparationApiApiV1StudioShotsShotIdPreparationLinkPost({ shotId, requestBody: {
      project_id: projectId, chapter_id: chapterId, entity_type: entityType, linked_entity_id: id, candidate_id: target.candidateId,
    } })
    if (!response.data?.state) throw new Error('关联未返回状态，请刷新检查')
    onSaved(response.data.state); onClose()
  }
  /** Only persist a new asset after an explicit save; preserve its ID if linking fails. */
  const create = async () => {
    setBusy(true); setError('')
    try {
      let id = createdId
      if (!id) {
        const response = await StudioEntitiesService.createEntityApiV1StudioEntitiesEntityTypePost({entityType, requestBody: {
          id: creationId, name: name.trim(), description: description.trim(), visual_style: visualStyle, style,
          ...(entityType === 'character' ? {project_id: projectId} : {}),
        }})
        if (!response.data?.id) throw new Error('新建未返回资产 ID，请先在已有列表核对，避免重复创建')
        id = String(response.data.id); setCreatedId(id)
      }
      await link(id)
    } catch(e) { setError(String(e)) } finally { setBusy(false) }
  }
  return <Modal open title={target.name ? '确认' + label + '：' + target.name : '添加' + label} width={900}
    onCancel={() => { if (!busy) onClose() }} footer={null} maskClosable={!busy} closable={!busy}>
    <Space className="mb-3"><Button disabled={busy} type={!creating ? 'primary' : 'default'} onClick={() => setCreating(false)}>选择已有{label}</Button>
      <Button disabled={busy} type={creating ? 'primary' : 'default'} onClick={() => setCreating(true)}>新建{label}</Button></Space>
    <p>选择已有资产不会自动采用同名匹配；请核对照片和描述。保存后直接关联当前镜头，无需重新提取。</p>
    {error && <Alert type="error" showIcon message={error} />}
    {createdId && <Alert type="warning" message="资产已创建。关联失败时点击继续关联，不会重复新建。" />}
    {creating ? <Space direction="vertical" className="w-full">
      <label>名称<Input aria-label="新建资产名称" value={name} disabled={busy || !!createdId} onChange={e => setName(e.target.value)} /></label>
      <label>描述<Input.TextArea aria-label="新建资产描述" rows={4} value={description} disabled={busy || !!createdId} onChange={e => setDescription(e.target.value)} /></label>
      <p>沿用项目风格：{visualStyle} / {style}。图片可在资产详情中补充，创建本身不会调用生成模型。</p>
      <Button type="primary" loading={busy} disabled={!name.trim()} onClick={() => void create()}>{createdId ? '继续关联当前镜头' : '保存并关联当前镜头'}</Button>
    </Space> : <>
      <Space className="mb-3"><Input.Search placeholder="搜索名称或描述" value={query} onChange={e => { setQuery(e.target.value); setPage(1) }} allowClear />
        <Button loading={loading} onClick={() => setRevision(v => v + 1)}>刷新已有资产</Button></Space>
      <Spin spinning={loading}><div className="preparation-asset-grid max-h-[50vh] overflow-y-auto">
        {filtered.slice((page-1)*6,page*6).map(asset => <DisplayImageCard key={asset.id} title={<span title={asset.name}>{asset.name}</span>}
          imageUrl={resolveAssetUrl(asset.thumbnail)} imageAlt={asset.name} imageHeightClassName="h-36"
          meta={<p className="text-xs whitespace-pre-wrap break-words">{asset.description}</p>}
          footer={<Button block loading={busy} onClick={async () => { setBusy(true); setError(''); try {await link(asset.id)} catch(e) {setError(String(e))} finally {setBusy(false)} }}>选择并关联</Button>} />)}
        {!loading && !filtered.length && <p>暂无匹配{label}，可切换到新建。</p>}
      </div></Spin>
      <Pagination className="mt-3" current={page} total={filtered.length} pageSize={6} showSizeChanger={false} onChange={setPage} />
    </>}
  </Modal>
}
