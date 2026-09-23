import { PreviewImage } from '../../../components/PreviewImage'
import { Alert, Modal } from 'antd'
import type { FileRead } from '../../../services/generated'
import { buildFilePreviewUrl } from '../assets/utils'

type FilePreviewModalProps = {
  file: FileRead | null
  onClose: () => void
}

/** 统一预览上传文件；视频走兼容转码端点，文档保持只读展示。 */
export function FilePreviewModal({ file, onClose }: FilePreviewModalProps) {
  const url = buildFilePreviewUrl(file?.id)
  const suffix = (file?.original_name ?? '').split('.').pop()?.toLowerCase()

  return (
    <Modal
      title={file?.original_name || file?.name || '素材预览'}
      open={file !== null}
      footer={null}
      width={file?.type === 'image' ? 1080 : 880}
      onCancel={onClose}
      destroyOnClose
    >
      {!file || !url ? null : file.type === 'image' ? (
        <div className="flex max-h-[78vh] min-h-64 items-center justify-center overflow-auto rounded-lg bg-slate-950/95 p-3">
          <PreviewImage src={url} alt={file.name} className="max-h-[74vh] max-w-full object-contain" />
        </div>
      ) : file.type === 'video' ? (
        <div className="space-y-3">
          <video className="max-h-[72vh] w-full rounded-lg bg-black" src={url} controls playsInline preload="metadata">
            您的浏览器不支持视频播放
          </video>
          <Alert type="info" showIcon message="预览使用浏览器兼容副本，下载仍保留原始视频文件。首次打开 HEVC 视频可能需要等待转码。" />
        </div>
      ) : file.type === 'audio' ? (
        <div className="rounded-lg bg-gradient-to-br from-blue-50 to-slate-100 p-8">
          <audio className="w-full" src={url} controls preload="metadata" />
        </div>
      ) : (
        <div className="space-y-3">
          <iframe className="h-[70vh] w-full rounded-lg border border-slate-200 bg-white" src={url} title={file.name} />
          {suffix === 'docx' ? <Alert type="info" showIcon message="DOCX 预览会提取正文文字；复杂排版、图片和批注请下载原文件查看。" /> : null}
        </div>
      )}
    </Modal>
  )
}
