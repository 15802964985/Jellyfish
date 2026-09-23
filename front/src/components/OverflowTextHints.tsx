import { useEffect } from 'react'

/** Supply native full-text hints for CSS ellipsis/line clamps across pages and portals.
 * Event delegation includes asynchronously loaded cards, tables and select options without
 * observing or rescanning the whole DOM. Explicit component hints always take precedence.
 */
export function OverflowTextHints() {
  useEffect(() => {
    let current: HTMLElement | null = null
    let generatedTitle = ''

    /** Remove only our temporary attribute; leave React-managed titles untouched. */
    const clear = () => {
      if (current?.getAttribute('title') === generatedTitle) current.removeAttribute('title')
      current = null
      generatedTitle = ''
    }

    /** Walk the hovered text's ancestors to find the element that actually clips it. */
    const show = (event: Event) => {
      clear()
      if (!(event.target instanceof Element)) return
      if (event.target.closest('input, textarea, [contenteditable="true"], [data-overflow-hint="off"], [title], [aria-describedby], .ant-tooltip')) return
      let element: HTMLElement | null = event.target instanceof HTMLElement ? event.target : event.target.parentElement
      while (element && element !== document.body) {
        const style = getComputedStyle(element)
        const ellipsis = style.textOverflow === 'ellipsis'
        const clamped = Number.parseInt(style.webkitLineClamp, 10) > 0
        const overflow = element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1
        if ((ellipsis || clamped) && overflow && element.clientWidth > 0) {
          // innerText reflects displayed text; never recover hidden credentials or source data.
          const text = element.innerText.trim()
          if (text && !element.querySelector('input, textarea, [contenteditable="true"]')) {
            current = element
            generatedTitle = text
            element.setAttribute('title', text)
          }
          return
        }
        element = element.parentElement
      }
    }

    document.addEventListener('pointerover', show)
    document.addEventListener('pointerout', clear)
    document.addEventListener('focusin', show)
    document.addEventListener('focusout', clear)
    window.addEventListener('blur', clear)
    return () => {
      clear()
      document.removeEventListener('pointerover', show)
      document.removeEventListener('pointerout', clear)
      document.removeEventListener('focusin', show)
      document.removeEventListener('focusout', clear)
      window.removeEventListener('blur', clear)
    }
  }, [])
  return null
}
