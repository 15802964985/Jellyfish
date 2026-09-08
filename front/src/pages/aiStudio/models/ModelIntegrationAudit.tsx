import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Modal, Space, Spin, Tag } from 'antd'
import { LlmService } from '../../../services/generated/services/LlmService'
import type { DocumentationEvidence, ModelIntegrationAuditRead, ModelRead } from '../../../services/generated'

/** Configuration diagnostics are separate from paid tests and per-model certification. */
export default function ModelIntegrationAudit({ model, onClose }: { model: ModelRead | null; onClose: () => void }) {
  const [report, setReport] = useState<ModelIntegrationAuditRead | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [revision, setRevision] = useState(0)
  const [evidence, setEvidence] = useState<DocumentationEvidence | null>(null)
  const [reading, setReading] = useState(false)
  const evidenceRequest = useRef<ReturnType<typeof LlmService.getModelOfficialDocumentationApiV1LlmModelsModelIdOfficialDocumentationGet> | null>(null)
  useEffect(() => {
    setEvidence(null)
    setReading(false)
    return () => { evidenceRequest.current?.cancel(); evidenceRequest.current = null }
  }, [model])

  /** Explicit public-document fetch, independent of paid model execution. */
  const readOfficialDocument = async () => {
    if (!model || reading) return
    setReading(true)
    setError('')
    const request = LlmService.getModelOfficialDocumentationApiV1LlmModelsModelIdOfficialDocumentationGet({ modelId: model.id })
    evidenceRequest.current = request
    try {
      const response = await request
      if (evidenceRequest.current === request) setEvidence(response.data ?? null)
    } catch {
      if (evidenceRequest.current === request) setError('官方文档读取失败，可打开官网人工核对。')
    } finally {
      if (evidenceRequest.current === request) { setReading(false); evidenceRequest.current = null }
    }
  }
  useEffect(() => {
    setReport(null)
    setError('')
    if (!model) return
    let active = true
    setLoading(true)
    const request = LlmService.getModelIntegrationAuditApiV1LlmModelsModelIdIntegrationAuditGet({ modelId: model.id })
    void request.then((result) => {
      if (active) setReport(result.data ?? null)
    }).catch(() => {
      if (active) setError('核查读取失败，请重试。未调用生成接口。')
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false; request.cancel() }
  }, [model, revision])
  return (
    <Modal title={`模型接入核查 · ${model?.name ?? ''}`} open={!!model} onCancel={onClose} width={720}
      footer={<Space><Button disabled={loading} onClick={() => setRevision((value) => value + 1)}>重新核查配置</Button><Button onClick={onClose}>关闭</Button></Space>}>
      <Alert type="info" showIcon message="配置诊断与官网正文读取，不是生成测试" description="读取官网不调用模型，不外发密钥或剧本。正文读取成功不等于兼容核验通过；AI 语义比对、证据历史与真实验收记录仍在开发。" />
      <Spin spinning={loading}>
        {error && <Alert className="mt-3" type="error" message={error} />}
        {report && <div className="mt-4 space-y-3">
          <Space wrap><Tag color={report.adapter_registered ? 'blue' : 'red'}>{report.adapter_registered ? '已注册类别适配器' : '类别适配缺失'}</Tag><Tag color="orange">官方契约待核对</Tag><Tag>未读取真实业务验收记录</Tag></Space>
          <div className="break-all">当前端点：{report.endpoint}</div>
          <div>核查时间：{new Date(report.checked_at).toLocaleString()}</div>
          {report.official_documentation && <a href={report.official_documentation} target="_blank" rel="noopener noreferrer">打开供应商官方 API 文档</a>}
          <div><Button loading={reading} disabled={!report.official_documentation} onClick={() => void readOfficialDocument()}>读取官方正文</Button></div>
          {evidence && <div className="space-y-2">
            <Alert type={evidence.status === 'fetched' ? 'info' : 'warning'} message={evidence.message} />
            <div>获取时间：{new Date(evidence.fetched_at).toLocaleString()}</div>
            {evidence.content_sha256 && <div className="text-xs break-all">正文 SHA256：{evidence.content_sha256}</div>}
            {evidence.text && <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words border rounded p-2 text-xs">{evidence.text}</pre>}
          </div>}
          <Alert type="warning" message="配置风险与核验边界" description={<ul className="pl-4 list-disc">{report.issues?.map((item) => <li key={item}>{item}</li>)}</ul>} />
          <div>对应业务验收清单：</div>
          <ul className="pl-4 list-disc">{report.business_checks?.map((item) => <li key={item}>{item}</li>)}</ul>
        </div>}
      </Spin>
    </Modal>
  )
}
