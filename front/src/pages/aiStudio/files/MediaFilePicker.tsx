import { PreviewImage } from '../../../components/PreviewImage'
import { useEffect, useState } from 'react'
import { Alert, Button, Empty, Input, Modal, Pagination, Spin, Tag } from 'antd'
import { StudioFilesService } from '../../../services/generated'
import type { FileRead } from '../../../services/generated'
import { buildFileDownloadUrl, buildFilePreviewUrl } from '../assets/utils'
import { FilePreviewModal } from './FilePreviewModal'

type MediaFilePickerProps = {
  title?: string
  kind?: 'image' | 'video' | 'audio'
  selectedIds: string[]
  disabled?: boolean
  onSelect: (file: FileRead) => void
  onClose: () => void
}

/** 展示同名素材的画面和文件信息；预览与选择分开，播放视频不会误选素材。 */
function MediaFileCard({ file, selected, disabled, onPreview, onSelect }: {
  file: FileRead
  selected: boolean
  disabled?: boolean
  onPreview: () => void
  onSelect: () => void
}) {
  const [failed, setFailed] = useState(false)
  const isVideo = file.type === 'video'
  const isAudio = file.type === 'audio'
  const details = [
    file.width && file.height ? `${file.width} × ${file.height}` : '',
    file.duration_ms != null ? `${(file.duration_ms / 1000).toFixed(1)} 秒` : '',
    file.size_bytes != null ? `${(file.size_bytes / 1024 / 1024).toFixed(1)} MB` : '',
  ].filter(Boolean).join(' · ')
  return <article className="overflow-hidden rounded-lg border border-solid border-slate-200 bg-white">
    <div className="flex h-40 items-center justify-center bg-slate-950">
      {isAudio ? <audio controls preload="metadata" src={buildFileDownloadUrl(file.id)} aria-label={`试听 ${file.name}`} className="w-full" /> : failed ? <div className="p-3 text-center text-slate-200">
        <p>{isVideo ? '此视频需打开兼容预览' : '缩略图加载失败'}</p>
        <Button onClick={onPreview}>打开预览</Button>
      </div> : isVideo ? (
        <video src={buildFileDownloadUrl(file.id)} controls playsInline preload="metadata"
          aria-label={`播放 ${file.name}`} className="h-full w-full object-contain"
          onError={() => setFailed(true)}>您的浏览器不支持此视频，请打开预览。</video>
      ) : (
        <button type="button" aria-label={`放大预览 ${file.name}`} onClick={onPreview}
          className="h-full w-full cursor-zoom-in border-0 bg-transparent p-0">
          <PreviewImage src={buildFilePreviewUrl(file.id)} alt={file.name} loading="lazy"
            className="h-full w-full object-contain" onError={() => setFailed(true)} />
        </button>
      )}
    </div>
    <div className="space-y-2 p-3">
      <div className="truncate font-medium" title={file.name}>{file.name}</div>
      {file.original_name && file.original_name !== file.name &&
        <div className="truncate text-xs text-slate-500" title={file.original_name}>{file.original_name}</div>}
      <div className="text-xs text-slate-500">{details || (isAudio ? '音频素材' : isVideo ? '视频素材' : '图片素材')}</div>
      <div className="truncate text-xs text-slate-400" title={file.id}>文件 ID：{file.id}</div>
      <div className="flex items-center justify-between gap-2">
        <Button onClick={onPreview}>{isAudio ? '试听' : isVideo ? '放大播放' : '放大预览'}</Button>
        {selected ? <Tag color="blue" className="m-0">已选择</Tag> :
          <Button type="primary" disabled={disabled} onClick={onSelect}>{isAudio ? '选择此音频' : isVideo ? '选择此视频' : '选择此图片'}</Button>}
      </div>
    </div>
  </article>
}

/** 图片/视频共用可视化素材选择器；关闭、搜索和翻页时隔离旧请求，避免误选旧列表。 */
export function MediaFilePicker({ title, kind, selectedIds, disabled, onSelect, onClose }: MediaFilePickerProps) {
  const [files, setFiles] = useState<FileRead[]>([])
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [preview, setPreview] = useState<FileRead | null>(null)
  const pageSize = 8

  useEffect(() => {
    if (!kind) return
    let disposed = false
    let request: ReturnType<typeof StudioFilesService.listFilesApiApiV1StudioFilesGet> | undefined
    setFiles([]); setTotal(0); setLoading(true); setError(''); setPreview(null)
    const timer = window.setTimeout(() => {
      request = StudioFilesService.listFilesApiApiV1StudioFilesGet({ fileType: kind, q: query, page, pageSize })
      request.then(response => {
        if (disposed) return
        setFiles(response.data?.items || [])
        setTotal(response.data?.pagination.total || 0)
      }).catch(() => {
        if (!disposed) setError('素材加载失败，请重试。')
      }).finally(() => {
        if (!disposed) setLoading(false)
      })
    }, 250)
    return () => { disposed = true; window.clearTimeout(timer); request?.cancel() }
  }, [kind, query, page, retry])

  return <>
    <Modal title={title || (kind === 'audio' ? '选择配音、音乐或音效' : kind === 'video' ? '选择原视频' : '选择参考图片')} open={Boolean(kind)}
      onCancel={onClose} width={840} destroyOnClose
      footer={<Pagination current={page} total={total} pageSize={pageSize} showSizeChanger={false}
        disabled={loading} onChange={setPage} showTotal={count => `共 ${count} 个素材`} />}>
      <Input.Search placeholder="搜索文件名" allowClear value={query}
        onChange={event => { setQuery(event.target.value); setPage(1) }} />
      <p className="my-3 text-sm text-slate-500">
        {kind === 'audio' ? '先试听，再选择已有音频；不会调用模型生成。' : kind === 'video' ? '可先播放或放大确认画面，再点击“选择此视频”。' : '点击图片可放大查看，再点击“选择此图片”。'}
      </p>
      <div className="max-h-[60vh] min-h-48 overflow-y-auto">
        {error ? <Alert type="error" showIcon message={error}
          action={<Button onClick={() => setRetry(value => value + 1)}>重试</Button>} /> :
          loading ? <div className="flex min-h-48 items-center justify-center"><Spin tip="正在加载素材…" /></div> :
          files.length ? <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {files.map(file => <MediaFileCard key={file.id} file={file} selected={selectedIds.includes(file.id)}
              disabled={disabled} onPreview={() => setPreview(file)}
              onSelect={() => { if (!disabled) onSelect(file) }} />)}
          </div> : <Empty description={query ? '没有匹配的素材，请更换关键词' : '暂无此类素材，可返回编辑窗口上传'} />}
      </div>
    </Modal>
    <FilePreviewModal file={kind ? preview : null} onClose={() => setPreview(null)} />
  </>
}
