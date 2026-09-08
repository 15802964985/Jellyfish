import { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Card,
  Empty,
  Form,
  Input,
  Modal,
  Pagination,
  Select,
  Space,
  Tag,
  Upload,
  message,
} from 'antd'
import {
  AudioOutlined,
  DeleteOutlined,
  EditOutlined,
  InboxOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import type { AudioAssetCategory, AudioAssetRead } from '../../../../services/generated'
import { StudioFilesService, StudioMediaAssetsService } from '../../../../services/generated'
import { buildFileDownloadUrl } from '../utils'

const CATEGORY_OPTIONS: Array<{ value: AudioAssetCategory; label: string; color: string }> = [
  { value: 'voice', label: '角色配音', color: 'blue' },
  { value: 'narration', label: '旁白', color: 'purple' },
  { value: 'bgm', label: '背景音乐', color: 'cyan' },
  { value: 'ambient', label: '环境声', color: 'green' },
  { value: 'sfx', label: '音效', color: 'orange' },
  { value: 'transition', label: '转场音', color: 'magenta' },
]

type AudioForm = {
  name: string
  category: AudioAssetCategory
  description?: string
  transcript?: string
  tags?: string
}

function categoryMeta(category: AudioAssetCategory) {
  return CATEGORY_OPTIONS.find((item) => item.value === category) ?? CATEGORY_OPTIONS[0]
}

function formatBytes(size?: number) {
  if (!size) return '未知大小'
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

/** 配音与音效素材库：上传、试听、分页、编辑及受保护删除。 */
export function AudioAssetsTab() {
  const [form] = Form.useForm<AudioForm>()
  const [items, setItems] = useState<AudioAssetRead[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<AudioAssetCategory | undefined>()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(12)
  const [total, setTotal] = useState(0)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<AudioAssetRead | null>(null)
  const [uploadFile, setUploadFile] = useState<File | null>(null)

  const load = async (nextPage = page, nextPageSize = pageSize) => {
    setLoading(true)
    try {
      const response = await StudioMediaAssetsService.listAudioAssetsApiApiV1StudioMediaAssetsAudioAssetsGet({
        q: search.trim() || undefined,
        category,
        page: nextPage,
        pageSize: nextPageSize,
      })
      setItems(response.data?.items ?? [])
      setTotal(response.data?.pagination.total ?? 0)
    } catch {
      message.error('加载配音音效失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, category])

  const openCreate = () => {
    setEditing(null)
    setUploadFile(null)
    form.setFieldsValue({ category: 'sfx', name: '', description: '', transcript: '', tags: '' })
    setModalOpen(true)
  }

  const openEdit = (item: AudioAssetRead) => {
    setEditing(item)
    setUploadFile(null)
    form.setFieldsValue({
      name: item.name,
      category: item.category,
      description: item.description,
      transcript: item.transcript,
      tags: item.tags.join(', '),
    })
    setModalOpen(true)
  }

  const save = async () => {
    const values = await form.validateFields()
    setSaving(true)
    try {
      const tags = (values.tags ?? '')
        .split(/[,，\n]/)
        .map((value) => value.trim())
        .filter(Boolean)
      if (editing) {
        await StudioMediaAssetsService.updateAudioAssetApiApiV1StudioMediaAssetsAudioAssetsAudioAssetIdPatch({
          audioAssetId: editing.id,
          requestBody: { ...values, tags },
        })
      } else {
        if (!uploadFile) {
          message.warning('请选择音频文件')
          return
        }
        const uploaded = await StudioFilesService.uploadFileApiApiV1StudioFilesUploadPost({
          name: values.name.trim(),
          formData: { file: uploadFile as unknown as string },
        })
        if (!uploaded.data?.id) throw new Error('missing file id')
        await StudioMediaAssetsService.createAudioAssetApiApiV1StudioMediaAssetsAudioAssetsPost({
          requestBody: {
            name: values.name.trim(),
            category: values.category,
            file_id: uploaded.data.id,
            description: values.description?.trim() ?? '',
            transcript: values.transcript?.trim() ?? '',
            tags,
          },
        })
      }
      message.success(editing ? '音频素材已更新' : '音频素材已上传')
      setModalOpen(false)
      setPage(1)
      await load(1, pageSize)
    } catch {
      message.error(editing ? '更新音频素材失败' : '上传音频素材失败')
    } finally {
      setSaving(false)
    }
  }

  const headerHint = useMemo(
    () => (category ? `${categoryMeta(category).label} · ${total} 条` : `全部音频 · ${total} 条`),
    [category, total],
  )

  return (
    <Card
      title={<Space><AudioOutlined className="text-blue-500" /><span>配音音效</span><Tag>{headerHint}</Tag></Space>}
      extra={
        <Space wrap>
          <Input.Search
            allowClear
            value={search}
            placeholder="搜索名称、说明或台词"
            style={{ width: 240 }}
            onChange={(event) => setSearch(event.target.value)}
            onSearch={() => { setPage(1); void load(1, pageSize) }}
          />
          <Select
            allowClear
            value={category}
            placeholder="全部类型"
            options={CATEGORY_OPTIONS.map(({ value, label }) => ({ value, label }))}
            style={{ width: 130 }}
            onChange={(value) => { setCategory(value); setPage(1) }}
          />
          <Button icon={<ReloadOutlined />} onClick={() => void load()}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>上传音频</Button>
        </Space>
      }
    >
      {items.length === 0 && !loading ? (
        <Empty description="暂无配音或音效素材" />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => {
            const meta = categoryMeta(item.category)
            return (
              <div key={item.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="flex items-start justify-between gap-3 bg-gradient-to-r from-slate-50 to-blue-50 px-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-slate-900">{item.name}</div>
                    <div className="mt-1 text-xs text-slate-500">{item.file.original_name || item.file.name} · {formatBytes(item.file.size_bytes)}</div>
                  </div>
                  <Tag color={meta.color}>{meta.label}</Tag>
                </div>
                <div className="space-y-3 px-4 py-3">
                  <audio className="h-9 w-full" controls preload="metadata" src={buildFileDownloadUrl(item.file_id)} />
                  <div className="min-h-10 text-sm text-slate-600 line-clamp-2">
                    {item.transcript || item.description || '未填写台词或素材说明'}
                  </div>
                  <div className="flex min-h-6 flex-wrap gap-1">
                    {item.tags.slice(0, 5).map((tag) => <Tag key={tag}>{tag}</Tag>)}
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                    <span className="text-xs text-slate-500">已用于 {item.usage_count ?? 0} 条音轨</span>
                    <Space>
                      <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(item)}>编辑</Button>
                      <Button
                        danger
                        size="small"
                        icon={<DeleteOutlined />}
                        disabled={(item.usage_count ?? 0) > 0}
                        onClick={() => Modal.confirm({
                          title: `删除「${item.name}」？`,
                          content: '仅删除音频资产记录，底层上传文件仍保留在文件管理。',
                          okText: '删除',
                          cancelText: '取消',
                          okButtonProps: { danger: true },
                          onOk: async () => {
                            await StudioMediaAssetsService.deleteAudioAssetApiApiV1StudioMediaAssetsAudioAssetsAudioAssetIdDelete({ audioAssetId: item.id })
                            message.success('音频资产已删除')
                            await load()
                          },
                        })}
                      />
                    </Space>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="sticky bottom-0 mt-4 flex justify-end border-t border-slate-100 bg-white/95 py-3 backdrop-blur">
        <Pagination
          current={page}
          pageSize={pageSize}
          total={total}
          showSizeChanger
          showTotal={(value) => `共 ${value} 条`}
          onChange={(next, size) => { setPage(next); setPageSize(size) }}
        />
      </div>

      <Modal
        title={editing ? '编辑音频素材' : '上传配音 / 音效'}
        open={modalOpen}
        width={680}
        okText={editing ? '保存' : '上传并创建'}
        confirmLoading={saving}
        onOk={() => void save()}
        onCancel={() => setModalOpen(false)}
      >
        <Form form={form} layout="vertical" className="pt-3">
          {!editing && (
            <Form.Item label="音频文件" required>
              <Upload.Dragger
                accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac"
                maxCount={1}
                beforeUpload={(file) => {
                  // accept is only a picker hint: drag/drop can still supply videos.
                  if (!/\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(file.name)) {
                    message.error('请选择 MP3、WAV、M4A、AAC、OGG 或 FLAC 音频；MP4 视频请先提取音轨后上传')
                    return Upload.LIST_IGNORE
                  }
                  if (file.size > 500 * 1024 * 1024) {
                    message.error('音频文件不能超过 500MB')
                    return Upload.LIST_IGNORE
                  }
                  setUploadFile(file)
                  return false
                }}
                onRemove={() => setUploadFile(null)}
              >
                <p className="ant-upload-drag-icon"><InboxOutlined /></p>
                <p className="ant-upload-text">拖入音频，或点击选择文件</p>
                <p className="ant-upload-hint">支持 MP3、WAV、M4A、AAC、OGG、FLAC，单文件最大 500MB</p>
              </Upload.Dragger>
            </Form.Item>
          )}
          <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2">
            <Form.Item name="name" label="素材名称" rules={[{ required: true, message: '请输入素材名称' }]}>
              <Input placeholder="例如：雨夜街道环境声" />
            </Form.Item>
            <Form.Item name="category" label="音频类型" rules={[{ required: true, message: '请选择音频类型' }]}>
              <Select options={CATEGORY_OPTIONS.map(({ value, label }) => ({ value, label }))} />
            </Form.Item>
          </div>
          <Form.Item name="description" label="使用说明"><Input.TextArea rows={2} placeholder="适用场景、情绪、节奏等" /></Form.Item>
          <Form.Item name="transcript" label="台词 / 文字内容"><Input.TextArea rows={3} placeholder="配音或旁白可填写对应文本，纯音效可留空" /></Form.Item>
          <Form.Item name="tags" label="标签"><Input placeholder="紧张, 雨声, 夜景（逗号分隔）" /></Form.Item>
        </Form>
      </Modal>
    </Card>
  )
}
