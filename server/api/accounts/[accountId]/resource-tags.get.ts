/**
 * GET /api/accounts/:accountId/resource-tags
 * Discover tag keys (with example values) in use on resources in a specific AWS account.
 * Uses GetResources across all regions to match what the AWS Console Tag Editor shows.
 */

import { defineEventHandler } from 'h3'
import { GetResourcesCommand } from '@aws-sdk/client-resource-groups-tagging-api'
import { getResourceGroupsTaggingClient } from '../../../lib/aws-client-factory'
import { sendSuccess, parseQueryParams, handleAsync } from '../../../utils/api-response'
import { costCache, CacheTags } from '../../../utils/cache-manager'
import { logger } from '../../../utils/logger'
import type { AWSEnvironmentType } from '../../../types/aws'

const MAX_EXAMPLE_VALUES = 5

const COMMERCIAL_REGIONS = [
  'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
  'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-central-1',
  'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1', 'ap-northeast-2',
  'ap-south-1', 'sa-east-1', 'ca-central-1'
]

const GOVCLOUD_REGIONS = ['us-gov-west-1', 'us-gov-east-1']

/**
 * Scan a single region for all tagged resources and collect tag key-value pairs
 */
async function scanRegion(
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
    // Region may not be enabled for this account — skip silently
    logger.debug(`Skipping region ${region} for account ${accountId}: ${err.message}`)
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
      logger.info(`Fetching resource tags for account ${accountId} across ${regions.length} ${environment} regions...`)

      // Query all regions in parallel
      const regionResults = await Promise.allSettled(
        regions.map(region => scanRegion(environment, region, accountId))
      )

      // Merge results from all regions
      const mergedMap = new Map<string, Set<string>>()
      for (const result of regionResults) {
        if (result.status !== 'fulfilled') continue
        for (const [key, values] of result.value) {
          let merged = mergedMap.get(key)
          if (!merged) {
            merged = new Set<string>()
            mergedMap.set(key, merged)
          }
          for (const v of values) {
            if (merged.size < MAX_EXAMPLE_VALUES) {
              merged.add(v)
            }
          }
        }
      }

      return Array.from(mergedMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, values]) => ({
          key,
          exampleValues: Array.from(values).sort().slice(0, MAX_EXAMPLE_VALUES)
        }))
    },
    {
      ttl: 600, // 10 minutes
      tags: [CacheTags.COSTS, environment, 'resource-tags', accountId]
    }
  )

  return sendSuccess(event, { tags })
}))
