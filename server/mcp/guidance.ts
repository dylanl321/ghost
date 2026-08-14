import { explainMcpIdentityCenterUserAccess } from './idc-admin-access'
import type { GhostMcpPrincipal, GhostToolGuidance } from './types'
import type { ResolvedAccountRef } from './tool-input'

const accessCache = new Map<string, { expiresAt: number; accountIds: Set<string> }>()
const ACCESS_CACHE_TTL_MS = 5 * 60_000

export function centralAccountIds(): Set<string> {
  return new Set([
    process.env.AWS_GOVCLOUD_ORGANIZATIONS_ACCOUNT_ID || '374673712317',
    process.env.AWS_COMMERCIAL_ORGANIZATIONS_ACCOUNT_ID || '205950196477',
    process.env.AWS_MASTER_ACCOUNT_ID || '205950196477',
    process.env.AWS_GOVCLOUD_SECURITY_LAKE_ACCOUNT || '083876038518',
    process.env.AWS_COMMERCIAL_SECURITY_LAKE_ACCOUNT || '253821132832',
    process.env.AWS_DEPLOYMENT_ACCOUNT_ID || '461760157232',
    process.env.AWS_PROFORMA_ACCOUNT_ID || '253821132832',
    ...(process.env.GHOST_MCP_CENTRAL_ACCOUNT_IDS || '').split(',').map(value => value.trim()).filter(Boolean)
  ].filter(Boolean))
}

export function isCentralAccount(accountId: string): boolean {
  return centralAccountIds().has(accountId)
}

async function effectiveAccountIds(principal: GhostMcpPrincipal, environment: 'commercial' | 'govcloud'): Promise<Set<string>> {
  const cacheKey = `${principal.email}:${environment}`
  const cached = accessCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.accountIds
  const access = await explainMcpIdentityCenterUserAccess(principal.email, [environment])
  const accountIds = new Set(access.map(assignment => assignment.accountId))
  accessCache.set(cacheKey, { expiresAt: Date.now() + ACCESS_CACHE_TTL_MS, accountIds })
  return accountIds
}

export async function advancedQueryGuidance(
  principal: GhostMcpPrincipal,
  account: ResolvedAccountRef,
  commandTemplate: string
): Promise<GhostToolGuidance[]> {
  if (isCentralAccount(account.selectedAccountId)) return []
  try {
    const allowed = await effectiveAccountIds(principal, account.environment)
    if (!allowed.has(account.selectedAccountId)) return []
    return [{
      code: 'advanced_direct_query',
      message: 'For fields or operations not exposed by this bounded tool, confirm your assigned role and use short-lived IAM Identity Center credentials for a process-local direct AWS query.',
      tools: ['ghost.access.mine', 'ghost.credentials.start', 'ghost.credentials.issue'],
      commandTemplate,
      requiresConfirmation: true
    }]
  } catch {
    // Guidance fails closed when effective account access cannot be verified.
    return []
  }
}
