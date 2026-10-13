import { createError, defineEventHandler } from 'h3'
import { handleOAuthProviderRequest } from '../../mcp/oauth/http'
import { checkMcpRateLimit } from '../../mcp/rate-limit'
import { getOAuthStageInstrumentation, readRawNetworkAddress } from '../../mcp/oauth/admin/stage-instrumentation'

export default defineEventHandler(async event => {
  const address = String(event.node.req.headers['x-forwarded-for'] || event.node.req.socket.remoteAddress || 'unknown').split(',')[0]!.trim()
  const decision = await checkMcpRateLimit(`oauth-register:${address}`, Number(process.env.GHOST_OAUTH_REGISTRATION_RATE_LIMIT_PER_HOUR || 10), 3600)
  if (!decision.allowed) {
    // A quota rejection never reaches the provider, so record the registration
    // failure here at the network boundary. Fire-and-forget; the raw address is
    // pseudonymized by the collector and discarded (Requirements 4.1, 16.4).
    getOAuthStageInstrumentation().record({
      stage: 'registration',
      outcome: 'failure',
      httpStatus: 429,
      errorCode: 'rate_limited',
      rawNetworkAddress: readRawNetworkAddress(event.node.req)
    })
    // Advertise the actual rate decision's cooldown so callers know when to
    // retry, matching the header convention in mcp.post.ts (Requirement 12.3).
    event.node.res.setHeader('Retry-After', decision.retryAfterSeconds)
    throw createError({ statusCode: 429, statusMessage: 'OAuth client registration rate limit exceeded' })
  }
  await handleOAuthProviderRequest(event)
})
