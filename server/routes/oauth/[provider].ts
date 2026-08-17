import { createError, defineEventHandler, getRouterParam } from 'h3'
import { handleOAuthProviderRequest } from '../../mcp/oauth/http'
import { checkMcpRateLimit } from '../../mcp/rate-limit'

const PROVIDER_ENDPOINTS = new Set(['authorize', 'token', 'register', 'jwks', 'revoke'])

export default defineEventHandler(async event => {
  const endpoint = getRouterParam(event, 'provider') || ''
  if (!PROVIDER_ENDPOINTS.has(endpoint)) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  if (endpoint === 'register' && event.method === 'POST') {
    const address = String(event.node.req.headers['x-forwarded-for'] || event.node.req.socket.remoteAddress || 'unknown').split(',')[0]!.trim()
    const decision = await checkMcpRateLimit(`oauth-register:${address}`, Number(process.env.GHOST_OAUTH_REGISTRATION_RATE_LIMIT_PER_HOUR || 10), 3600)
    if (!decision.allowed) throw createError({ statusCode: 429, statusMessage: 'OAuth client registration rate limit exceeded' })
  }
  await handleOAuthProviderRequest(event)
})
