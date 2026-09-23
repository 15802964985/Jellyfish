import { PreviewImage } from '../../../../components/PreviewImage'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Button, Card } from 'antd'

type DisplayImageCardProps = {
  title: ReactNode
  imageUrl?: string
  imageAlt: string
  placeholder?: ReactNode
  extra?: ReactNode
  actions?: ReactNode[]
  meta?: ReactNode
  footer?: ReactNode
  onImageClick?: () => void
  enablePreview?: boolean
  size?: 'small' | 'default'
  hoverable?: boolean
  imageHeightClassName?: string
}

/** 统一资产封面和操作区；图片点击看细节，视角列表及视频另设入口。 */
export function DisplayImageCard({
  title,
  imageUrl,
  imageAlt,
  placeholder = '暂无图片',
  extra,
  actions,
  meta,
  footer,
  onImageClick,
  enablePreview = true,
  size = 'small',
  hoverable = true,
  imageHeightClassName = 'h-44',
}: DisplayImageCardProps) {
  const [imgError, setImgError] = useState(false)

  useEffect(() => {
    setImgError(false)
  }, [imageUrl])

  const displayUrl = imgError ? undefined : imageUrl

  return (
    <>
      <Card title={title} extra={extra} actions={actions} size={size} hoverable={hoverable}>
        <div
          className={`${imageHeightClassName} rounded-md border border-gray-200 bg-gray-50 flex items-center justify-center text-gray-500 text-sm overflow-hidden ${(onImageClick || (enablePreview && displayUrl)) ? 'cursor-pointer' : ''}`}
          onClick={onImageClick}
        >
          {displayUrl && !enablePreview ? <img src={displayUrl} alt={imageAlt} className="w-full h-full object-contain p-1" onError={() => setImgError(true)} /> : displayUrl ? (
            <PreviewImage
              src={displayUrl}
              alt={imageAlt}
              className="w-full h-full object-contain p-1"
              onError={() => setImgError(true)}
            />
          ) : (
            placeholder
          )}
        </div>
        {onImageClick ? <Button type="link" onClick={onImageClick}>{enablePreview ? '查看全部视角图片' : '打开预览'}</Button> : null}
        {meta ? <div className="mt-2">{meta}</div> : null}
        {footer ? <div className="mt-3">{footer}</div> : null}
      </Card>


    </>
  )
}

