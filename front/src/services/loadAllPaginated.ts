type PaginatedPayload<T> = {
  items?: T[]
  pagination?: {
    total?: number
  }
}

type PaginatedResponse<T> = {
  data?: PaginatedPayload<T> | null
}

/**
 * 分批读取服务端分页数据，避免页面写死 pageSize=100 后静默丢失第 101 条以后的记录。
 */
export async function loadAllPaginated<T>(
  loadPage: (page: number, pageSize: number) => Promise<PaginatedResponse<T>>,
  pageSize = 100,
): Promise<T[]> {
  const first = await loadPage(1, pageSize)
  const firstItems = first.data?.items ?? []
  const total = first.data?.pagination?.total ?? firstItems.length
  const pageCount = Math.ceil(total / pageSize)
  if (pageCount <= 1) return firstItems

  const items = [...firstItems]
  for (let page = 2; page <= pageCount; page += 1) {
    const response = await loadPage(page, pageSize)
    items.push(...(response.data?.items ?? []))
  }
  return items
}
