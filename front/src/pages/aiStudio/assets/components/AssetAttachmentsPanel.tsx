import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Checkbox, Empty, Input, Modal, Select, Space, Switch, Tag, Upload, message } from 'antd'
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
  FileTextOutlined,
  InboxOutlined,
  StarFilled,
  StarOutlined,
} from '@ant-design/icons'
import type { AssetFileLinkRead, FileRead } from '../../../../services/generated'
import { StudioFilesService, StudioMediaAssetsService } from '../../../../services/generated'
import { buildFileDownloadUrl } from '../utils'

const ROLE_OPTIONS: Record<string, Array<{ value: string; label: string }>> = {
  actor: [
    { value: 'front_portrait', label: '正面照' },
    { value: 'side_portrait', label: '侧脸照' },
    { value: 'full_body', label: '全身照' },
    { value: 'expression', label: '表情参考' },
    { value: 'action_reference', label: '动作参考' },
    { value: 'voice_sample', label: '声音样本' },
    { value: 'profile_document', label: '人物设定文档' },
  ],
  character: [
    { value: 'identity_reference', label: '身份参考' },
    { value: 'appearance_reference', label: '外形参考' },
    { value: 'expression', label: '表情参考' },
    { value: 'profile_document', label: '角色设定文档' },
  ],
  scene: [
    { value: 'panorama', label: '场景全景' },
    { value: 'local_environment', label: '局部环境' },
    { value: 'lighting_reference', label: '灯光色调' },
    { value: 'background_video', label: '背景视频' },
    { value: 'setting_document', label: '场景设定文档' },
  ],
  prop: [
    { value: 'front', label: '正面参考' },
    { value: 'side', label: '侧面参考' },
    { value: 'back', label: '背面参考' },
    { value: 'detail', label: '细节照片' },
    { value: 'usage_reference', label: '使用方式' },
    { value: 'setting_document', label: '道具设定文档' },
  ],
  costume: [
    { value: 'front', label: '正面参考' },
    { value: 'side', label: '侧面参考' },
    { value: 'back', label: '背面参考' },
    { value: 'detail', label: '细节照片' },
    { value: 'wearing_reference', label: '服装穿着参考' },
    { value: 'setting_document', label: '服装设定文档' },
  ],
}

function preview(file: FileRead) {
  const src = buildFileDownloadUrl(file.id)
  if (file.type === 'image') {
    return <img src={src} alt={file.name} className="h-36 w-full object-cover" />
  }
  if (file.type === 'video') {
    return <video src={src} className="h-36 w-full bg-slate-950 object-contain" controls preload="metadata" />
  }
  if (file.type === 'audio') {
    return <div className="flex h-36 items-center bg-gradient-to-br from-blue-50 to-slate-100 px-3"><audio src={src} controls preload="metadata" className="w-full" /></div>
  }
  return (
    <a href={src} className="flex h-36 flex-col items-center justify-center gap-2 bg-slate-50 text-blue-600">
      <FileTextOutlined className="text-4xl" />
      <span className="max-w-[90%] truncate text-sm">{file.original_name || file.name}</span>
    </a>
  )
}

/** 资产的富媒体附件区；启用关联是推荐输入，不是生成前置条件。 */
export function AssetAttachmentsPanel({ entityType, entityId }: { entityType: string; entityId: string }) {
  const [links, setLinks] = useState<AssetFileLinkRead[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [associateAfterUpload, setAssociateAfterUpload] = useState(false)
  const [role, setRole] = useState('attachment')
  const [note, setNote] = useState('')
  const roles = useMemo(() => ROLE_OPTIONS[entityType] ?? [{ value: 'attachment', label: '通用附件' }], [entityType])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await StudioMediaAssetsService.listAssetFilesApiApiV1StudioMediaAssetsAssetFilesEntityTypeEntityIdGet({ entityType, entityId })
      setLinks(response.data ?? [])
    } catch {
      message.error('加载关联素材失败')
    } finally {
      setLoading(false)
    }
  }, [entityId, entityType])

  useEffect(() => { void load() }, [load])

  const patchLink = async (link: AssetFileLinkRead, body: { enabled?: boolean; is_primary?: boolean; sort_index?: number }) => {
    try {
      await StudioMediaAssetsService.updateAssetFileApiApiV1StudioMediaAssetsAssetFilesLinkIdPatch({ linkId: link.id, requestBody: body })
      await load()
    } catch {
      message.error('更新素材设置失败')
    }
  }

  const submitUpload = async () => {
    if (!uploadFile) {
      message.warning('请选择要上传的素材文件')
      return
    }
    setUploading(true)
    try {
      const uploaded = await StudioFilesService.uploadFileApiApiV1StudioFilesUploadPost({
        name: uploadFile.name.replace(/\.[^.]+$/, ''),
        formData: { file: uploadFile as unknown as string },
      })
      if (!uploaded.data?.id) throw new Error('missing file id')
      if (associateAfterUpload) {
        await StudioMediaAssetsService.createAssetFileApiApiV1StudioMediaAssetsAssetFilesEntityTypeEntityIdPost({
          entityType,
          entityId,
          requestBody: {
            file_id: uploaded.data.id,
            resource_role: role,
            note: note.trim(),
            sort_index: links.length,
            enabled: true,
            is_primary: uploaded.data.type === 'image' && links.every((link) => link.file.type !== 'image'),
          },
        })
      }
      message.success(associateAfterUpload ? '素材已上传并关联' : '素材已上传，可在文件管理中使用')
      setModalOpen(false)
      setUploadFile(null)
      setNote('')
      if (associateAfterUpload) await load()
    } catch (error) {
      const detail = (error as { body?: { detail?: string }; message?: string })?.body?.detail
        ?? (error instanceof Error ? error.message : '')
      message.error(`${associateAfterUpload ? '上传并关联' : '上传'}素材失败${detail ? `：${detail}` : ''}`)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-100 bg-blue-50/70 px-4 py-3">
        <div>
          <div className="font-medium text-slate-900">素材会智能参与生成建议</div>
          <div className="mt-1 text-xs text-slate-600">关联完全可选；未关联时继续按文字生成。启用的图片会优先作为镜头参考候选，视频、文档和音频保留为上下文素材。</div>
        </div>
        <Button type="primary" onClick={() => { setRole(roles[0]?.value ?? 'attachment'); setAssociateAfterUpload(false); setModalOpen(true) }}>上传素材</Button>
      </div>

      {links.length === 0 && !loading ? (
        <Empty description="尚未关联照片、视频、文档或音频" />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {links.map((link, index) => (
            <div key={link.id} className={`overflow-hidden rounded-xl border bg-white ${link.enabled ? 'border-slate-200' : 'border-dashed border-slate-300 opacity-65'}`}>
              {preview(link.file)}
              <div className="space-y-2 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 truncate font-medium text-slate-900">{link.file.name}</div>
                  <Tag>{roles.find((item) => item.value === link.resource_role)?.label ?? link.resource_role}</Tag>
                </div>
                {link.note && <div className="line-clamp-2 min-h-8 text-xs text-slate-500">{link.note}</div>}
                <div className="flex items-center justify-between border-t border-slate-100 pt-2">
                  <Space size={4}>
                    <Switch size="small" checked={link.enabled} onChange={(enabled) => void patchLink(link, { enabled })} />
                    <span className="text-xs text-slate-500">参与推荐</span>
                  </Space>
                  <Space size={2}>
                    {link.file.type === 'image' && (
                      <Button
                        type="text"
                        size="small"
                        title={link.is_primary ? '主参考图' : '设为主参考图'}
                        icon={link.is_primary ? <StarFilled className="text-amber-500" /> : <StarOutlined />}
                        onClick={() => void patchLink(link, { is_primary: true })}
                      />
                    )}
                    <Button type="text" size="small" disabled={index === 0} icon={<ArrowUpOutlined />} onClick={() => void patchLink(link, { sort_index: Math.max(0, link.sort_index - 1) })} />
                    <Button type="text" size="small" disabled={index === links.length - 1} icon={<ArrowDownOutlined />} onClick={() => void patchLink(link, { sort_index: link.sort_index + 1 })} />
                    <Button
                      danger
                      type="text"
                      size="small"
                      icon={<DeleteOutlined />}
                      onClick={() => Modal.confirm({
                        title: '解除素材关联？',
                        content: '只解除与当前资产的关联，文件仍保留在文件管理中。',
                        okText: '解除',
                        cancelText: '取消',
                        okButtonProps: { danger: true },
                        onOk: async () => {
                          await StudioMediaAssetsService.deleteAssetFileApiApiV1StudioMediaAssetsAssetFilesLinkIdDelete({ linkId: link.id })
                          await load()
                        },
                      })}
                    />
                  </Space>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        title="上传素材"
        open={modalOpen}
        width={680}
        okText={associateAfterUpload ? '上传并关联' : '仅上传'}
        confirmLoading={uploading}
        onOk={() => void submitUpload()}
        onCancel={() => setModalOpen(false)}
      >
        <div className="space-y-4 pt-3">
          <Upload.Dragger
            accept="image/*,video/*,audio/*,.txt,.md,.markdown,.pdf,.docx"
            maxCount={1}
            beforeUpload={(file) => { setUploadFile(file); return false }}
            onRemove={() => setUploadFile(null)}
          >
            <p className="ant-upload-drag-icon"><InboxOutlined /></p>
            <p className="ant-upload-text">拖入照片、视频、音频或文档</p>
            <p className="ant-upload-hint">支持 JPG/PNG/WebP、MP4/MOV/WebM、常见音频及 TXT/MD/PDF/DOCX</p>
          </Upload.Dragger>
          <Checkbox checked={associateAfterUpload} onChange={(event) => setAssociateAfterUpload(event.target.checked)}>
            上传后关联到当前资产，并作为可选生成参考
          </Checkbox>
          {associateAfterUpload && (
            <>
              <div>
                <div className="mb-1 text-sm text-slate-600">素材用途</div>
                <Select className="w-full" value={role} options={roles} onChange={setRole} />
              </div>
              <div>
                <div className="mb-1 text-sm text-slate-600">参考说明（可选）</div>
                <Input.TextArea value={note} rows={3} onChange={(event) => setNote(event.target.value)} placeholder="例如：保持服装纹理；只参考动作，不参考人物脸部" />
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  )
}
