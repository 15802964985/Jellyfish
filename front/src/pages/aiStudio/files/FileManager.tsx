import { PreviewImage } from '../../../components/PreviewImage'
import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Card, Col, Form, Input, Modal, Pagination, Row, Select, Space, Tag, Upload, message } from 'antd'
import { AudioOutlined, DeleteOutlined, DownloadOutlined, EditOutlined, FileImageOutlined, FileTextOutlined, UploadOutlined, VideoCameraOutlined } from '@ant-design/icons'
import { StudioFilesService } from '../../../services/generated'
import type { FileDeleteImpactRead, FileRead, FileTypeEnum } from '../../../services/generated'
import { buildFileDownloadUrl, buildFilePreviewUrl } from '../assets/utils'
import { FilePreviewModal } from './FilePreviewModal'

const PAGE_SIZE_OPTIONS = [12, 24, 48, 96]

/** 保留后端明确的关联冲突原因，不用泛化失败提示掩盖它。 */
function fileError(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'body' in error) {
    const body = error.body as { message?: string; detail?: string } | undefined
    return body?.message || body?.detail || fallback
  }
  return error instanceof Error ? error.message : fallback
}

/** 全局文件管理与资产选择共用数据库文件库，提供查询、预览、编辑及安全删除。 */
export default function FileManager() {
  const [files, setFiles] = useState<FileRead[]>([])
  const [loading, setLoading] = useState(true)
  const [searchInput, setSearchInput] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(12)
  const [total, setTotal] = useState(0)
  const [editing, setEditing] = useState<FileRead | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [fileType, setFileType] = useState<FileTypeEnum | undefined>()
  const [previewFile, setPreviewFile] = useState<FileRead | null>(null)
  const [inspecting, setInspecting] = useState<FileRead | null>(null)
  const [impact, setImpact] = useState<FileDeleteImpactRead | null>(null)
  const [impactLoading, setImpactLoading] = useState(false)
  const [impactError, setImpactError] = useState('')
  const [deleteMode, setDeleteMode] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [loadError, setLoadError] = useState('')
  const impactRequest = useRef(0)
  const listRequest = useRef(0)
  useEffect(() => () => { impactRequest.current += 1; listRequest.current += 1 }, [])
  const [form] = Form.useForm<{ name: string; tags: string[] }>()

  /** 翻页/筛选时丢弃旧响应，加载失败保留明确提示。 */
  const load = async () => {
    const request = ++listRequest.current
    setLoadError('')
    setLoading(true)
    try {
      const response = await StudioFilesService.listFilesApiApiV1StudioFilesGet({
        q: query || null, order: 'updated_at', isDesc: true, page, pageSize, fileType,
      })
      if (request !== listRequest.current) return
      setFiles(response.data?.items ?? [])
      setTotal(response.data?.pagination?.total ?? 0)
    } catch {
      if (request !== listRequest.current) return
      setLoadError('加载文件失败，请点击刷新重试')
      setFiles([])
      setTotal(0)
      message.error('加载文件失败')
    } finally {
      if (request === listRequest.current) setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, query, fileType])

  /** 上传仅进入全局文件库，不自动关联业务。 */
  const uploadFile = async (file: File) => {
    setUploading(true)
    try {
      await StudioFilesService.uploadFileApiApiV1StudioFilesUploadPost({
        name: file.name.replace(/\.[^.]+$/, ''),
        formData: { file: file as unknown as string },
      })
      message.success('文件已上传')
      setPage(1)
      await load()
    } catch {
      message.error('文件上传失败')
    } finally {
      setUploading(false)
    }
    return false
  }

  /** 打开文件名称和标签编辑表单。 */
  const openEdit = (file: FileRead) => {
    setEditing(file)
    form.setFieldsValue({ name: file.name, tags: file.tags ?? [] })
  }

  /** 保存元信息并刷新列表，不修改文件内容。 */
  const saveEdit = async () => {
    if (!editing) return
    try {
      const values = await form.validateFields()
      setSaving(true)
      const response = await StudioFilesService.updateFileMetaApiV1StudioFilesFileIdPatch({
        fileId: editing.id,
        requestBody: { name: values.name.trim(), tags: values.tags ?? [] },
      })
      const saved = response.data
      if (saved) setFiles((prev) => prev.map((item) => (item.id === saved.id ? saved : item)))
      setEditing(null)
      message.success('文件信息已更新')
      await load()
    } catch (error) {
      if (error && typeof error === 'object' && 'errorFields' in error) return
      message.error('文件信息更新失败')
    } finally {
      setSaving(false)
    }
  }

  /** 只读查询关联；失败时禁用删除，关闭后忽略迟到响应。 */
  const inspectFile = async (file: FileRead, forDelete = false) => {
    const request = ++impactRequest.current
    setInspecting(file); setDeleteMode(forDelete); setImpact(null); setImpactError(''); setImpactLoading(true)
    try {
      const response = await StudioFilesService.getFileDeleteImpactApiApiV1StudioFilesFileIdDeleteImpactGet({ fileId: file.id })
      if (request !== impactRequest.current) return
      if (!response.data) throw new Error('未返回文件关联检查结果')
      setImpact(response.data)
    } catch (error) {
      if (request === impactRequest.current) setImpactError(fileError(error, '关联检查失败，暂不能删除'))
    } finally {
      if (request === impactRequest.current) setImpactLoading(false)
    }
  }

  /** 人工确认后删除；后端重新检查关系，不信任先前的检查结果。 */
  const deleteFile = async () => {
    if (!inspecting || !impact?.can_delete || impactLoading) return
    setDeleting(true)
    try {
      await StudioFilesService.deleteFileApiApiV1StudioFilesFileIdDelete({ fileId: inspecting.id })
      setInspecting(null); setImpact(null)
      message.success('文件已删除')
      if (files.length === 1 && page > 1) setPage(page - 1)
      else await load()
    } catch (error) {
      const reason = fileError(error, '删除失败，请重新检查关联后重试')
      await inspectFile(inspecting, true)
      message.error(reason)
    } finally { setDeleting(false) }
  }

  return (
    <div className="app-workspace gap-3 overflow-hidden">
      <Alert className="shrink-0" type="info" showIcon message="全局文件管理"
        description="查询数据库中的上传与生成文件，包含未关联素材。删除前检查业务引用；正在使用的文件须先在对应业务中处理关联。" />
      {loadError && <Alert className="shrink-0" type="error" showIcon message={loadError} />}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <Input.Search
          placeholder="搜索文件名称" allowClear className="max-w-sm" value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          onSearch={(value) => { setPage(1); setQuery(value.trim()) }}
        />
        <Space wrap>
          <Select
            allowClear
            placeholder="全部类型"
            style={{ width: 130 }}
            value={fileType}
            options={[
              { value: 'image', label: '图片' },
              { value: 'video', label: '视频' },
              { value: 'audio', label: '音频' },
              { value: 'document', label: '文档' },
            ]}
            onChange={(value) => { setFileType(value); setPage(1) }}
          />
          <Button onClick={() => void load()} loading={loading}>刷新</Button>
          <Upload
            accept="image/*,video/*,audio/*,.txt,.md,.markdown,.pdf,.docx"
            showUploadList={false}
            beforeUpload={(file) => { void uploadFile(file); return false }}
          >
            <Button type="primary" icon={<UploadOutlined />} loading={uploading}>上传文件</Button>
          </Upload>
        </Space>
      </div>

      {/* 限制列表高度并独立滚动，筛选与分页不随素材卡片滚出视口。 */}
      <Card className="app-fill-card overflow-hidden"
        bodyStyle={{ display: 'block', overflowY: 'auto', overscrollBehavior: 'contain' }}
        title={'文件列表（共 ' + total + ' 个）'} loading={loading}>
        <Row gutter={[16, 16]}>
          {files.map((file) => {
            const url = buildFileDownloadUrl(file.id)
            const previewUrl = buildFilePreviewUrl(file.id)
            const typeMeta: Record<FileTypeEnum, { label: string; color: string }> = {
              image: { label: '图片', color: 'blue' },
              video: { label: '视频', color: 'purple' },
              audio: { label: '音频', color: 'cyan' },
              document: { label: '文档', color: 'gold' },
            }
            const meta = typeMeta[file.type]
            const cover = file.type === 'image'
              ? <button type="button" className="block w-full" onClick={() => setPreviewFile(file)}><PreviewImage src={previewUrl} alt={file.name} className="h-32 w-full bg-gray-100 object-contain p-1" /></button>
              : file.type === 'video'
                ? <video src={previewUrl} controls preload="metadata" className="h-32 w-full bg-slate-950 object-contain" onDoubleClick={() => setPreviewFile(file)} />
                : file.type === 'audio'
                  ? <div className="flex h-32 items-center bg-gradient-to-br from-blue-50 to-slate-100 px-3"><audio src={previewUrl} controls preload="metadata" className="w-full" /></div>
                  : <button type="button" className="flex h-32 w-full flex-col items-center justify-center gap-2 bg-slate-50 text-slate-500" onClick={() => setPreviewFile(file)}><FileTextOutlined className="text-4xl" /><span className="max-w-[90%] truncate text-xs">{file.original_name || file.name}</span><span className="text-blue-600">点击预览</span></button>
            return (
              <Col xs={24} sm={12} md={8} lg={6} key={file.id}>
                <Card
                  size="small"
                  cover={cover}
                  actions={[
                    <Button key="download" type="text" icon={<DownloadOutlined />} onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}>下载</Button>,
                    <Button key="edit" type="text" icon={<EditOutlined />} onClick={() => openEdit(file)}>编辑</Button>,
                    <Button key="delete" type="text" danger icon={<DeleteOutlined />} onClick={() => void inspectFile(file, true)}>删除</Button>,
                  ]}
                >
                  <div className="font-medium truncate" title={file.name}>{file.name}</div>
                  <div className="mt-1 truncate text-xs text-gray-500" title={file.original_name}>{file.original_name}</div>
                  <div className="mt-1 text-xs text-gray-500">{((file.size_bytes || 0) / 1024 / 1024).toFixed(1)} MB</div>
                  <Button type="link" className="px-0" onClick={() => void inspectFile(file)}>查看关联</Button>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <Tag color={meta.color}>{meta.label}</Tag>
                    {(file.tags ?? []).slice(0, 4).map((tag) => <Tag key={tag}>{tag}</Tag>)}
                  </div>
                  {!url ? (file.type === 'audio' ? <AudioOutlined /> : file.type === 'video' ? <VideoCameraOutlined /> : <FileImageOutlined />) : null}
                </Card>
              </Col>
            )
          })}
        </Row>
        {!loading && files.length === 0 ? <div className="text-center text-gray-500 py-10">暂无文件</div> : null}
      </Card>
      {/* 分页作为独立底栏，即使列表加载或为空也保留位置。 */}
      <nav aria-label="文件列表分页" className="flex shrink-0 justify-end rounded-lg border border-gray-200 bg-white px-4 py-3">
        <Pagination
          className="flex flex-wrap justify-end gap-y-2"
          current={page} pageSize={pageSize} total={total} showSizeChanger responsive
          pageSizeOptions={PAGE_SIZE_OPTIONS} showTotal={(count) => `共 ${count} 个文件`}
          onChange={(nextPage, nextSize) => {
            setPage(nextSize !== pageSize ? 1 : nextPage)
            setPageSize(nextSize)
          }}
        />
      </nav>

      <Modal title="编辑文件信息" open={editing !== null} onCancel={() => setEditing(null)} onOk={() => void saveEdit()} confirmLoading={saving} okText="保存">
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="文件名称" rules={[{ required: true, message: '请输入文件名称' }]}><Input /></Form.Item>
          <Form.Item name="tags" label="标签"><Select mode="tags" tokenSeparators={[',', '，']} open={false} placeholder="输入标签后按回车" /></Form.Item>
        </Form>
      </Modal>
      <Modal title={deleteMode ? '删除前检查文件关联' : '文件关联详情'} open={Boolean(inspecting)}
        onCancel={() => { if (!deleting) { impactRequest.current += 1; setInspecting(null) } }}
        closable={!deleting} maskClosable={!deleting} width={760}
        footer={<Space><Button disabled={deleting} onClick={() => { impactRequest.current += 1; setInspecting(null) }}>关闭</Button>
          {deleteMode && <Button danger type="primary" loading={deleting}
            disabled={impactLoading || !impact?.can_delete || Boolean(impactError)} onClick={() => void deleteFile()}>确认永久删除</Button>}
        </Space>}>
        <p className="font-medium">{inspecting?.name}</p>
        {impactLoading ? <p>正在查询关联，完成前不能删除…</p> :
          impactError ? <Alert type="error" showIcon message={impactError}
            action={<Button onClick={() => inspecting && void inspectFile(inspecting, deleteMode)}>重试检查</Button>} /> :
          impact && <>
            <Alert showIcon type={impact.can_delete ? 'warning' : 'info'}
              message={impact.can_delete ? '当前未发现业务引用' : '文件被使用，共 ' + impact.reference_count + ' 条引用，不能删除'}
              description={impact.can_delete ? '确认删除后将移除数据库记录和存储原文件，无法通过此页面撤销。删除时还会重新检查。' : '请先在对应资产、分镜、任务或历史业务中处理关联；本页面不会自动解除关系。'} />
            <div className="max-h-80 overflow-y-auto">
              {(impact.groups || []).map(group => <section key={group.kind} className="mt-3">
                <h4>{group.label}（{group.count} 条）</h4>
                <ul className="space-y-1 pl-5">{(group.items || []).map((item, index) => <li key={index} className="break-all">{item}</li>)}</ul>
                {group.count > (group.items || []).length && <p>仅展示前 {(group.items || []).length} 条，仍有其他关联。</p>}
              </section>)}
            </div>
          </>}
      </Modal>
      <FilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
    </div>
  )
}
