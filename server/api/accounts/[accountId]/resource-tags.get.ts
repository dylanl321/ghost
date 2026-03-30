/**
 * GET /api/accounts/:accountId/resource-tags
 * Discover tag keys (with example values) in use on resources in a specific AWS account.
 * Combines GetTagKeys, GetTagValues, and GetResources across US regions for full coverage.
 */

import { defineEventHandler } from 'h3'
import {
  GetTagKeysCommand,
  GetTagValuesCommand,
  GetResourcesCommand
} from '@aws-sdk/client-resource-groups-tagging-api'
import { getResourceGroupsTaggingClient } from '../../../lib/aws-client-factory'
import { sendSuccess, parseQueryParams, handleAsync } from '../../../utils/api-response'
import { costCache, CacheTags } from '../../../utils/cache-manager'
import { logger } from '../../../utils/logger'
import type { AWSEnvironmentType } from '../../../types/aws'

const MAX_EXAMPLE_VALUES = 5

const COMMERCIAL_REGIONS = ['us-east-1', 'us-east-2', 'us-west-1', 'us-west-2']
const GOVCLOUD_REGIONS = ['us-gov-west-1', 'us-gov-east-1']

/**
 * Fetch all tag keys from GetTagKeys in a single region (this API returns account-wide keys)
 */
async function fetchAllTagKeys(
  environment: AWSEnvironmentType,
  region: string,
  accountId: string
): Promise<string[]> {
  const client = await getResourceGroupsTaggingClient(environment, region, accountId)
  const allKeys: string[] = []
  let paginationToken: string | undefined

  do {
    const command = new GetTagKeysCommand({
      PaginationToken: paginationToken
    })
    const response = await client.send(command)
    if (response.TagKeys) {
      allKeys.push(...response.TagKeys)
    }
    paginationToken = response.PaginationToken
  } while (paginationToken)

  return allKeys
}

/**
 * Fetch example values for a specific tag key using GetTagValues
 */
async function fetchTagValues(
  environment: AWSEnvironmentType,
  region: string,
  accountId: string,
  tagKey: string
): Promise<string[]> {
  try {
    const client = await getResourceGroupsTaggingClient(environment, region, accountId)
    const values: string[] = []
    let paginationToken: string | undefined

    do {
      const command = new GetTagValuesCommand({
        Key: tagKey,
        PaginationToken: paginationToken
      })
      const response = await client.send(command)
      if (response.TagValues) {
        values.push(...response.TagValues)
      }
      paginationToken = response.PaginationToken
      // Only need a few example values, stop early
      if (values.length >= MAX_EXAMPLE_VALUES) break
    } while (paginationToken)

    return values.slice(0, MAX_EXAMPLE_VALUES)
  } catch {
    return []
  }
}

/**
 * Scan a single region with GetResources and collect tag key-value pairs
 */
async function scanRegionResources(
  environment: AWSEnvironmentType,
  region: string,
  accountId: string
): Promise<Map<string, Set<string>>> {
  const tagMap = new Map<string, Set<string>>()

  try {
    const client = await getResourceGroupsTaggingClient(environment, region, accountId)
    let paginationToken: string | undefined

    do {
      const command = new GetResourcesCommand({
        ResourcesPerPage: 100,
        PaginationToken: paginationToken || undefined
      })
      const response = await client.send(command)

      for (const resource of response.ResourceTagMappingList ?? []) {
        for (const tag of resource.Tags ?? []) {
          if (!tag.Key || tag.Value === undefined) continue
          let values = tagMap.get(tag.Key)
          if (!values) {
            values = new Set<string>()
            tagMap.set(tag.Key, values)
          }
          if (values.size < MAX_EXAMPLE_VALUES) {
            values.add(tag.Value)
          }
        }
      }

      paginationToken = response.PaginationToken
    } while (paginationToken)
  } catch (err: any) {
    logger.debug(`Skipping region ${region} for GetResources: ${err.message}`)
  }

  return tagMap
}

export default defineEventHandler(handleAsync(async (event) => {
  const accountId = event.context.params?.accountId
  if (!accountId) {
    throw new Error('accountId is required')
  }

  const { environment } = parseQueryParams(event)

  const cacheKey = `resource-tags:${accountId}:${environment}`

  const tags = await costCache.getOrSet(
    cacheKey,
    async () => {
      const regions = environment === 'govcloud' ? GOVCLOUD_REGIONS : COMMERCIAL_REGIONS
      const primaryRegion = regions[0]
      logger.info(`Fetching resource tags for account ${accountId} across ${regions.length} ${environment} US regions...`)

      // Run GetTagKeys (account-wide index) and GetResources (per-region) in parallel
      const [tagKeysResult, ...regionResults] = await Promise.allSettled([
        fetchAllTagKeys(environment, primaryRegion, accountId),
        ...regions.map(region => scanRegionResources(environment, region, accountId))
      ])

      // Merge GetResources results from all regions
      const resourceTagMap = new Map<string, Set<string>>()
      for (const result of regionResults) {
        if (result.status !== 'fulfilled') continue
        for (const [key, values] of result.value) {
          let merged = resourceTagMap.get(key)
          if (!merged) {
            merged = new Set<string>()
            resourceTagMap.set(key, merged)
          }
          for (const v of values) {
            if (merged.size < MAX_EXAMPLE_VALUES) {
              merged.add(v)
            }
          }
        }
      }

      // Combine: start with all keys from GetTagKeys, overlay with GetResources values
      const allKeys = new Set<string>(resourceTagMap.keys())
      if (tagKeysResult.status === 'fulfilled') {
        for (const key of tagKeysResult.value) {
          allKeys.add(key)
        }
      }

      // For any keys found by GetTagKeys but missing from GetResources, fetch example values
      const keysNeedingValues = Array.from(allKeys).filter(k => !resourceTagMap.has(k))
      if (keysNeedingValues.length > 0) {
        const valueResults = await Promise.allSettled(
          keysNeedingValues.map(key => fetchTagValues(environment, primaryRegion, accountId, key))
        )
        keysNeedingValues.forEach((key, i) => {
          const result = valueResults[i]
          if (result.status === 'fulfilled' && result.value.length > 0) {
            resourceTagMap.set(key, new Set(result.value))
          } else {
            resourceTagMap.set(key, new Set())
          }
        })
      }

      return Array.from(allKeys)
        .sort((a, b) => a.localeCompare(b))
        .map(key => ({
          key,
          exampleValues: Array.from(resourceTagMap.get(key) ?? []).sort().slice(0, MAX_EXAMPLE_VALUES)
        }))
    },
    {
      ttl: 600, // 10 minutes
      tags: [CacheTags.COSTS, environment, 'resource-tags', accountId]
    }
  )

  return sendSuccess(event, { tags })
}))
