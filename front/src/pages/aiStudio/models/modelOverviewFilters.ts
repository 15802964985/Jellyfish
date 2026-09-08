import type { ModelOverviewItem } from '../../../services/generated'

export type OverviewFilters = {
  scene: string; category: string; provider: string; status: string; search: string
}

/** Keep the selected catalogue model when the user chooses one of its matching accounts. */
export function overviewPresetForProvider(item: ModelOverviewItem | null, providerId: string) {
  return item?.provider_ids?.includes(providerId) ? { category: item.category, names: [item.model_name] } : undefined
}

/** Filter only the complete overview, never the paginated model-management list. */
export function filterModelOverview(items: ModelOverviewItem[], filters: OverviewFilters) {
  const query = filters.search.trim().toLocaleLowerCase()
  return items.filter(item =>
    (!filters.scene || item.scenario_keys?.includes(filters.scene)) &&
    (!filters.category || item.category === filters.category) &&
    (!filters.provider || item.provider_key === filters.provider) &&
    (!filters.status || (filters.status === 'saved'
      ? !!item.configurations?.length : item.configuration_status === filters.status)) &&
    (!query || [item.model_name, item.provider_name, ...(item.configurations ?? []).map(c => c.provider_name)]
      .some(value => value.toLocaleLowerCase().includes(query))),
  )
}
