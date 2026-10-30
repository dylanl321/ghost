import { isUntaggedCostTagFilterValue } from '../../shared/utils/cost-tag-identities'

export interface CostTagFilter {
  key: string
  values: string[]
  /** Also match costs from resources that do not carry the tag key. */
  untagged?: boolean
}

export function parseQueryValues(value: unknown): string[] {
  const values = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]
  return [...new Set(values.map(item => String(item).trim()).filter(Boolean))]
}

/**
 * Split tag filter values into concrete values and the "Untagged" bucket.
 * Untagged arrives as an empty value or the __untagged__ sentinel; dropping it
 * would silently remove the tag filter and return the whole account.
 */
function splitTagFilterValues(value: unknown): { values: string[]; untagged: boolean } {
  const raw = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]
  const untagged = raw.some(item => isUntaggedCostTagFilterValue(String(item)))
  const values = parseQueryValues(raw.filter(item => !isUntaggedCostTagFilterValue(String(item))))
  return { values, untagged }
}

export function parseCostTagFilter(query: Record<string, unknown>): CostTagFilter | undefined {
  const key = typeof query.tagFilterKey === 'string' ? query.tagFilterKey.trim() : ''
  const { values, untagged } = splitTagFilterValues(query.tagFilterValues)
  if (key && (values.length > 0 || untagged)) {
    return untagged ? { key, values, untagged } : { key, values }
  }

  const legacyFilter = typeof query.tagFilter === 'string' ? query.tagFilter : ''
  const separator = legacyFilter.indexOf('||')
  if (separator <= 0) return undefined

  const legacyValue = legacyFilter.slice(separator + 2)
  return isUntaggedCostTagFilterValue(legacyValue)
    ? { key: legacyFilter.slice(0, separator), values: [], untagged: true }
    : { key: legacyFilter.slice(0, separator), values: [legacyValue] }
}

/** Parse a tag key plus values from the given query fields (resource drill-downs). */
export function parseCostTagFilterFrom(key: unknown, values: unknown): CostTagFilter | undefined {
  return parseCostTagFilter({ tagFilterKey: key, tagFilterValues: values })
}

export function buildCostExplorerTagFilter(filter?: CostTagFilter) {
  if (!filter) return undefined
  const valueFilter = filter.values.length > 0
    ? { Tags: { Key: filter.key, Values: filter.values, MatchOptions: ['EQUALS'] } }
    : undefined
  // ABSENT matches exactly the "Key$" group Cost Explorer reports for untagged costs.
  const untaggedFilter = filter.untagged
    ? { Tags: { Key: filter.key, MatchOptions: ['ABSENT'] } }
    : undefined
  if (valueFilter && untaggedFilter) return { Or: [valueFilter, untaggedFilter] }
  return valueFilter || untaggedFilter
}

export function getCostTagFilterCacheKey(filter?: CostTagFilter): string | null {
  if (!filter) return null
  return `${filter.key}:${JSON.stringify([...filter.values].sort())}${filter.untagged ? ':untagged' : ''}`
}
