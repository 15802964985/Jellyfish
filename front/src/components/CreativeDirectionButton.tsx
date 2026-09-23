import { creativeHelp, creativeFormError } from './creativeDirectionForm'
import './creative-direction-form.css'
import { MediaFilePicker } from '../pages/aiStudio/files/MediaFilePicker'
import { PreviewImage } from './PreviewImage'
import { buildFilePreviewUrl } from '../pages/aiStudio/assets/utils'
import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Collapse, Drawer, Input, Modal, Select, Space, Spin, Table, Tabs, Typography, message } from 'antd'
import { useLocation } from 'react-router-dom'
import { StudioCreativeDirectionsService as Api, StudioProjectsService } from '../services/generated'
import type { CreativeRead, CreativeCatalog } from '../services/generated'

type Scope = CreativeRead['scope']
const scopeLabels: Record<Scope, string> = { global: '全局', project: '项目', chapter: '章节', shot: '分镜', actor: '演员', character: '角色', scene: '场景', prop: '道具', costume: '服装', lab: '实验室' }
const listFields = new Set(['secondary_genres', 'narrative_tags', 'reference_file_ids'])
const textFields = new Set(['era', 'geography', 'world_rules', 'art_constraints', 'general_rules'])
/** 只展示实际参与后续上下文的非空设定，不把清空记录当成有效内容。 */
function hasEffectiveValue(value:unknown):boolean {
  if(value==null)return false
  if(typeof value==='string')return Boolean(value.trim())
  if(Array.isArray(value))return value.length>0
  return true
}

/** 跨入口共用编辑器：稀疏覆盖、来源预览和并发版本校验，关闭不取消其他模型任务。 */
export function CreativeDirectionButton({ scope, entityId, label }: { scope: Scope; entityId: string; label?: string }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [picking, setPicking] = useState(false)
  const [record, setRecord] = useState<CreativeRead>()
  const [catalog, setCatalog] = useState<CreativeCatalog>()
  const [draft, setDraft] = useState<Record<string, any>>({})
  const [projectId, setProjectId] = useState<string | undefined>()
  const [projects, setProjects] = useState<{ value: string; label: string }[]>([])
  const epoch = useRef(0)
  useEffect(() => {
    if (!open || scope !== 'lab') return
    let active = true
    StudioProjectsService.listProjectsApiV1StudioProjectsGet({ page: 1, pageSize: 100 }).then(result => {
      if (active) setProjects((result.data?.items || []).map(item => ({ value: item.id, label: item.name })))
    }).catch(() => message.error('项目列表加载失败'))
    return () => { active = false }
  }, [open, scope])
  const effective: Record<string, any> = { ...(record?.inherited || {}), ...draft }
  const dirty = Boolean(record && (JSON.stringify(record.overrides) !== JSON.stringify(draft) || (scope === 'lab' && (record.project_id || '') !== (projectId || ''))))
  useEffect(() => { setOpen(false); setRecord(undefined); epoch.current++ }, [scope, entityId])
  useEffect(() => {
    if (!open) return
    const version = ++epoch.current
    setLoading(true); setError('')
    Promise.all([Api.getCreativeCatalogApiV1StudioCreativeDirectionsCatalogGet(), Api.getCreativeDirectionApiV1StudioCreativeDirectionsScopeEntityIdGet({ scope, entityId })])
      .then(([options, result]) => {
        if (epoch.current !== version) return
        if (!options.data || !result.data) throw new Error('创作设定未返回')
        setCatalog(options.data); setRecord(result.data); setDraft(result.data.overrides); setProjectId(result.data.project_id || undefined)
      }).catch(err => { if (epoch.current === version) setError(err?.body?.message || err.message || '加载失败') })
      .finally(() => { if (epoch.current === version) setLoading(false) })
    return () => { epoch.current++ }
  }, [open, scope, entityId])

  /** 保存绑定打开时的对象，迟到响应不能覆盖其他镜头的编辑器。 */
  async function save() {
    if (!record || saving) return
    const issue=scope==='global'?'':creativeFormError(effective,scope==='project')
    if(issue){message.warning(issue);return}
    const version = epoch.current
    setSaving(true)
    try {
      const res = await Api.putCreativeDirectionApiV1StudioCreativeDirectionsScopeEntityIdPut({ scope, entityId,
        requestBody: { expected_revision: record.revision, overrides: draft, project_id: scope === 'lab' ? projectId || null : null } })
      if (version !== epoch.current) return
      if (res.data) { setRecord(res.data); setDraft(res.data.overrides) }
      message.success('创作设定已保存；生成前请重新预览，历史作品不会自动重绘')
      window.dispatchEvent(new CustomEvent('creative-direction-updated', { detail: { scope, entityId } }))
    } catch (err: any) { message.error(err?.body?.message || err?.body?.detail || err.message || '保存失败') }
    finally { setSaving(false) }
  }
  /** 离开提醒只保护未保存配置，不阻塞运行中的模型任务。 */
  function close() {
    if (!dirty) { setOpen(false); return }
    Modal.confirm({ title: '放弃尚未保存的创作设定？', onOk: () => setOpen(false), okText: '放弃修改', cancelText: '继续编辑' })
  }
  /** 修改表现形式时清空不兼容画风，让用户重新选而非静默使用默认值。 */
  function change(key: string, value: any) {
    if(Array.isArray(value)&&((key==='secondary_genres'&&value.length>4)||(key==='narrative_tags'&&value.length>10))){message.warning('辅助题材最多4项，叙事标签最多10项');return}
    setDraft(old => {
      const next = { ...old, [key]: value ?? null }
      if(key==='primary_genre')next.secondary_genres=(effective.secondary_genres||[]).filter((x:string)=>x!==value)
      if (key === 'presentation' && effective.treatment && !catalog?.treatments[value]?.includes(effective.treatment)) next.treatment = null
      return next
    })
  }
  const fields = scope === 'global' ? ['general_rules'] : ['presentation', 'treatment', 'primary_genre', 'secondary_genres', 'narrative_tags', 'era', 'geography', 'world_rules', 'art_constraints', 'reference_file_ids']
  /** 字段编辑与继承开关共用渲染，null表示清空，删除键表示恢复继承。 */
  function field(key: string) {
    const own = Object.prototype.hasOwnProperty.call(draft, key)
    let options: string[] = []
    if (key === 'presentation') options = Object.keys(catalog?.treatments || {})
    if (key === 'treatment') options = catalog?.treatments[effective.presentation] || []
    if (key === 'primary_genre' || key === 'secondary_genres') options = (catalog?.genres || []).filter(x=>key!=='secondary_genres'||x!==effective.primary_genre)
    if (key === 'narrative_tags') options = catalog?.narrative_tags || []
    return <div key={key} style={{ marginBottom: 8 }}>
      <Space wrap style={{ marginBottom: 6 }}><strong>{catalog?.field_labels[key] || key}</strong>
        <Typography.Text type="secondary">{own ? '本层设置' : '继承上级'}</Typography.Text>
        {own && <Button size="small" type="link" onClick={() => setDraft(old => { const next = { ...old }; delete next[key]; return next })}>恢复继承</Button>}
      </Space>
      {key === 'reference_file_ids' ? <><Space wrap>{(effective.reference_file_ids || []).map((id: string) => <div key={id}><PreviewImage src={buildFilePreviewUrl(id)} alt="设定参考图" style={{ width: 90, height: 90, objectFit: 'contain' }} /><Button size="small" onClick={() => change(key, effective.reference_file_ids.filter((item: string) => item !== id))}>移除</Button></div>)}</Space><div><Button onClick={() => setPicking(true)}>从素材库选择设定参考图</Button><Typography.Paragraph type="secondary">这些图片用于记录美术依据；实际送给模型的图片仍在生成面板中明确选择。</Typography.Paragraph></div></> : textFields.has(key) ? <Input.TextArea placeholder={creativeHelp[key]?.example} autoSize={{ minRows: 2, maxRows: 4 }} value={effective[key] || ''} onChange={e => change(key, e.target.value)} maxLength={key === 'era' || key === 'geography' ? 200 : 3000} /> :
        <Select disabled={key==='secondary_genres'&&!effective.primary_genre} style={{ width: '100%' }} showSearch allowClear value={effective[key] ?? undefined}
          maxTagCount="responsive"
          mode={key === 'narrative_tags' || key === 'reference_file_ids' ? 'tags' : listFields.has(key) ? 'multiple' : undefined}
          placeholder={key === 'reference_file_ids' ? '设定依据的文件ID；实际送图仍在生成页面选择' : '未设置'}
          options={options.map(value => ({ value, label: value }))} onChange={value => change(key, value)} />}
      {creativeHelp[key]&&<p className="creative-field-help">{creativeHelp[key].help}</p>}
    </div>
  }
  return <><Button size="small" onClick={() => setOpen(true)}>{label || `${scopeLabels[scope]}创作设定`}</Button>
    <Drawer title={`${scopeLabels[scope]}创作设定`} open={open} onClose={close} width="min(960px, 96vw)" destroyOnClose
      footer={<Space><Button onClick={close}>关闭</Button><Button type="primary" loading={saving} disabled={!record || loading} onClick={save}>保存设定</Button></Space>}>
      {error && <Alert type="error" message={error} />}
      {loading ? <Spin /> : record && catalog && <>
        <Alert showIcon type="info" message="分类决定创作方向，具体剧情与实际参考图仍需核对" description="保存会影响此后生成上下文；旧提示词、历史预检和已生成素材不会被改写。与当前配置不一致的历史预检需标记为旧输入，不会自动付费重检。" style={{ marginBottom: 16 }} />
        {record.provenance?.method && <Alert type="info" message="旧数据设定来源" description={<><div>{record.provenance.notice}</div>{(record.provenance.evidence || []).map((item: any, index: number) => <div key={index} style={{ overflowWrap: 'anywhere' }}>{item.excerpt}</div>)}{record.provenance.needs_review?.length > 0 && <div>待核对线索：{record.provenance.needs_review.join('、')}</div>}</>} style={{ marginBottom: 12 }} />}
        {(record.warnings || []).map(text => <Alert key={text} message={text} type="warning" style={{ marginBottom: 8 }} />)}
        {scope === 'lab' && <div style={{ marginBottom: 16 }}>关联项目（留空为独立实验）<Select style={{ width: '100%' }} showSearch optionFilterProp="label" allowClear value={projectId} placeholder="选择要继承设定的项目" options={projects} onChange={value => setProjectId(value)} /></div>}
        {scope !== 'global' && <Space wrap style={{ marginBottom: 16 }}>{Object.entries(catalog.presets).map(([name, values]) => <Button key={name} onClick={() => setDraft(old => ({ ...old, ...(values as object) }))}>{name}</Button>)}</Space>}
        <Typography.Paragraph strong>{[effective.presentation, effective.treatment, effective.primary_genre, ...(effective.narrative_tags || [])].filter(Boolean).join(' · ') || '尚未指定创作方向'}</Typography.Paragraph>
        <div className="creative-fields"><div className="creative-fields-grid">{fields.slice(0, scope === 'global' ? 1 : 3).map(field)}</div></div>
        {scope !== 'global' && <Collapse items={[{ key: 'details', label: '辅助题材、叙事标签、世界与美术设定', children:<div className="creative-fields"><Tabs items={[{key:'story',label:'题材与叙事',children:<div className="creative-fields-grid">{['secondary_genres','narrative_tags'].map(field)}{Boolean(effective.secondary_genres?.length)&&<div style={{gridColumn:'1 / -1'}}><strong>混合题材说明（必填，保存为世界规则）</strong>{field('world_rules')}</div>}</div>},{key:'world',label:'世界与美术',children:<><p className="creative-field-help">只写已有剧情的明确事实，未知可留空；自由文本合理性需人工或显式AI预检核对。</p><div className="creative-fields-grid">{['era','geography','world_rules','art_constraints'].map(field)}</div></>},{key:'refs',label:'参考依据',children:field('reference_file_ids')} ]}/></div> }]} />}
        <Collapse style={{ marginTop: 16 }} items={[{ key: 'sources', label: `已保存的有效设定与来源（本对象版本 ${record.revision}）`, children: <><p className="creative-field-help">仅列出已保存且当前生效的内容。来源版本属于对应项目或对象，可以与本对象版本不同。</p><Table locale={{emptyText:'暂无有效设定'}} pagination={false} size="small" rowKey="key" dataSource={Object.entries(record.effective).filter(([,value])=>hasEffectiveValue(value)).map(([key, value]) => ({ key, value }))}
          columns={[{ title: '字段', dataIndex: 'key', render: key => catalog.field_labels[key] || key }, { title: '有效值', dataIndex: 'value', render: value => <span style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{Array.isArray(value)?value.join('、'):String(value)}</span> },
            { title: '来源', render: (_, row) => { const source: any = record.sources[row.key]; return source ? `${source.scope===scope&&source.entity_id===entityId?'本层':'继承'} ${scopeLabels[source.scope as Scope]} · ${source.revision ? '版本 ' + source.revision : '旧字段兼容'}` : '未配置' } }]} /></> }]} />
      </>}
    </Drawer>
    {picking && <MediaFilePicker kind="image" selectedIds={effective.reference_file_ids || []} onSelect={file => { change("reference_file_ids", [...(effective.reference_file_ids || []), file.id]); setPicking(false) }} onClose={() => setPicking(false)} />}
    </>
}

/** 根据明确路由提供项目/章节/资产入口；工作室当前镜头由业务组件显式传入。 */
export function CreativeDirectionContextButtons() {
  const { pathname, search } = useLocation()
  const parts = pathname.split('/').filter(Boolean)
  const targets: { scope: Scope; id: string }[] = []
  if (parts[0] === 'projects' && parts[1]) targets.push({ scope: 'project', id: parts[1] })
  if (parts[2] === 'chapters' && parts[3]) targets.push({ scope: 'chapter', id: parts[3] })
  if (parts[4] === 'shots' && parts[5]) targets.push({ scope: 'shot', id: parts[5] })
  if (parts[2] === 'roles' && parts[3]) targets.push({ scope: 'character', id: parts[3] })
  const assetScopes: Record<string, Scope> = { actors: 'actor', scenes: 'scene', props: 'prop', costumes: 'costume' }
  if (parts[0] === 'assets' && assetScopes[parts[1]] && parts[2]) targets.push({ scope: assetScopes[parts[1]], id: parts[2] })
  const session = new URLSearchParams(search).get('session')
  if (parts[0] === 'lab' && session) targets.push({ scope: 'lab', id: session })
  if (parts[0] === 'settings' || parts[0] === 'prompts') targets.push({ scope: 'global', id: 'system' })
  return <Space wrap>{targets.map(target => <CreativeDirectionButton key={`${target.scope}:${target.id}`} scope={target.scope} entityId={target.id} />)}</Space>
}


/** 列表只显示统一解析后的有效方向，不把兼容字段误当当前设置。 */
export function CreativeDirectionSummary({ scope, entityId }: { scope: Scope; entityId: string }) {
  const [text, setText] = useState('读取创作设定…')
  useEffect(() => {
    let active = true, request = 0
    const load = () => {
      const version = ++request
      Api.getCreativeDirectionApiV1StudioCreativeDirectionsScopeEntityIdGet({ scope, entityId }).then(result => {
        if (!active || version !== request) return
        const value = result.data?.effective || {}
        setText([value.presentation, value.treatment, value.primary_genre, ...(value.narrative_tags || [])].filter(Boolean).join(' · ') || '未设置创作方向')
      }).catch(() => { if (active && version === request) setText('创作设定暂无法读取') })
    }
    load()
    window.addEventListener('creative-direction-updated', load)
    return () => { active = false; window.removeEventListener('creative-direction-updated', load) }
  }, [scope, entityId])
  return <span title={text} style={{ overflowWrap: 'anywhere' }}>{text}</span>
}
