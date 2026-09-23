import { useEffect, useState } from 'react'
import { Alert, Button, Descriptions, Drawer, Empty, Space, Spin, Tabs, Typography, message } from 'antd'
import { FilmService } from '../../../services/generated'

/** Dedicated diagnostics keep task cards light while preserving the exact historical inputs for feedback. */
export function TaskCallDetails({ taskId, onClose }: { taskId: string | null; onClose: () => void }) {
  const [data, setData] = useState<Record<string, any> | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [recovering, setRecovering] = useState(false)
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    if (!taskId) return
    let active = true
    setData(null); setError(''); setLoading(true)
    const request = FilmService.getTaskCallDetailsApiV1FilmTasksTaskIdCallDetailsGet({ taskId })
    request.then(result => { if (active) setData(result.data ?? null) })
      .catch(() => { if (active) setError('调用详情读取失败，请重试') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false; request.cancel() }
  }, [taskId, refresh])
  /** Export only the already-sanitized server response, never current provider credentials. */
  const exportDetails = () => {
    if (!data) return
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url; link.download = 'generation-' + taskId + '.json'; link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  /** Resume the original receipt; closing this drawer never cancels the queued work. */
  const resume = async () => {
    if (!taskId) return
    setRecovering(true)
    try {
      await FilmService.resumeGenerationRecoveryApiV1FilmTasksTaskIdRecoveryPost({ taskId })
      message.success('已安排恢复原任务，可关闭窗口继续其他工作')
      setRefresh(value => value + 1)
    } catch { message.error('恢复未能提交，请刷新查看当前状态；未发起新的生成') }
    finally { setRecovering(false) }
  }
  return <Drawer title="生成调用详情" open={Boolean(taskId)} onClose={onClose} width={900}
    extra={<Space><Button onClick={() => setRefresh(value => value + 1)} loading={loading}>刷新</Button>
      <Button disabled={!data} onClick={exportDetails}>导出脱敏记录</Button></Space>}>
    {loading ? <Spin /> : error ? <Alert type="error" message={error} /> : data ? <>
      <Descriptions column={2} bordered size="small" items={[
        { key: 'task', label: '任务', children: taskId },
        { key: 'provider', label: '厂商', children: data.identity?.provider_name ?? data.identity?.provider_key ?? '未记录' },
        { key: 'model', label: '型号', children: data.identity?.model_name ?? '未记录' },
        { key: 'status', label: '状态', children: data.status },
      ]} />
      <Alert className="my-3" type="info" showIcon message={data.notice} />
      {data.recovery && data.recovery.phase !== 'not_recorded' && <Alert className="my-3" type="info"
        message={data.recovery.phase === 'archiving' ? '厂商结果已保存 · 本地归档阶段' : data.recovery.phase === 'completed' ? '结果已归档' : '任务恢复记录'}
        description={data.recovery.notice}
        action={<Button disabled={!data.recovery.can_resume} loading={recovering} onClick={() => void resume()}>{data.recovery.action}</Button>} />}
      <Tabs items={[
        { key: 'prompt', label: '最终提示词', children: <Typography.Paragraph copyable style={{ whiteSpace: 'pre-wrap' }}>
          {data.snapshot?.execution_prompt ?? '未记录'}
        </Typography.Paragraph> },
        { key: 'inputs', label: '配置与参考素材', children: <pre className="whitespace-pre-wrap break-all">{JSON.stringify({ identity: data.identity, snapshot: data.snapshot }, null, 2)}</pre> },
        { key: 'calls', label: '实际请求与响应', children: data.calls?.length
          ? <pre className="whitespace-pre-wrap break-all">{JSON.stringify(data.calls, null, 2)}</pre>
          : <Empty description="尚无实际调用记录（历史任务不补造记录）" /> },
      ]} />
    </> : null}
  </Drawer>
}
