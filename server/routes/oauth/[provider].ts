import { createError, defineEventHandler, getRouterParam } from 'h3'
import { handleOAuthProviderRequest } from '../../mcp/oauth/http'
import { checkMcpRateLimit } from '../../mcp/rate-limit'
import { getOAuthStageInstrumentation, readRawNetworkAddress } from '../../mcp/oauth/admin/stage-instrumentation'

const PROVIDER_ENDPOINTS = new Set(['authorize', 'token', 'register', 'jwks', 'revoke'])

export default defineEventHandler(async event => {
  const endpoint = getRouterParam(event, 'provider') || ''
  if (!PROVIDER_ENDPOINTS.has(endpoint)) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  if (endpoint === 'register' && event.method === 'POST') {
    const address = String(event.node.req.headers['x-forwarded-for'] || event.node.req.socket.remoteAddress || 'unknown').split(',')[0]!.trim()
    const decision = await checkMcpRateLimit(`oauth-register:${address}`, Number(process.env.GHOST_OAUTH_REGISTRATION_RATE_LIMIT_PER_HOUR || 10), 3600)
    if (!decision.allowed) {
      // Quota rejection short-circuits before the provider; record the failure
      // at this network boundary. Fire-and-forget; raw address pseudonymized
      // then discarded by the collector (Requirements 4.1, 16.4).
      getOAuthStageInstrumentation().record({
        stage: 'registration',
        outcome: 'failure',
        httpStatus: 429,
        errorCode: 'rate_limited',
        rawNetworkAddress: readRawNetworkAddress(event.node.req)
      })
      throw createError({ statusCode: 429, statusMessage: 'OAuth client registration rate limit exceeded' })
    }
  }
  // Route authorize/token through the managed lifecycle gate (task 8.2). Other
  // provider endpoints (jwks/revoke/register) are not lifecycle-gated here.
  const boundary = endpoint === 'authorize' ? 'authorize' : endpoint === 'token' ? 'token' : undefined
  await handleOAuthProviderRequest(event, boundary)
})
