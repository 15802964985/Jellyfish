import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, ConfigProvider, Drawer, Empty, Input, Pagination, Select, Space, Switch, Table, Tag, Typography } from 'antd'
import { LlmService, type ModelOverviewRead, type ModelOverviewItem } from '../../../services/generated'
import { filterModelOverview } from './modelOverviewFilters'

const categories: Record<string, string> = { text: '文本生成', image: '图片生成', video: '视频生成', audio: '配音 TTS' }
const statuses: Record<string, string> = { configured: '已配置 · 待实测', needs_attention: '已保存 · 待完善/核验', not_configured: '未配置' }

// Keep body-portaled Select menus above this drawer, including Pagination's size selector.
const GUIDE_LAYER = 1200
const guidePopupTheme = { components: { Select: { zIndexPopup: GUIDE_LAYER + 50 } } }

/** Complete supported-model inventory with independent setup, scenario and verification columns. */
export default function ModelSelectionGuide({ open, onClose, onConfigure }: {
  open: boolean; onClose: () => void; onConfigure: (item: ModelOverviewItem, modelId?: string) => void
}) {
  const [overview, setOverview] = useState<ModelOverviewRead | null>(null)
  const [scene, setScene] = useState('')
  const [category, setCategory] = useState('')
  const [provider, setProvider] = useState('')
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [domestic, setDomestic] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(8)
  useEffect(() => {
    if (!open) return
    let active = true
    setLoading(true)
    setError('')
    setOverview(null)
    const request = LlmService.getModelOverviewApiV1LlmModelOverviewGet({ domesticOnly: domestic })
    void request.then(response => {
      if (active) setOverview(response.data ?? null)
    }).catch(() => {
      if (active) setError('读取模型总览失败，请重新读取。未调用生成接口。')
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false; request.cancel() }
  }, [open, domestic, reload])
  useEffect(() => setPage(1), [open, scene, category, provider, status, search, domestic, reload, pageSize])
  const items = overview?.models ?? []
  const scenes = overview?.scenarios ?? []
  const filtered = useMemo(() => filterModelOverview(overview?.models ?? [],
    { scene, category, provider, status, search }), [overview, scene, category, provider, status, search])
  const visiblePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / pageSize)))
  const selectedScene = scenes.find(item => item.key === scene)
  const providerOptions = [...new Map(items.map(item => [item.provider_key, item.provider_name])).entries()]
    .map(([value, label]) => ({ value, label }))
  return <ConfigProvider theme={guidePopupTheme}><Drawer title="场景选型说明 · 模型总览" open={open} onClose={onClose}
    width="min(1440px, 100vw)" zIndex={GUIDE_LAYER} styles={{ body: { padding: 16, overflowY: 'auto' } }}
    footer={<Pagination current={visiblePage} pageSize={pageSize} total={filtered.length} showSizeChanger
      pageSizeOptions={[8, 16, 32]} onChange={(next, size) => { setPage(next); setPageSize(size) }}
      showTotal={total => `共 ${total} 个型号 / 类型`} responsive />}>
    <Alert type="info" showIcon message="系统支持什么 · 我配置了什么 · 适合什么场景"
      description="默认展示国产离线接入目录与已保存型号，已保存优先。已配置不等于调用成功；本页不调用模型、不认证免费额度、不更改默认值。目录外型号单独标记待核验。" />
    <Space wrap className="my-4">
      <Select aria-label="业务场景" style={{ width: 220 }} value={scene} onChange={setScene}
        options={[{ value: '', label: '全部场景' }, ...scenes.map(item => ({ value: item.key, label: item.title }))]} />
      <Select aria-label="生成类型" style={{ width: 140 }} value={category} onChange={setCategory}
        options={[{ value: '', label: '全部生成类型' }, ...Object.entries(categories).map(([value, label]) => ({ value, label }))]} />
      <Select aria-label="供应商筛选" style={{ width: 210 }} value={provider} onChange={setProvider}
        options={[{ value: '', label: '全部供应商' }, ...providerOptions]} />
      <Select aria-label="配置状态" style={{ width: 210 }} value={status} onChange={setStatus}
        options={[{ value: '', label: '全部配置状态' }, { value: 'saved', label: '全部已保存' },
          ...Object.entries(statuses).map(([value, label]) => ({ value, label }))]} />
      <Input aria-label="搜索型号或账户" placeholder="搜索型号 / 供应商 / 账户" allowClear style={{ width: 230 }}
        value={search} onChange={event => setSearch(event.target.value)} />
      <Switch checked={domestic} onChange={value => { setDomestic(value); setProvider('') }}
        checkedChildren="国产厂商" unCheckedChildren="全部厂商" />
      <Button onClick={() => setReload(value => value + 1)} disabled={loading}>重新读取配置</Button>
      <Button onClick={() => { setScene(''); setCategory(''); setProvider(''); setStatus(''); setSearch('') }}>清空筛选</Button>
    </Space>
    {selectedScene && <Alert className="mb-4" type="info" message={selectedScene.title}
      description={`所需能力：${selectedScene.requirement}。${selectedScene.guidance}`} />}
    {error && <Alert type="error" message={error} className="mb-4" />}
    <Typography.Paragraph type="secondary">
      当前范围 {items.length} 个型号 / 类型，其中 {items.filter(item => item.configurations?.length).length} 个已保存配置。
      同一型号的多个账户在同一行分别展示；“已接通”仅指本地实现；官方链接分型号级和协议级，均不代表账户调用或生成质量已验收。
    </Typography.Paragraph>
    <Table<ModelOverviewItem> size="small" rowKey="key" loading={loading}
      dataSource={filtered.slice((visiblePage - 1) * pageSize, visiblePage * pageSize)} pagination={false}
      scroll={{ x: 1220 }} sticky
      locale={{ emptyText: <Empty description={error ? '读取失败，请重新读取' : '没有匹配型号，请清空筛选或切换厂商范围；无需先配置模型才能查看目录。'} /> }}
      columns={[
        { title: '供应商 / 型号', key: 'model', width: 230, render: (_, item) => <div>
          <Typography.Text strong style={{ overflowWrap: 'anywhere' }}>{item.model_name}</Typography.Text>
          <div><Typography.Text type="secondary">{item.provider_name}</Typography.Text></div>
        </div> },
        { title: '系统接入能力', key: 'support', width: 135, render: (_, item) => <Space direction="vertical" size={2}>
          <Tag>{categories[item.category]}</Tag><Tag color={item.integration === 'integrated' ? 'blue' : 'orange'}>
            {item.integration === 'integrated' ? '已接通所列场景' : '精确型号待核验'}</Tag>
        </Space> },
        { title: '我的配置', key: 'config', width: 220, render: (_, item) => <div>
          <Tag color={item.configuration_status === 'configured' ? 'blue' : 'default'}>{statuses[item.configuration_status]}</Tag>
          {(item.configurations ?? []).map(account => <div key={account.model_id} className="mt-2">
            <div>{account.provider_name} · {statuses[account.status]}</div>
            <Button size="small" type="link" onClick={() => onConfigure(item, account.model_id)}>查看 / 完善配置</Button>
          </div>)}
          {!item.configurations?.length && <Button type="link" size="small" onClick={() => onConfigure(item)}>
            {item.provider_ids?.length ? '配置此型号' : '先配置供应商'}</Button>}
        </div> },
        { title: '适用场景', key: 'scenes', width: 205, render: (_, item) => <div>
          {item.integration === 'unverified' && !!item.scenario_keys?.length &&
            <Typography.Text type="secondary">以下仅为协议适用方向，型号待验收：</Typography.Text>}
          {(item.scenario_keys ?? []).map(key => <div key={key}>{scenes.find(value => value.key === key)?.title ?? key}</div>)}
          {!item.scenario_keys?.length && <Typography.Text type="secondary">待接入核查，不推定可用</Typography.Text>}
        </div> },
        { title: '限制与配置说明', key: 'limits', width: 335, render: (_, item) => <div>
          {(item.limitations ?? []).map(value => <div key={value} className="mb-1">{value}</div>)}
          <Typography.Text type="secondary">{item.verification}；API 额度未核实。</Typography.Text>
          {item.official_documentation && <div><a href={item.official_documentation} target="_blank" rel="noopener noreferrer">官方文档 / 开通指引</a></div>}
        </div> },
      ]}
      expandable={{ rowExpandable: item => !!item.configurations?.length || !!item.mode_contracts?.length, expandedRowRender: item => <Space direction="vertical">
        {(item.mode_contracts ?? []).map(mode => <section key={mode.key} className="rounded border p-3 w-full">
          <strong>{mode.title}</strong> · {mode.implementation === 'integrated' ? '本地已接通' : '待核验 / 未接通'}
          <div>输入要求：{mode.requirement}。{mode.reason}</div>
          <details><summary>本地参数约束（当前模式）</summary><pre className="whitespace-pre-wrap break-all">{JSON.stringify(mode.parameters, null, 2)}</pre></details>
          <div>{mode.evidence_status === 'model_source_bound' ? '型号文档已绑定' : mode.evidence_status === 'protocol_only' ? '仅协议级文档' : '缺少官方来源'}；{mode.verification}</div>
          {mode.source_url && <a href={mode.source_url} target="_blank" rel="noreferrer">核对官方文档</a>}
        </section>)}
        {(item.configurations ?? []).map(account => <div key={account.model_id}>
          <strong>{account.provider_name}</strong>：{account.reasons?.join('；')}。
          <Typography.Text type="secondary">{account.verification}</Typography.Text>
        </div>)}
      </Space> }} />
    {!!overview?.notices?.length && <Alert className="mt-4" type="warning" message="目录覆盖边界"
      description={overview.notices.map(value => <div key={value}>{value}</div>)} />}
    <Typography.Paragraph type="secondary" className="mt-4">
      配置前核对账户地域、模型权限、输入素材和 API 价格；不自动切换套餐或付费通道。
      官网支持的高级模式不等于项目已接通，实际生成仍受型号能力检查。
    </Typography.Paragraph>
  </Drawer></ConfigProvider>
}
