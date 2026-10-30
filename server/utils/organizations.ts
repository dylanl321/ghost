/**
 * AWS Organizations Utility Functions
 * Handles organizational unit operations and account management
 *
 * Throttle-hardened: exponential backoff with jitter on TooManyRequestsException,
 * serialized OU walk with concurrency limit + inter-call delay, partial-result
 * (degraded) tree on per-OU failures, and short-TTL in-memory cache.
 */

import { getOrganizationsClient } from '../lib/aws-client-factory'
import type { AWSEnvironmentType } from '../types/aws'
import { logger } from './logger'

export interface OrganizationalUnit {
  id: string
  arn: string
  name: string
  parentId?: string
  children?: OrganizationalUnit[]
  accounts?: string[]
}

export interface OrganizationInfo {
  id: string
  arn: string
  featureSet: string
  masterAccountId: string
  masterAccountEmail: string
  masterAccountArn: string
  availablePolicyTypes?: any[]
}

/**
 * Result shape from getOrganizationalUnitTree — carries a degraded flag when
 * one or more OUs could not be enumerated due to throttling.
 */
export interface OUTreeResult {
  tree: OrganizationalUnit | null
  /** True when at least one OU was skipped due to throttling / errors */
  degraded: boolean
  /** Human-readable list of OU IDs that failed */
  failedOUs: string[]
}

// ---------------------------------------------------------------------------
// Throttle-aware retry helper
// ---------------------------------------------------------------------------

const THROTTLE_ERROR_NAMES = new Set([
  'TooManyRequestsException',
  'ThrottlingException',
  'RequestThrottledException',
  'Throttling',
])

function isThrottleError(err: unknown): boolean {
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>
    if (typeof e.name === 'string' && THROTTLE_ERROR_NAMES.has(e.name)) return true
    if (typeof e.$metadata === 'object' && e.$metadata !== null) {
      const meta = e.$metadata as Record<string, unknown>
      if (meta.httpStatusCode === 429) return true
    }
  }
  return false
}

/**
 * Exponential backoff with full jitter for Organizations calls.
 * Only retries on throttle errors; all other errors propagate immediately.
 */
async function withOrgRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxAttempts = 6,
  baseDelayMs = 500
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (isThrottleError(err) && attempt < maxAttempts) {
        // Full-jitter exponential: delay in [0, base * 2^attempt]
        const cap = baseDelayMs * Math.pow(2, attempt)
        const delay = Math.floor(Math.random() * cap)
        logger.warn(
          `[Organizations] Throttled on ${label} (attempt ${attempt}/${maxAttempts}), ` +
          `retrying in ${delay}ms`
        )
        await new Promise(resolve => setTimeout(resolve, delay))
      } else {
        throw err
      }
    }
  }
  // Should never be reached, but TypeScript needs a return path
  throw new Error(`[Organizations] ${label} exhausted all ${maxAttempts} attempts`)
}

// ---------------------------------------------------------------------------
// Concurrency limiter (inline — avoids adding p-limit as a dependency)
// ---------------------------------------------------------------------------

/**
 * Creates a simple token-bucket concurrency limiter.
 * Returns a `run` function that queues tasks and never exceeds `concurrency`
 * simultaneous in-flight promises.
 */
function createConcurrencyLimiter(concurrency: number) {
  let running = 0
  const queue: Array<() => void> = []

  function next() {
    if (running >= concurrency || queue.length === 0) return
    const resume = queue.shift()!
    running++
    resume()
  }

  return async function run<T>(fn: () => Promise<T>): Promise<T> {
    if (running >= concurrency) {
      await new Promise<void>(resolve => queue.push(resolve))
    } else {
      running++
    }
    try {
      return await fn()
    } finally {
      running--
      next()
    }
  }
}

// One shared limiter for the recursive OU walk: max 2 concurrent API calls.
// Re-created per getOrganizationalUnitTree call so parallel top-level invocations
// don't share limits.
const OU_WALK_CONCURRENCY = 2
const OU_WALK_INTER_CALL_DELAY_MS = 150 // min delay between individual calls

// ---------------------------------------------------------------------------
// In-memory org-tree cache (short TTL — 5 minutes)
// ---------------------------------------------------------------------------

const ORG_TREE_CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

interface OUTreeCacheEntry {
  result: OUTreeResult
  expiresAt: number
}

const ouTreeCache = new Map<string, OUTreeCacheEntry>()

function getTreeCacheKey(environment: AWSEnvironmentType): string {
  return `ou-tree:${environment}`
}

function getCachedTree(environment: AWSEnvironmentType): OUTreeResult | null {
  const key = getTreeCacheKey(environment)
  const entry = ouTreeCache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    ouTreeCache.delete(key)
    return null
  }
  return entry.result
}

function setCachedTree(environment: AWSEnvironmentType, result: OUTreeResult): void {
  const key = getTreeCacheKey(environment)
  ouTreeCache.set(key, {
    result,
    expiresAt: Date.now() + ORG_TREE_CACHE_TTL_MS,
  })
}

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

function getOrganizationsAccountId(environment: AWSEnvironmentType): string | undefined {
  const prefix = environment === 'commercial' ? 'AWS_COMMERCIAL' : 'AWS_GOVCLOUD'
  return process.env[`${prefix}_ORGANIZATIONS_ACCOUNT_ID`]
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get organization information
 */
export async function getOrganizationInfo(
  environment: AWSEnvironmentType = 'commercial'
): Promise<OrganizationInfo | null> {
  try {
    const orgAccountId = getOrganizationsAccountId(environment)
    const region = environment === 'commercial' ? 'us-east-1' : 'us-gov-west-1'
    const client = await getOrganizationsClient(environment, region, orgAccountId)

    const { DescribeOrganizationCommand } = await import('@aws-sdk/client-organizations')
    const response = await withOrgRetry(
      () => client.send(new DescribeOrganizationCommand({})),
      'DescribeOrganization'
    )

    if (!response.Organization) return null

    return {
      id: response.Organization.Id!,
      arn: response.Organization.Arn!,
      featureSet: response.Organization.FeatureSet!,
      masterAccountId: response.Organization.MasterAccountId!,
      masterAccountEmail: response.Organization.MasterAccountEmail!,
      masterAccountArn: response.Organization.MasterAccountArn!,
      availablePolicyTypes: response.Organization.AvailablePolicyTypes,
    }
  } catch (error) {
    logger.error('Failed to get organization info:', error)
    return null
  }
}

/**
 * Get organizational unit tree.
 *
 * Returns an OUTreeResult with:
 *   - tree: root node (null if root can't be fetched)
 *   - degraded: true when at least one OU had to be skipped
 *   - failedOUs: list of OU IDs that failed
 *
 * Results are cached for ORG_TREE_CACHE_TTL_MS (5 min) to reduce API call volume.
 *
 * @param environment  AWS partition
 * @param bypassCache  Set true to force a fresh fetch even if cache is valid
 */
export async function getOrganizationalUnitTree(
  environment: AWSEnvironmentType = 'commercial',
  bypassCache = false
): Promise<OUTreeResult> {
  // Serve from cache if available and not explicitly bypassed
  if (!bypassCache) {
    const cached = getCachedTree(environment)
    if (cached) {
      logger.debug('[Organizations] Serving OU tree from cache')
      return cached
    }
  }

  const failedOUs: string[] = []
  let degraded = false

  try {
    const orgAccountId = getOrganizationsAccountId(environment)
    const region = environment === 'commercial' ? 'us-east-1' : 'us-gov-west-1'
    const client = await getOrganizationsClient(environment, region, orgAccountId)

    // Get root ID
    const { ListRootsCommand } = await import('@aws-sdk/client-organizations')
    const rootsResponse = await withOrgRetry(
      () => client.send(new ListRootsCommand({})),
      'ListRoots'
    )

    if (!rootsResponse.Roots || rootsResponse.Roots.length === 0) {
      const result: OUTreeResult = { tree: null, degraded: false, failedOUs: [] }
      setCachedTree(environment, result)
      return result
    }

    const root = rootsResponse.Roots[0]

    // Per-walk concurrency limiter — serialises OU enumeration to ≤2 concurrent
    const limit = createConcurrencyLimiter(OU_WALK_CONCURRENCY)

    async function buildTree(parentId: string): Promise<OrganizationalUnit> {
      // Fetch OUs and accounts for this node, serialised through the limiter
      const [ous, accounts] = await Promise.all([
        limit(async () => {
          await new Promise(resolve => setTimeout(resolve, OU_WALK_INTER_CALL_DELAY_MS))
          return listOrganizationalUnitsForTree(parentId, environment)
        }),
        limit(async () => {
          await new Promise(resolve => setTimeout(resolve, OU_WALK_INTER_CALL_DELAY_MS))
          // A failed account listing leaves this node's accounts out, so the
          // tree must be reported as degraded rather than complete.
          return listAccountsInOU(parentId, environment).catch((error) => {
            degraded = true
            failedOUs.push(parentId)
            logger.warn(`[Organizations] Failed to list accounts in OU ${parentId}: ${(error as Error).message ?? error}`)
            return [] as any[]
          })
        }),
      ])

      const node: OrganizationalUnit = {
        id: parentId,
        arn: parentId === root.Id ? root.Arn! : '',
        name: parentId === root.Id ? root.Name! : '',
        accounts: accounts.map(a => a.Id!),
        children: [],
      }

      // Build child subtrees sequentially (via the shared limiter)
      for (const ou of ous) {
        try {
          const child = await buildTree(ou.id)
          child.name = ou.name
          child.arn = ou.arn
          node.children!.push(child)
        } catch (childErr) {
          // Demoted from fatal to warn — partial tree is still useful
          degraded = true
          failedOUs.push(ou.id)
          logger.warn(
            `[Organizations] Failed to list accounts in OU ${ou.id} (${ou.name}), ` +
            `continuing with partial tree: ${(childErr as Error).message ?? childErr}`
          )
        }
      }

      return node
    }

    const tree = await buildTree(root.Id!)
    const result: OUTreeResult = { tree, degraded, failedOUs }

    if (degraded) {
      logger.warn(
        `[Organizations] OU tree is incomplete — ${failedOUs.length} OU(s) skipped: ` +
        failedOUs.join(', ')
      )
    }

    setCachedTree(environment, result)
    return result
  } catch (error) {
    logger.error('Failed to get OU tree:', error)
    return { tree: null, degraded: true, failedOUs }
  }
}

// ---------------------------------------------------------------------------
// Internal helper used only by buildTree (throws rather than swallows)
// ---------------------------------------------------------------------------

async function listOrganizationalUnitsForTree(
  parentId: string,
  environment: AWSEnvironmentType
): Promise<OrganizationalUnit[]> {
  const orgAccountId = getOrganizationsAccountId(environment)
  const region = environment === 'commercial' ? 'us-east-1' : 'us-gov-west-1'
  const client = await getOrganizationsClient(environment, region, orgAccountId)

  const { ListOrganizationalUnitsForParentCommand } = await import('@aws-sdk/client-organizations')
  const ous: OrganizationalUnit[] = []
  let nextToken: string | undefined

  do {
    const response = await withOrgRetry(
      () => client.send(
        new ListOrganizationalUnitsForParentCommand({
          ParentId: parentId,
          NextToken: nextToken,
        })
      ),
      `ListOrganizationalUnitsForParent(${parentId})`
    )

    if (response.OrganizationalUnits) {
      for (const ou of response.OrganizationalUnits) {
        ous.push({
          id: ou.Id!,
          arn: ou.Arn!,
          name: ou.Name!,
          parentId,
        })
      }
    }

    nextToken = response.NextToken
  } while (nextToken)

  return ous
}

// ---------------------------------------------------------------------------
// listAccountsInOU — now also throttle-retried
// ---------------------------------------------------------------------------

/**
 * List accounts in an organizational unit. Throws on failure so the tree
 * walk can mark itself degraded.
 */
export async function listAccountsInOU(
  ouId: string,
  environment: AWSEnvironmentType = 'commercial'
): Promise<any[]> {
  const orgAccountId = getOrganizationsAccountId(environment)
  const region = environment === 'commercial' ? 'us-east-1' : 'us-gov-west-1'
  const client = await getOrganizationsClient(environment, region, orgAccountId)

  const { ListAccountsForParentCommand } = await import('@aws-sdk/client-organizations')
  const accounts: any[] = []
  let nextToken: string | undefined

  do {
    const response = await withOrgRetry(
      () => client.send(
        new ListAccountsForParentCommand({
          ParentId: ouId,
          NextToken: nextToken,
        })
      ),
      `ListAccountsForParent(${ouId})`
    )

    if (response.Accounts) {
      accounts.push(...response.Accounts)
    }

    nextToken = response.NextToken
  } while (nextToken)

  return accounts
}

/**
 * Get account's organizational unit
 */
export async function getAccountOU(
  accountId: string,
  environment: AWSEnvironmentType = 'commercial'
): Promise<OrganizationalUnit | null> {
  try {
    const orgAccountId = getOrganizationsAccountId(environment)
    const region = environment === 'commercial' ? 'us-east-1' : 'us-gov-west-1'
    const client = await getOrganizationsClient(environment, region, orgAccountId)

    const { ListParentsCommand } = await import('@aws-sdk/client-organizations')
    const response = await withOrgRetry(
      () => client.send(new ListParentsCommand({ ChildId: accountId })),
      `ListParents(${accountId})`
    )

    if (!response.Parents || response.Parents.length === 0) {
      return null
    }

    const parent = response.Parents[0]

    // An account directly under the root has no OU to describe;
    // DescribeOrganizationalUnit rejects root IDs.
    if (parent.Type === 'ROOT') {
      return { id: parent.Id!, arn: '', name: 'Root' }
    }

    // Get OU details
    const { DescribeOrganizationalUnitCommand } = await import('@aws-sdk/client-organizations')
    const ouResponse = await withOrgRetry(
      () => client.send(
        new DescribeOrganizationalUnitCommand({
          OrganizationalUnitId: parent.Id!,
        })
      ),
      `DescribeOrganizationalUnit(${parent.Id})`
    )

    if (!ouResponse.OrganizationalUnit) return null

    return {
      id: ouResponse.OrganizationalUnit.Id!,
      arn: ouResponse.OrganizationalUnit.Arn!,
      name: ouResponse.OrganizationalUnit.Name!,
    }
  } catch (error) {
    logger.error(`Failed to get OU for account ${accountId}:`, error)
    return null
  }
}

/**
 * Get service control policies attached directly to an account
 */
export async function getAccountPolicies(
  accountId: string,
  environment: AWSEnvironmentType = 'commercial'
): Promise<any[]> {
  return getAttachedPolicies(accountId, 'ACCOUNT', environment)
}

/**
 * Get full policy document with statements
 */
export async function getPolicyDocument(
  policyId: string,
  environment: AWSEnvironmentType = 'commercial'
): Promise<any | null> {
  try {
    const orgAccountId = getOrganizationsAccountId(environment)
    const region = environment === 'commercial' ? 'us-east-1' : 'us-gov-west-1'
    const client = await getOrganizationsClient(environment, region, orgAccountId)

    const { DescribePolicyCommand } = await import('@aws-sdk/client-organizations')
    const response = await withOrgRetry(
      () => client.send(new DescribePolicyCommand({ PolicyId: policyId })),
      `DescribePolicy(${policyId})`
    )

    if (!response.Policy) return null

    // Parse the policy content JSON
    const policyContent = response.Policy.Content
      ? JSON.parse(response.Policy.Content)
      : null

    return {
      id: response.Policy.PolicySummary?.Id,
      arn: response.Policy.PolicySummary?.Arn,
      name: response.Policy.PolicySummary?.Name,
      description: response.Policy.PolicySummary?.Description,
      type: response.Policy.PolicySummary?.Type,
      awsManaged: response.Policy.PolicySummary?.AwsManaged,
      content: policyContent,
    }
  } catch (error) {
    logger.error(`Failed to get policy document for ${policyId}:`, error)
    return null
  }
}

/**
 * Get policies attached to a target (account or OU)
 */
export async function getAttachedPolicies(
  targetId: string,
  targetType: 'ACCOUNT' | 'ORGANIZATIONAL_UNIT',
  environment: AWSEnvironmentType = 'commercial'
): Promise<any[]> {
  try {
    const orgAccountId = getOrganizationsAccountId(environment)
    const region = environment === 'commercial' ? 'us-east-1' : 'us-gov-west-1'
    const client = await getOrganizationsClient(environment, region, orgAccountId)

    const { ListPoliciesForTargetCommand } = await import('@aws-sdk/client-organizations')
    const policies: any[] = []
    let nextToken: string | undefined

    do {
      const response = await withOrgRetry(
        () => client.send(
          new ListPoliciesForTargetCommand({
            TargetId: targetId,
            Filter: 'SERVICE_CONTROL_POLICY',
            NextToken: nextToken,
          })
        ),
        `ListPoliciesForTarget(${targetId})`
      )

      if (response.Policies) {
        policies.push(...response.Policies.map(policy => ({
          id: policy.Id,
          name: policy.Name,
          description: policy.Description,
          type: policy.Type,
          arn: policy.Arn,
        })))
      }

      nextToken = response.NextToken
    } while (nextToken)

    return policies
  } catch (error) {
    logger.error(`Failed to get policies for ${targetType} ${targetId}:`, error)
    return []
  }
}

export interface ScpPolicyInfo {
  id: string
  name: string
  description?: string
  type: string
  arn?: string
  source: 'direct' | 'inherited'
  attachedAt: string
}

/**
 * Collect the SCPs that apply to a target: those attached to it directly and
 * those inherited from every node on its OU path. allPolicies is the
 * de-duplicated union. Shared by the governance and policies routes.
 */
export async function collectScpPolicies(
  target: { id: string, type: 'ACCOUNT' | 'ORGANIZATIONAL_UNIT', label: string },
  hierarchy: Array<{ id: string, name: string }>,
  environment: AWSEnvironmentType = 'commercial'
): Promise<{ directPolicies: ScpPolicyInfo[], inheritedPolicies: ScpPolicyInfo[], allPolicies: ScpPolicyInfo[] }> {
  const toInfo = (policy: any, source: ScpPolicyInfo['source'], attachedAt: string): ScpPolicyInfo => ({
    id: policy.id,
    name: policy.name,
    description: policy.description,
    type: policy.type || 'SERVICE_CONTROL_POLICY',
    arn: policy.arn,
    source,
    attachedAt
  })

  const directPolicies = (await getAttachedPolicies(target.id, target.type, environment))
    .map(policy => toInfo(policy, 'direct', target.label))

  const inheritedPolicies: ScpPolicyInfo[] = []
  for (const node of hierarchy) {
    if (node.id === target.id) continue
    const policies = await getAttachedPolicies(node.id, 'ORGANIZATIONAL_UNIT', environment)
    inheritedPolicies.push(...policies.map(policy => toInfo(policy, 'inherited', node.name)))
  }

  const seen = new Set<string>()
  const allPolicies = [...directPolicies, ...inheritedPolicies].filter((policy) => {
    if (seen.has(policy.id)) return false
    seen.add(policy.id)
    return true
  })

  return { directPolicies, inheritedPolicies, allPolicies }
}
