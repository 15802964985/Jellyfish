import { useEffect, useState } from 'react'
import { Button, Card, Col, Form, Input, Modal, Pagination, Row, Select, Space, Tag, Upload, message } from 'antd'
import { AudioOutlined, DeleteOutlined, DownloadOutlined, EditOutlined, FileImageOutlined, FileTextOutlined, UploadOutlined, VideoCameraOutlined } from '@ant-design/icons'
import { StudioFilesService } from '../../../services/generated'
import type { FileRead, FileTypeEnum } from '../../../services/generated'
import { buildFileDownloadUrl } from '../assets/utils'

const PAGE_SIZE_OPTIONS = [12, 24, 48, 96]

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
  const [form] = Form.useForm<{ name: string; tags: string[] }>()

  const load = async () => {
    setLoading(true)
    try {
      const response = await StudioFilesService.listFilesApiApiV1StudioFilesGet({
        q: query || null, order: 'updated_at', isDesc: true, page, pageSize, fileType,
      })
      setFiles(response.data?.items ?? [])
      setTotal(response.data?.pagination?.total ?? 0)
    } catch {
      setFiles([])
      setTotal(0)
      message.error('加载文件失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, query, fileType])

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

  const openEdit = (file: FileRead) => {
    setEditing(file)
    form.setFieldsValue({ name: file.name, tags: file.tags ?? [] })
  }

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

  const deleteFile = (file: FileRead) => {
    Modal.confirm({
      title: `删除文件「${file.name}」？`,
      content: '将同时删除对象存储中的文件。已经被分镜或生成结果引用的文件请谨慎删除。',
      okText: '确认删除', cancelText: '取消', okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await StudioFilesService.deleteFileApiApiV1StudioFilesFileIdDelete({ fileId: file.id })
          setFiles((prev) => prev.filter((item) => item.id !== file.id))
          setTotal((prev) => Math.max(0, prev - 1))
          message.success('文件已删除')
          if (files.length === 1 && page > 1) setPage(page - 1)
          else await load()
        } catch {
          message.error('文件删除失败')
        }
      },
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
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

      <Card title="文件列表" loading={loading}>
        <Row gutter={[16, 16]}>
          {files.map((file) => {
            const url = buildFileDownloadUrl(file.id)
            const typeMeta: Record<FileTypeEnum, { label: string; color: string }> = {
              image: { label: '图片', color: 'blue' },
              video: { label: '视频', color: 'purple' },
              audio: { label: '音频', color: 'cyan' },
              document: { label: '文档', color: 'gold' },
            }
            const meta = typeMeta[file.type]
            const cover = file.type === 'image'
              ? <img src={url} alt={file.name} className="h-32 w-full object-cover bg-gray-100" />
              : file.type === 'video'
                ? <video src={url} controls preload="metadata" className="h-32 w-full bg-slate-950 object-contain" />
                : file.type === 'audio'
                  ? <div className="flex h-32 items-center bg-gradient-to-br from-blue-50 to-slate-100 px-3"><audio src={url} controls preload="metadata" className="w-full" /></div>
                  : <div className="flex h-32 flex-col items-center justify-center gap-2 bg-slate-50 text-slate-500"><FileTextOutlined className="text-4xl" /><span className="max-w-[90%] truncate text-xs">{file.original_name || file.name}</span></div>
            return (
              <Col xs={24} sm={12} md={8} lg={6} key={file.id}>
                <Card
                  size="small"
                  cover={cover}
                  actions={[
                    <Button key="download" type="text" icon={<DownloadOutlined />} onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}>下载</Button>,
                    <Button key="edit" type="text" icon={<EditOutlined />} onClick={() => openEdit(file)}>编辑</Button>,
                    <Button key="delete" type="text" danger icon={<DeleteOutlined />} onClick={() => deleteFile(file)}>删除</Button>,
                  ]}
                >
                  <div className="font-medium truncate" title={file.name}>{file.name}</div>
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
        {total > 0 ? (
          <div className="mt-5 flex justify-end">
            <Pagination
              current={page} pageSize={pageSize} total={total} showSizeChanger
              pageSizeOptions={PAGE_SIZE_OPTIONS} showTotal={(count) => `共 ${count} 个文件`}
              onChange={(nextPage, nextSize) => {
                setPage(nextSize !== pageSize ? 1 : nextPage)
                setPageSize(nextSize)
              }}
            />
          </div>
        ) : null}
      </Card>

      <Modal title="编辑文件信息" open={editing !== null} onCancel={() => setEditing(null)} onOk={() => void saveEdit()} confirmLoading={saving} okText="保存">
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="文件名称" rules={[{ required: true, message: '请输入文件名称' }]}><Input /></Form.Item>
          <Form.Item name="tags" label="标签"><Select mode="tags" tokenSeparators={[',', '，']} open={false} placeholder="输入标签后按回车" /></Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
