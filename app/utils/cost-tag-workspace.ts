export type CostTagCreatorView = 'people' | 'all'

export function normalizeCostTagCreatorView(value: unknown): CostTagCreatorView {
  return value === 'all' ? 'all' : 'people'
}

export function resolveCostTagSelection(options: {
  availableTags: string[]
  requestedTag?: string | null
  defaultTag?: string
  favoriteTags?: string[]
}): string | null {
  const { availableTags, requestedTag, defaultTag, favoriteTags = [] } = options

  if (requestedTag && availableTags.includes(requestedTag)) return requestedTag
  if (defaultTag && availableTags.includes(defaultTag)) return defaultTag

  const favoriteTag = favoriteTags.find(tag => availableTags.includes(tag))
  return favoriteTag || availableTags[0] || null
}

export function getCostTagWorkspaceQuery(options: {
  chartTab: string
  selectedTag?: string | null
  tagView: CostTagCreatorView
}): Record<'chartTab' | 'tag' | 'tagView', string | undefined> {
  const isTagAnalysis = options.chartTab === 'tags'
  return {
    chartTab: options.chartTab,
    tag: isTagAnalysis ? options.selectedTag || undefined : undefined,
    tagView: isTagAnalysis ? options.tagView : undefined
  }
}
