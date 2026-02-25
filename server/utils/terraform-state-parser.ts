/**
 * Terraform State Parser
 * Reads and parses Terraform state files from S3 in GovCloud,
 * and compares state resources against planned pipeline changes.
 */

import { GetObjectCommand } from '@aws-sdk/client-s3'
import { getS3Client } from '../lib/aws-client-factory'
import { logger } from './logger'
import { getCacheManager } from './cache-manager'
import type { TerraformStateResource, StateComparison, ResourceChange } from '../../shared/types/pipelines'

const STATE_BUCKET = 'gdmslandingzone-tf-statefiles'
const GOVCLOUD_MASTER_ACCOUNT = '374244613498'
const CACHE_TTL_SECONDS = 300 // 5 minutes

/**
 * Fetch and parse a Terraform state file from S3 in GovCloud.
 * Uses the master account (374) to read from the central state bucket.
 * Results are cached for 5 minutes to avoid repeated S3 reads.
 *
 * @param repoName - Repository name (first segment of the S3 key)
 * @param accountId - AWS account ID (second segment, used as filename prefix)
 * @returns Parsed state JSON object, or null if the file could not be fetched/parsed
 */
export async function fetchStateFile(repoName: string, accountId: string): Promise<any | null> {
  const cacheKey = `terraform-state:${repoName}:${accountId}`
  const cache = getCacheManager()

  // Check cache first
  const cached = await cache.get<any>(cacheKey)
  if (cached !== null) {
    logger.debug(`[Terraform State] Cache hit for ${repoName}/${accountId}`)
    return cached
  }

  const s3Key = `${repoName}/${accountId}.tfstate`

  try {
    const s3Client = await getS3Client('govcloud', 'us-gov-west-1', GOVCLOUD_MASTER_ACCOUNT)

    const command = new GetObjectCommand({
      Bucket: STATE_BUCKET,
      Key: s3Key
    })

    const response = await s3Client.send(command)

    if (!response.Body) {
      logger.warn(`[Terraform State] Empty response body for s3://${STATE_BUCKET}/${s3Key}`)
      return null
    }

    // Read the stream into a string
    const bodyString = await response.Body.transformToString('utf-8')
    const stateJson = JSON.parse(bodyString)

    // Cache the parsed result
    await cache.set(cacheKey, stateJson, {
      ttl: CACHE_TTL_SECONDS,
      tags: ['terraform-state']
    })

    logger.info(`[Terraform State] Fetched and cached state file: s3://${STATE_BUCKET}/${s3Key}`)
    return stateJson
  } catch (error: any) {
    // Log the error but do not throw -- callers receive null on failure
    if (error?.name === 'NoSuchKey') {
      logger.warn(`[Terraform State] State file not found: s3://${STATE_BUCKET}/${s3Key}`)
    } else {
      logger.error(`[Terraform State] Failed to fetch state file s3://${STATE_BUCKET}/${s3Key}:`, error?.message || error)
    }
    return null
  }
}

/**
 * Parse the resources array from a Terraform state JSON object.
 * Terraform state files (v4) contain a top-level `resources` array where each
 * entry has type, name, module, provider, and instances.
 *
 * @param stateJson - Raw parsed Terraform state JSON
 * @returns Flattened array of TerraformStateResource entries
 */
export function parseStateResources(stateJson: any): TerraformStateResource[] {
  if (!stateJson || !Array.isArray(stateJson.resources)) {
    logger.warn('[Terraform State] State JSON has no resources array')
    return []
  }

  return stateJson.resources.map((resource: any) => {
    const modulePath = resource.module || ''
    const type = resource.type || ''
    const name = resource.name || ''

    // Build the full address: module.module_name.type.name or just type.name
    const address = modulePath
      ? `${modulePath}.${type}.${name}`
      : `${type}.${name}`

    return {
      type,
      name,
      module: modulePath,
      address,
      provider: resource.provider || '',
      instances_count: Array.isArray(resource.instances) ? resource.instances.length : 0
    } satisfies TerraformStateResource
  })
}

/**
 * Compare resources present in Terraform state against planned resource changes
 * from pipeline telemetry. Identifies resources that exist only in state,
 * only in the plan, or in both.
 *
 * Matching is performed on resource type + name extracted from the resource address.
 *
 * @param stateResources - Resources parsed from the state file
 * @param plannedResources - Resource changes recorded by the pipeline
 * @returns StateComparison with inStateOnly, inPlanOnly, and matched arrays
 */
export function compareStateToPlanned(
  stateResources: TerraformStateResource[],
  plannedResources: ResourceChange[]
): StateComparison {
  // Build a lookup set for state resources keyed by "type.name"
  const stateByKey = new Map<string, TerraformStateResource>()
  for (const sr of stateResources) {
    const key = `${sr.type}.${sr.name}`
    stateByKey.set(key, sr)
  }

  // Extract type and name from a resource_address like "module.foo.aws_instance.bar"
  // The last two dot-separated segments are always type.name
  function extractTypeAndName(address: string): { type: string; name: string } | null {
    const parts = address.split('.')
    if (parts.length < 2) {
      return null
    }
    return {
      type: parts[parts.length - 2],
      name: parts[parts.length - 1]
    }
  }

  // Build a lookup set for planned resources keyed by "type.name"
  const planByKey = new Map<string, ResourceChange>()
  for (const pr of plannedResources) {
    const parsed = extractTypeAndName(pr.resource_address)
    if (parsed) {
      const key = `${parsed.type}.${parsed.name}`
      planByKey.set(key, pr)
    }
  }

  const matched: StateComparison['matched'] = []
  const inStateOnly: TerraformStateResource[] = []
  const inPlanOnly: StateComparison['inPlanOnly'] = []

  // Walk state resources and check against plan
  for (const [key, sr] of stateByKey.entries()) {
    if (planByKey.has(key)) {
      matched.push({
        address: sr.address,
        type: sr.type,
        inState: true,
        inPlan: true
      })
    } else {
      inStateOnly.push(sr)
    }
  }

  // Walk plan resources and find those not in state
  for (const [key, pr] of planByKey.entries()) {
    if (!stateByKey.has(key)) {
      inPlanOnly.push({
        resource_address: pr.resource_address,
        resource_type: pr.resource_type,
        change_action: pr.change_action,
        timestamp: pr.timestamp
      })
    }
  }

  return {
    inStateOnly,
    inPlanOnly,
    matched,
    stateResourceCount: stateResources.length,
    planResourceCount: plannedResources.length
  }
}
