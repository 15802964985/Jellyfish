import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Card, Input, Select, Space, Table, Tag, Typography } from 'antd'
import { Link } from 'react-router-dom'

type ImageRow = { id: string; tags: string[]; purpose: string; status: string; references: string[]; reason: string; size: number; created: string }
type Inventory = { collected: string; context: string; rows: ImageRow[]; unresolved: string[] }

/** Read the sanitized host snapshot through nginx; no Docker daemon access from the web app. */
export default function DockerImages() {
  const [data, setData] = useState<Inventory | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [revision, setRevision] = useState(0)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    // Static host-generated metadata, not a business API or handwritten backend service.
    void fetch('/local-inventory/docker-images.json', { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('尚未取得镜像清单。请确认本机采集已运行，Docker Desktop 已启动。')
        const value = await response.json()
        if (!Array.isArray(value.rows) || !Array.isArray(value.unresolved) || typeof value.collected !== 'string') throw new Error('镜像清单格式异常，请重新采集。')
        if (!controller.signal.aborted) { setData(value); setError('') }
      }).catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : '读取失败，请稍后重试。') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [revision])
  const rows = useMemo(() => (data?.rows ?? []).filter(row => (!status || row.status === status) && JSON.stringify(row).toLowerCase().includes(search.trim().toLowerCase())), [data, status, search])
  return <div className="space-y-4">
    <Card title="Docker 镜像清单" extra={<Space><Link to="/settings">返回系统设置</Link><Button loading={loading} onClick={() => setRevision(value => value + 1)}>刷新清单</Button></Space>}>
      <Alert type="info" showIcon message="Unused 不等于无用：回滚版本和构建基础镜像也可能没有容器引用。" description="同一镜像的多个标签合并显示。此页只查询，不执行镜像删除。刷新读取最近一次采集结果，请留意采集时间。" />
      {error && <Alert className="mt-3" type="error" showIcon message={error} description={data ? '下方保留上次结果，不代表当前状态。' : undefined} />}
      <div className="my-4 flex flex-wrap items-center gap-3">
        <Input.Search className="max-w-md" allowClear aria-label="搜索镜像" placeholder="搜索名称、用途、容器或保留原因" value={search} onChange={event => setSearch(event.target.value)} />
        <Select aria-label="引用状态" style={{ width: 190 }} value={status} onChange={setStatus} options={['', '运行中引用', '非运行容器引用', '未被容器引用'].map(value => ({ value, label: value || '全部引用状态' }))} />
        <Typography.Text type="secondary">{rows.length} / {data?.rows.length ?? 0} 个独立镜像</Typography.Text>
      </div>
      {data && <p className="text-sm text-slate-500">采集时间：{data.collected} · Docker context：{data.context}</p>}
      <Table<ImageRow> rowKey="id" dataSource={rows} loading={loading} pagination={{ defaultPageSize: 10, showSizeChanger: true }} scroll={{ x: 1050 }} columns={[
        { title: '镜像名称 / 标签', width: 300, render: (_, row) => <><div className="break-all">{(row.tags.length ? row.tags : ['无标签镜像']).map(tag => <div key={tag}>{tag}</div>)}</div><Typography.Text type="secondary" className="text-xs break-all">{row.id}</Typography.Text></> },
        { title: '用途说明', dataIndex: 'purpose', width: 220 },
        { title: '引用状态 / 容器', width: 240, render: (_, row) => <><Tag color={row.status === '运行中引用' ? 'green' : 'default'}>{row.status}</Tag>{row.references.map(ref => <div className="mt-1 text-xs break-all" key={ref}>{ref}</div>)}</> },
        { title: '保留原因', dataIndex: 'reason', width: 260 },
        { title: '大小', width: 100, render: (_, row) => `${row.size} MiB` },
      ]} />
      {!!data?.unresolved.length && <Alert type="warning" message="部分容器引用的镜像不在当前镜像列表，需单独核对" description={data.unresolved.join('、')} />}
      <p className="mt-3 text-xs text-slate-500">大小为 Docker inspect 返回的镜像元数据大小，可能与 Docker Desktop 展示口径不同；共享层不能重复相加。镜像清单不包含数据库和素材数据卷。</p>
    </Card>
  </div>
}
