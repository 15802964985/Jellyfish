import { useEffect, useState } from 'react'
import { Alert, Button, InputNumber, Modal, Space, Switch, Table, Tag, Collapse, message } from 'antd'
import { LlmService } from '../../../services/generated'

/** Show official changes and affected configured/supported models without pretending a document hash proves compatibility. */
export function ModelGovernanceTab() {
  const [report, setReport] = useState<Record<string, any> | null>(null)
  const [loading, setLoading] = useState(false)
  const [enabled, setEnabled] = useState(true)
  const [hours, setHours] = useState(24)
  const [diff, setDiff] = useState<string | null>(null)
  /** Pin a previous validated rule or explicitly resume synchronization; never alter a model endpoint. */
  const changeRules = async (row: Record<string, any>, target?: string) => {
    try {
      await LlmService.changeModelRuleApiV1LlmModelSyncSourceIdRulesPost({ sourceId: row.id,
        requestBody: { action: target ? 'rollback' : 'resume', expected_sha256: row.sha256, target_sha256: target } })
      message.success(target ? '已回退并固定规则版本' : '已恢复规则自动同步')
      await load()
    } catch { message.error('规则版本操作失败，请刷新后检查版本是否已变化') }
  }
  /** Reload synchronization status; no model-generation request is made. */
  const load = async () => {
    setLoading(true)
    try {
      const result = await LlmService.getModelSyncReportApiV1LlmModelSyncGet()
      setReport(result.data ?? null)
      setEnabled(result.data?.settings?.enabled ?? true)
      setHours(result.data?.settings?.interval_hours ?? 24)
    } catch { message.error('读取同步状态失败') }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])
  /** Persist cadence only; provider defaults and credentials are outside this operation. */
  const save = async () => {
    try {
      await LlmService.updateModelSyncSettingsApiV1LlmModelSyncSettingsPatch({ requestBody: { enabled, interval_hours: hours } })
      message.success('同步设置已保存')
      await load()
    } catch { message.error('保存同步设置失败') }
  }
  /** Queue a bounded manual scan and leave the UI responsive while the worker contacts official sources. */
  const sync = async () => {
    try {
      await LlmService.triggerModelSyncApiV1LlmModelSyncPost()
      message.success('已安排检查，请稍后刷新查看结果')
    } catch { message.error('检查任务未能安排，请确认任务服务正常') }
  }
  return <div className="app-workspace gap-3 overflow-hidden p-4">
    <Alert className="shrink-0" type="info" showIcon message="检测范围：系统支持型号与用户已配置型号"
      description={report?.notice ?? '启用配置优先，共用来源去重；不会调用收费模型探测。'} />
    <Space wrap className="shrink-0">
      <Switch checked={enabled} onChange={setEnabled} checkedChildren="定时开启" unCheckedChildren="定时关闭" />
      <span>每</span><InputNumber min={1} max={168} value={hours} onChange={value => setHours(value ?? 24)} /><span>小时检查</span>
      <Button onClick={() => void save()}>保存设置</Button>
      <Button type="primary" onClick={() => void sync()}>立即检查更新</Button>
      <Button loading={loading} onClick={() => void load()}>刷新状态</Button>
      <Tag>范围 {report?.scope?.length ?? 0} 个型号</Tag>
      <Tag>已绑定型号来源 {report?.coverage?.model_sources ?? 0}</Tag>
      <Tag color="orange">仅协议来源 {report?.coverage?.protocol_only ?? 0} · 缺少来源 {report?.coverage?.missing ?? 0}</Tag>
    </Space>
    <div className="app-workspace-scroll">
      <Collapse className="mb-3" items={[{ key: 'scope', label: '查看本次检测型号范围（已配置优先）', children:
        <Table<Record<string, any>> size="small" rowKey={row => row.provider + ':' + row.category + ':' + row.model} dataSource={report?.scope ?? []}
          pagination={{ pageSize: 8 }} columns={[{ title: '厂商', dataIndex: 'provider' }, { title: '型号', dataIndex: 'model' },
            { title: '类别', dataIndex: 'category' }, { title: '来源覆盖（不等于验收）', render: (_, row) => row.documentation_scope === 'model' ? '型号级文档' : row.documentation_scope === 'protocol_only' ? '仅类别/协议，型号待核验' : '待补来源' }, { title: '配置', render: (_, row) => row.configured_ids?.length ? '已配置' : '系统支持' }]} />
      }]} />
      <Table<Record<string, any>> rowKey="source" loading={loading} dataSource={report?.sources ?? []} pagination={{ pageSize: 8 }}
        columns={[
          { title: '官方来源', dataIndex: 'source', render: (url: string) => <a href={url} target="_blank" rel="noreferrer" className="break-all">{url}</a> },
          { title: '影响范围', render: (_, row) => [...new Set(row.targets?.map((target: any) => target.provider))].join('、') + ' · ' + (row.targets?.length ?? 0) + ' 个检测目标' },
          { title: '状态', render: (_, row) => <Tag color={row.fetch_status !== 'fetched' ? 'orange' : row.status === 'changed_requires_validation' ? 'red' : 'blue'}>
            {row.fetch_status === 'not_checked' ? '尚未检查' : row.fetch_status !== 'fetched' ? '读取失败，规则暂缓应用' : row.status === 'changed_requires_validation' ? '发现变化，待兼容验证' : '已建立文档基线'}</Tag> },
          { title: '协议规则', render: (_, row) => row.contract_validation === 'compatible'
            ? <Tag color="green">已知协议范围内兼容</Tag>
            : row.contract_validation === 'requires_adapter_review'
              ? <Tag color="orange">结构未匹配，需适配</Tag> : '仅文档检查' },
          { title: '核对时间', dataIndex: 'last_check', render: (value: string) => value ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '尚未检查' },
          { title: '查看', render: (_, row) => <Space direction="vertical">
            <Button onClick={() => setDiff((row.diff || row.message || '尚无版本差异') + '\n\n生效规则及检查结果：\n' + JSON.stringify({ price: row.effective_price_rule, contract: row.effective_contract_rule, pinned: row.rules_pinned, sources: row.targets, candidate_validation: row.candidate_validation }, null, 2))}>差异与规则</Button>
            {row.rules_pinned ? <Button onClick={() => void changeRules(row)}>恢复自动应用</Button> :
              [...(row.history ?? [])].reverse().filter((item: any) => item.price_rule || item.contract_rule).slice(0, 1).map((item: any) =>
                <Button key={item.sha256} onClick={() => Modal.confirm({ title: '回退到上一版已验证规则？',
                  content: '回退后固定该来源的规则，定时检查继续收集文档，不自动覆盖回退结果。', okText: '回退并固定',
                  onOk: () => changeRules(row, item.sha256) })}>回退规则</Button>)}
          </Space> },
        ]} />
    </div>
    <Modal open={diff !== null} onCancel={() => setDiff(null)} footer={null} width={900} title="官方来源变化">
      <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-all">{diff}</pre>
    </Modal>
  </div>
}
