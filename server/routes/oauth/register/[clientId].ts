import { createError, defineEventHandler, getRouterParam } from 'h3'
import { handleOAuthProviderRequest } from '../../../mcp/oauth/http'
import { getOAuthProvider } from '../../../mcp/oauth/provider'
import { readManagedPolicy } from '../../../mcp/oauth/admin/managed-policy-service'
import { getOAuthStageInstrumentation } from '../../../mcp/oauth/admin/stage-instrumentation'
import { logger } from '../../../utils/logger'

/**
 * Dynamic client registration-management endpoint (RFC 7592).
 *
 * Managed-policy bypass guard (task 8.2, Req 7.7): a client carrying the
 * `ghost_managed_policy` extension is administrator-managed. Its policy
 * (lifecycle, approved resources/scopes, redirect policy) is owned by the admin
 * surface and MUST NOT be altered or stripped through the registration-management
 * endpoint using a registration access token. A mutating RFC 7592 request (PUT
 * to replace metadata, DELETE to remove the client) against a managed client is
 * rejected here BEFORE the provider processes it, so the managed extension
 * cannot be dropped and policy cannot be escalated.
 *
 * An UNMANAGED dynamic client (no extension, `readManagedPolicy === null`)
 * behaves EXACTLY as today: the request passes straight through to the provider,
 * including read (GET), update (PUT), and delete (DELETE) (Req 18.3).
 */
export default defineEventHandler(async event => {
  const method = event.method
  // Only mutating registration-management requests can strip/escalate policy.
  // A GET (read) of a managed client is harmless and stays unchanged.
  if (method === 'PUT' || method === 'DELETE') {
    const clientId = getRouterParam(event, 'clientId')
    if (clientId) {
      let managed = false
      try {
        const provider = await getOAuthProvider()
        const client = await provider.Client.find(clientId)
        managed = Boolean(client && readManagedPolicy(client.metadata() as Record<string, unknown>))
      } catch (error) {
        // Fail OPEN on a resolution error so unmanaged/normal flows are never
        // broken; only a positively-identified managed client is guarded.
        // `managed` remains false from its initializer.
        logger.warn('[MCP OAuth] Registration-management guard could not resolve client; passing through', error)
      }
      if (managed) {
        getOAuthStageInstrumentation().record({
          stage: 'registration',
          outcome: 'failure',
          httpStatus: 403,
          errorCode: 'managed_policy_protected',
          clientReference: clientId
        })
        throw createError({
          statusCode: 403,
          statusMessage: 'This client is administrator-managed and cannot be modified through dynamic registration management.'
        })
      }
    }
  }
  await handleOAuthProviderRequest(event)
})
