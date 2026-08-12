import { createError, defineEventHandler } from 'h3'
import { handleOAuthProviderRequest } from '../../mcp/oauth/http'
import { checkMcpRateLimit } from '../../mcp/rate-limit'

export default defineEventHandler(async event => {
  const address = String(event.node.req.headers['x-forwarded-for'] || event.node.req.socket.remoteAddress || 'unknown').split(',')[0]!.trim()
  const decision = checkMcpRateLimit(`oauth-register:${address}`, Number(process.env.GHOST_OAUTH_REGISTRATION_RATE_LIMIT_PER_HOUR || 10), 3600)
  if (!decision.allowed) throw createError({ statusCode: 429, statusMessage: 'OAuth client registration rate limit exceeded' })
  await handleOAuthProviderRequest(event)
})

