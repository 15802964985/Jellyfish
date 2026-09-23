import { useEffect, useRef, useState } from 'react'
import type { ImgHTMLAttributes } from 'react'
import { createPortal } from 'react-dom'
import { Image } from 'antd'

type PreviewImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'onClick' | 'onKeyDown' | 'onMouseDown'> & { previewSrc?: string }

/** 保留原缩略图布局，独立打开原图缩放层；预览事件不触发外层选择或版本切换。 */
export function PreviewImage({ previewSrc, src, alt, className, ...props }: PreviewImageProps) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLImageElement>(null)
  // 只转换本系统文件预览端点，第三方签名 URL 和上传的 blob/data 地址保持原样。
  const original = previewSrc || src?.replace(/(\/api\/v1\/studio\/files\/[^/?]+)\/preview(?=\?|$)/, '$1/download')
  /** 隔离素材卡片的鼠标/键盘选择，关闭后恢复焦点便于继续浏览。 */
  const changeVisible = (visible: boolean) => {
    setOpen(visible)
    if (!visible) trigger.current?.focus({ preventScroll: true })
  }
  // 键盘从缩略图打开时焦点可能仍在触发器；优先关闭顶层预览，避免关闭素材弹窗。
  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault(); event.stopImmediatePropagation()
      setOpen(false)
      trigger.current?.focus({ preventScroll: true })
    }
    document.addEventListener('keydown', closeOnEscape, true)
    return () => document.removeEventListener('keydown', closeOnEscape, true)
  }, [open])
  return <>
    <img {...props} ref={trigger} src={src} alt={alt || '图片'}
      className={`${className || ''} cursor-zoom-in`} role="button" tabIndex={0}
      title="点击放大查看细节" aria-label={`放大预览：${alt || '图片'}`}
      onMouseDown={event => { event.preventDefault(); event.stopPropagation() }}
      onClick={event => { event.preventDefault(); event.stopPropagation(); if (original) setOpen(true) }}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault(); event.stopPropagation(); if (original) setOpen(true)
        }
      }} />
    {open && original ? createPortal(
      <div onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
        <Image src={original} alt={alt || '图片'} style={{ display: 'none' }}
          preview={{ visible: open, onVisibleChange: changeVisible }} />
      </div>, document.body) : null}
  </>
}
