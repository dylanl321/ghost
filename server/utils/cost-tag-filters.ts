export interface CostTagFilter {
  key: string
  values: string[]
}

export function parseQueryValues(value: unknown): string[] {
  const values = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]
  return [...new Set(values.map(item => String(item).trim()).filter(Boolean))]
}

export function parseCostTagFilter(query: Record<string, unknown>): CostTagFilter | undefined {
  const key = typeof query.tagFilterKey === 'string' ? query.tagFilterKey.trim() : ''
  const values = parseQueryValues(query.tagFilterValues)
  if (key && values.length > 0) return { key, values }

  const legacyFilter = typeof query.tagFilter === 'string' ? query.tagFilter : ''
  const separator = legacyFilter.indexOf('||')
  if (separator <= 0) return undefined

  return {
    key: legacyFilter.slice(0, separator),
    values: [legacyFilter.slice(separator + 2)]
  }
}

export function buildCostExplorerTagFilter(filter?: CostTagFilter) {
  if (!filter) return undefined
  return {
    Tags: {
      Key: filter.key,
      Values: filter.values,
      MatchOptions: ['EQUALS']
    }
  }
}

export function getCostTagFilterCacheKey(filter?: CostTagFilter): string | null {
  if (!filter) return null
  return `${filter.key}:${JSON.stringify([...filter.values].sort())}`
}
