/** 后端无时区数据库时间按UTC解释，再按浏览器本地时间展示，与任务中心时间戳一致。 */
export function formatStudioTime(value?: string | null): string {
  if (!value) return '时间未知'
  const normalized = value.trim().replace(' ', 'T')
  const date = new Date(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized) ? normalized : `${normalized}Z`)
  if (Number.isNaN(date.getTime())) return '时间未知'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(date)
}
