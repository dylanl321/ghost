/**
 * OAuth "consent-once" grant pointer.
 *
 * Native public clients (MCP, Kiro Crew) are re-prompted for consent on every
 * authorization request unless the provider can find a prior grant to reuse.
 * `oidc-provider`'s default `loadExistingGrant` only reuses a grant that is
 * already associated with the CURRENT OIDC session (`session.grantIdFor`) or
 * carried on the in-flight interaction result. Codex typically starts a fresh
 * browser context per `codex mcp login`, so there is no session association to
 * reuse — and the user sees the "Allow access" button every single time.
 *
 * This module records a small, deterministic pointer from a
 * `(subject, clientId)` pair to the grant id that was last approved for it, so
 * a custom `loadExistingGrant` can find and reuse that grant across sessions.
 * That turns the flow into pure SSO: the user approves once, and subsequent
 * sign-ins for the same application resume silently.
 *
 * SAFETY:
 * - The pointer is only a convenience index; it grants nothing. Reuse of the
 *   grant it points at is still gated by the SAME managed-lifecycle and
 *   grant-revocation checks the consent boundary enforces (see
 *   `loadExistingGrant` in `provider.ts`). A blocked/retired client or a
 *   revoked grant is never silently reused.
 * - It stores only opaque references (`subject`, `clientId`, `grantId`) — no
 *   tokens, secrets, scopes, or identity detail.
 * - It uses the SAME OAuth artifact table and primary-key access pattern as the
 *   identity store; it introduces NO new table or secondary index.
 */

import { getItem, putItem } from '../../utils/dynamodb'
import { getOAuthTableConfig, useDurableOAuthStore } from '../config'

/** In-memory pointer store for development (no durable OAuth store configured). */
const developmentGrantPointers = new Map<string, string>()

/**
 * A stable, deployment-safe key for the `(subject, clientId)` pointer. The
 * subject and clientId are opaque references; the delimiter is a `#` consistent
 * with the other artifact keys in this table.
 */
function grantPointerKey(subject: string, clientId: string) {
  return { artifactId: `GhostGrantPointer#${subject}#${clientId}` }
}

/** The in-memory map key mirrors the durable artifactId for parity in tests. */
function memoryKey(subject: string, clientId: string): string {
  return grantPointerKey(subject, clientId).artifactId
}

/**
 * Record the grant id last approved for a `(subject, clientId)` pair so a later
 * authorization can reuse it without re-prompting for consent. Overwrites any
 * previous pointer for the pair (the newest approved grant wins). Never throws
 * to the caller's critical path — the pointer is a convenience, so a write
 * failure degrades to "prompt again" rather than failing consent.
 */
export async function saveGrantPointer(subject: string, clientId: string, grantId: string): Promise<void> {
  if (!subject || !clientId || !grantId) return
  if (!useDurableOAuthStore()) {
    developmentGrantPointers.set(memoryKey(subject, clientId), grantId)
    return
  }
  const config = getOAuthTableConfig()
  await putItem(config.tableName, {
    ...grantPointerKey(subject, clientId),
    model: 'GhostGrantPointer',
    payload: { subject, clientId, grantId }
  }, config.environment, config.accountId)
}

/**
 * Resolve the grant id last approved for a `(subject, clientId)` pair, or
 * `undefined` when none is recorded. Returns `undefined` on any read failure so
 * the caller falls back to prompting rather than erroring.
 */
export async function findGrantPointer(subject: string, clientId: string): Promise<string | undefined> {
  if (!subject || !clientId) return undefined
  if (!useDurableOAuthStore()) return developmentGrantPointers.get(memoryKey(subject, clientId))
  const config = getOAuthTableConfig()
  try {
    const item = await getItem(
      config.tableName,
      grantPointerKey(subject, clientId),
      config.environment,
      config.accountId
    ) as { payload?: { grantId?: string } } | null
    const grantId = item?.payload?.grantId
    return typeof grantId === 'string' && grantId ? grantId : undefined
  } catch {
    return undefined
  }
}

/** Test-only reset of the in-memory development pointer store. */
export function resetDevelopmentGrantPointers(): void {
  developmentGrantPointers.clear()
}
