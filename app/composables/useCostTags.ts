/**
 * Composable for tag-based cost analysis operations
 */

import { ref } from 'vue'
import type { AccountCostTagConfig, TagCoverageData } from '~~/shared/types/cost-tags'

export const useCostTags = () => {
  // State
  const availableTags = ref<string[]>([])
  const tagCoverage = ref<TagCoverageData | null>(null)
  const tagConfig = ref<AccountCostTagConfig | null>(null)

  const isLoadingTags = ref(false)
  const isLoadingCoverage = ref(false)
  const isLoadingConfig = ref(false)
  const isSavingConfig = ref(false)

  const tagsError = ref<string | null>(null)
  const coverageError = ref<string | null>(null)
  const configError = ref<string | null>(null)

  // Cache tag keys since they rarely change — keyed by account selection
  const tagKeyCache = ref<{ tags: string[]; fetchedAt: number; accountKey?: string } | null>(null)
  const TAG_CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

  /**
   * Fetch available cost allocation tag keys
   */
  const fetchAvailableTags = async (accountIds?: string[]) => {
    const accountKey = accountIds?.sort().join(',') || ''

    // Return cached value if still fresh and for the same accounts
    if (tagKeyCache.value && Date.now() - tagKeyCache.value.fetchedAt < TAG_CACHE_TTL_MS && tagKeyCache.value.accountKey === accountKey) {
      availableTags.value = tagKeyCache.value.tags
      return tagKeyCache.value.tags
    }

    isLoadingTags.value = true
    tagsError.value = null

    try {
      const query: Record<string, any> = {}
      if (accountIds?.length) query.accountIds = accountIds.join(',')

      const data = await $fetch('/api/costs/tags', { query }) as any
      const tags: string[] = data?.data?.tags ?? data?.tags ?? []

      availableTags.value = tags
      tagKeyCache.value = { tags, fetchedAt: Date.now(), accountKey }
      return tags
    } catch (err: any) {
      tagsError.value = err.message || 'Failed to fetch tags'
      console.error('Error fetching available tags:', err)
      return []
    } finally {
      isLoadingTags.value = false
    }
  }

  /**
   * Fetch tag coverage data for a specific tag key
   */
  const fetchTagCoverage = async (tagKey: string, accountIds?: string[], period?: string) => {
    isLoadingCoverage.value = true
    coverageError.value = null

    try {
      const query: Record<string, any> = { tagKey }
      if (accountIds?.length) query.accountIds = accountIds.join(',')
      if (period) query.period = period

      const response = await $fetch('/api/costs/tag-coverage', { query }) as any
      const coverage: TagCoverageData = response?.data ?? response
      tagCoverage.value = coverage
      return coverage
    } catch (err: any) {
      coverageError.value = err.message || 'Failed to fetch tag coverage'
      console.error(`Error fetching coverage for tag "${tagKey}":`, err)
      return null
    } finally {
      isLoadingCoverage.value = false
    }
  }

  /**
   * Fetch tag configuration for a specific account
   */
  const fetchAccountTagConfig = async (accountId: string) => {
    isLoadingConfig.value = true
    configError.value = null

    try {
      const response = await $fetch(`/api/accounts/${accountId}/tag-config`) as any
      const config: AccountCostTagConfig = response?.data ?? response
      tagConfig.value = config
      return config
    } catch (err: any) {
      configError.value = err.message || 'Failed to fetch tag config'
      console.error(`Error fetching tag config for account "${accountId}":`, err)
      return null
    } finally {
      isLoadingConfig.value = false
    }
  }

  /**
   * Save tag configuration for a specific account
   */
  const saveAccountTagConfig = async (accountId: string, config: AccountCostTagConfig) => {
    isSavingConfig.value = true
    configError.value = null

    try {
      const response = await $fetch(`/api/accounts/${accountId}/tag-config`, {
        method: 'POST',
        body: config
      }) as any
      const saved: AccountCostTagConfig = response?.data ?? response
      tagConfig.value = saved
      return saved
    } catch (err: any) {
      configError.value = err.message || 'Failed to save tag config'
      console.error(`Error saving tag config for account "${accountId}":`, err)
      throw err
    } finally {
      isSavingConfig.value = false
    }
  }

  /**
   * Fetch tag keys from actual resources in an account via Resource Groups Tagging API.
   * Returns all tags in use on resources, not just cost allocation tags.
   */
  const resourceTags = ref<Array<{ key: string; exampleValues: string[] }>>([])
  const isLoadingResourceTags = ref(false)
  const resourceTagsError = ref<string | null>(null)

  const fetchResourceTags = async (accountId: string, environment?: string) => {
    isLoadingResourceTags.value = true
    resourceTagsError.value = null

    try {
      const query: Record<string, any> = {}
      if (environment) query.environment = environment
      const response = await $fetch(`/api/accounts/${accountId}/resource-tags`, { query }) as any
      const tags: Array<{ key: string; exampleValues: string[] }> = response?.data?.tags ?? []
      resourceTags.value = tags
      return tags
    } catch (err: any) {
      resourceTagsError.value = err.message || 'Failed to fetch resource tags'
      console.error(`Error fetching resource tags for account "${accountId}":`, err)
      return []
    } finally {
      isLoadingResourceTags.value = false
    }
  }

  /**
   * Clear the tag key cache (e.g. after account changes)
   */
  const clearTagCache = () => {
    tagKeyCache.value = null
  }

  return {
    // State
    availableTags,
    resourceTags,
    tagCoverage,
    tagConfig,

    // Loading
    isLoadingTags,
    isLoadingResourceTags,
    isLoadingCoverage,
    isLoadingConfig,
    isSavingConfig,

    // Errors
    tagsError,
    resourceTagsError,
    coverageError,
    configError,

    // Methods
    fetchAvailableTags,
    fetchResourceTags,
    fetchTagCoverage,
    fetchAccountTagConfig,
    saveAccountTagConfig,
    clearTagCache
  }
}
