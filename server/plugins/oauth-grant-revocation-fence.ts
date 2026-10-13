/**
 * OAuth Administration — grant-revocation fence installation (task 9.2).
 *
 * Installs the deployment's marker-backed grant-revocation fence ONCE, at server
 * startup, before any OAuth/MCP/Crew request is served. After this plugin runs,
 * `isGrantRevoked(grantId)` is marker-backed in the running app, so every
 * opaque-token consumer and issuance boundary rejects a marked (revoked) grant
 * (design "Managed policy and operation flow": "Authorization, code exchange,
 * refresh, and every opaque-token consumer must reject a marked grant").
 *
 * The installer is idempotent and reads only the server-derived marker store; it
 * NEVER marks a grant. For an unmanaged/unmarked grant the fence returns false,
 * so existing OAuth behavior is unchanged (Req 9.2, 18.2). A memory-only
 * deployment installs the process-local in-memory fence.
 */

import { installGrantRevocationFence } from '../mcp/oauth/admin/grant-revocation-service'
import { logger } from '../utils/logger'

export default defineNitroPlugin(() => {
  try {
    installGrantRevocationFence()
    logger.debug('[MCP OAuth] Grant-revocation fence installed')
  } catch (error) {
    // Installing the fence must never break server startup. If it fails, the
    // no-op default fence remains (no grant is ever marked revoked), which is
    // the same fail-safe as before task 9 — unmarked grants are unaffected.
    logger.error('[MCP OAuth] Failed to install grant-revocation fence', error)
  }
})
