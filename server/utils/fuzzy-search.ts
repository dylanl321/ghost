/**
 * Fuzzy Search Utility
 *
 * Provides fuzzy matching capabilities for accounts, resources, and other searchable entities.
 * Uses fuse.js for client-side fuzzy matching with configurable weights.
 */

import Fuse from 'fuse.js'
import type { UnifiedAccount } from './accounts-consolidated'
import type { ResourceDetail } from './config-service'
import { getCacheManager } from './cache-manager'
import { logger } from './logger'

// Cache configuration
const CACHE_TTL = 300 // 5 minutes
const CACHE_KEY_PREFIX = 'support:fuzzy-index'

export interface FuzzySearchOptions<T> {
  keys: Array<{
    name: keyof T | string
    weight: number
  }>
  threshold?: number
  includeScore?: boolean
  includeMatches?: boolean
  minMatchCharLength?: number
  ignoreLocation?: boolean
  findAllMatches?: boolean
}

export interface FuzzySearchResult<T> {
  item: T
  score: number
  matches?: Array<{
    key: string
    value: string
    indices: Array<[number, number]>
  }>
}

/**
 * Default fuzzy search options for accounts
 */
export const ACCOUNT_SEARCH_OPTIONS: FuzzySearchOptions<UnifiedAccount> = {
  keys: [
    { name: 'name', weight: 2 },
    { name: 'projectName', weight: 2 },
    { name: 'accountId', weight: 1.5 },
    { name: 'email', weight: 1 },
    { name: 'awsAccountEmail', weight: 1 },
    { name: 'govCloudAccountId', weight: 1 },
    { name: 'awsGovCloudAccountID', weight: 1 },
    { name: 'awsStandardAccountID', weight: 1 }
  ],
  threshold: 0.4,
  includeScore: true,
  includeMatches: true,
  minMatchCharLength: 2,
  ignoreLocation: true,
  findAllMatches: true
}

/**
 * Default fuzzy search options for resources
 */
export const RESOURCE_SEARCH_OPTIONS: FuzzySearchOptions<ResourceDetail> = {
  keys: [
    { name: 'resourceName', weight: 2 },
    { name: 'resourceId', weight: 1.5 },
    { name: 'accountId', weight: 1 },
    { name: 'region', weight: 0.5 },
    { name: 'resourceType', weight: 0.5 },
    { name: 'tags.Name', weight: 2 },
    { name: 'tags.Environment', weight: 1 },
    { name: 'tags.Project', weight: 1 },
    { name: 'configuration.privateIpAddress', weight: 1.5 },
    { name: 'configuration.publicIpAddress', weight: 1.5 },
    { name: 'configuration.instanceType', weight: 0.5 }
  ],
  threshold: 0.4,
  includeScore: true,
  includeMatches: true,
  minMatchCharLength: 2,
  ignoreLocation: true,
  findAllMatches: true
}

/**
 * Create a fuzzy searcher instance for any type of items
 */
export function createFuzzySearcher<T>(
  items: T[],
  options: FuzzySearchOptions<T>
): Fuse<T> {
  const fuseOptions: Fuse.IFuseOptions<T> = {
    keys: options.keys.map(k => ({
      name: k.name as string,
      weight: k.weight
    })),
    threshold: options.threshold ?? 0.4,
    includeScore: options.includeScore ?? true,
    includeMatches: options.includeMatches ?? true,
    minMatchCharLength: options.minMatchCharLength ?? 2,
    ignoreLocation: options.ignoreLocation ?? true,
    findAllMatches: options.findAllMatches ?? true
  }

  return new Fuse(items, fuseOptions)
}

/**
 * Perform fuzzy search on items
 */
export function fuzzySearch<T>(
  searcher: Fuse<T>,
  query: string,
  limit?: number
): FuzzySearchResult<T>[] {
  const results = searcher.search(query)

  const mapped = results.map(result => ({
    item: result.item,
    score: result.score ?? 0,
    matches: result.matches?.map(match => ({
      key: match.key ?? '',
      value: match.value ?? '',
      indices: match.indices as Array<[number, number]>
    }))
  }))

  if (limit) {
    return mapped.slice(0, limit)
  }

  return mapped
}

/**
 * Search accounts with fuzzy matching
 */
export async function fuzzySearchAccounts(
  query: string,
  accounts: UnifiedAccount[],
  limit: number = 20
): Promise<FuzzySearchResult<UnifiedAccount>[]> {
  if (!query || query.trim().length === 0) {
    return []
  }

  const cache = getCacheManager()
  const cacheKey = `${CACHE_KEY_PREFIX}:accounts:${accounts.length}`

  // Try to get cached searcher index
  let searcher: Fuse<UnifiedAccount>

  try {
    // Create fresh searcher (Fuse doesn't serialize well for caching)
    searcher = createFuzzySearcher(accounts, ACCOUNT_SEARCH_OPTIONS)

    logger.debug(`[FuzzySearch] Created account searcher with ${accounts.length} items`)
  } catch (error) {
    logger.error('[FuzzySearch] Failed to create account searcher:', error)
    throw error
  }

  const startTime = Date.now()
  const results = fuzzySearch(searcher, query.trim(), limit)
  const duration = Date.now() - startTime

  logger.info(`[FuzzySearch] Account search for "${query}" returned ${results.length} results in ${duration}ms`)

  return results
}

/**
 * Search resources with fuzzy matching
 */
export async function fuzzySearchResources(
  query: string,
  resources: ResourceDetail[],
  limit: number = 50
): Promise<FuzzySearchResult<ResourceDetail>[]> {
  if (!query || query.trim().length === 0) {
    return []
  }

  try {
    const searcher = createFuzzySearcher(resources, RESOURCE_SEARCH_OPTIONS)

    logger.debug(`[FuzzySearch] Created resource searcher with ${resources.length} items`)

    const startTime = Date.now()
    const results = fuzzySearch(searcher, query.trim(), limit)
    const duration = Date.now() - startTime

    logger.info(`[FuzzySearch] Resource search for "${query}" returned ${results.length} results in ${duration}ms`)

    return results
  } catch (error) {
    logger.error('[FuzzySearch] Failed to search resources:', error)
    throw error
  }
}

/**
 * Combined search across accounts and resources
 */
export interface CombinedSearchResult {
  accounts: FuzzySearchResult<UnifiedAccount>[]
  resources: FuzzySearchResult<ResourceDetail>[]
  totalResults: number
  searchTime: number
}

export async function combinedFuzzySearch(
  query: string,
  accounts: UnifiedAccount[],
  resources: ResourceDetail[],
  options: {
    accountLimit?: number
    resourceLimit?: number
    searchTypes?: ('accounts' | 'resources')[]
  } = {}
): Promise<CombinedSearchResult> {
  const startTime = Date.now()
  const searchTypes = options.searchTypes ?? ['accounts', 'resources']

  const results: CombinedSearchResult = {
    accounts: [],
    resources: [],
    totalResults: 0,
    searchTime: 0
  }

  const promises: Promise<void>[] = []

  if (searchTypes.includes('accounts')) {
    promises.push(
      fuzzySearchAccounts(query, accounts, options.accountLimit ?? 20)
        .then(accountResults => {
          results.accounts = accountResults
        })
    )
  }

  if (searchTypes.includes('resources')) {
    promises.push(
      fuzzySearchResources(query, resources, options.resourceLimit ?? 50)
        .then(resourceResults => {
          results.resources = resourceResults
        })
    )
  }

  await Promise.all(promises)

  results.totalResults = results.accounts.length + results.resources.length
  results.searchTime = Date.now() - startTime

  logger.info(`[FuzzySearch] Combined search for "${query}" completed in ${results.searchTime}ms with ${results.totalResults} total results`)

  return results
}

/**
 * Highlight matched portions of text for display
 */
export function highlightMatches(
  text: string,
  indices: Array<[number, number]>
): string {
  if (!indices || indices.length === 0) return text

  // Sort indices by start position in reverse order for safe replacement
  const sortedIndices = [...indices].sort((a, b) => b[0] - a[0])

  let result = text
  for (const [start, end] of sortedIndices) {
    const before = result.slice(0, start)
    const match = result.slice(start, end + 1)
    const after = result.slice(end + 1)
    result = `${before}**${match}**${after}`
  }

  return result
}

/**
 * Calculate relevance score (0-100) from fuse.js score (0-1 where 0 is perfect)
 */
export function calculateRelevanceScore(fuseScore: number): number {
  // Fuse.js score: 0 = perfect match, 1 = no match
  // Convert to relevance: 100 = perfect match, 0 = no match
  return Math.round((1 - fuseScore) * 100)
}
