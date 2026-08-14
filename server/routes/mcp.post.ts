import {
  bearerAuthChallengeResponse,
  getOAuthProtectedResourceMetadataUrl,
  hostHeaderValidationResponse,
  originValidationResponse,
  verifyBearerToken
} from '@modelcontextprotocol/server'
import { defineEventHandler, sendWebResponse, toWebRequest } from 'h3'
import { getAllowedMcpHosts, getAllowedMcpOrigins, getMcpResourceUrl } from '../mcp/config'
import { ghostMcpHandler } from '../mcp/server'
import { ghostOAuthTokenVerifier } from '../mcp/oauth/token-verifier'
import { checkMcpRateLimit } from '../mcp/rate-limit'
import { getMcpPrincipal } from '../mcp/policy'

const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(getMcpResourceUrl())

export default defineEventHandler(async event => {
  const request = toWebRequest(event)
  const rejected = hostHeaderValidationResponse(request, getAllowedMcpHosts()) ||
    originValidationResponse(request, getAllowedMcpOrigins())
  if (rejected) return sendWebResponse(event, rejected)

  const start = performance.now()
  let clientId: string | undefined
  let subject: string | undefined
  event.node.res.on('finish', () => {
    process.stdout.write(JSON.stringify({
      type: 'mcp_request',
      timestamp: new Date().toISOString(),
      method: event.node.req.headers['mcp-method'],
      tool: event.node.req.headers['mcp-name'],
      clientId,
      subject,
      statusCode: event.node.res.statusCode,
      durationMs: Math.round((performance.now() - start) * 100) / 100
    }) + '\n')
  })

  try {
    const authInfo = await verifyBearerToken(event.node.req.headers.authorization, {
      verifier: ghostOAuthTokenVerifier,
      resourceMetadataUrl
    })
    const principal = getMcpPrincipal(authInfo)
    clientId = principal.clientId
    subject = principal.subject

    const toolName = String(event.node.req.headers['mcp-name'] || '')
    const baseLimit = checkMcpRateLimit(`${principal.subject}:all`, Number(process.env.GHOST_MCP_RATE_LIMIT_PER_MINUTE || 120), 60)
    const aiLimit = toolName.startsWith('ghost.ai.')
      ? checkMcpRateLimit(`${principal.subject}:ai`, Number(process.env.GHOST_MCP_AI_RATE_LIMIT_PER_MINUTE || 10), 60)
      : { allowed: true, retryAfterSeconds: 0 }
    const exportLimit = toolName === 'ghost.reports.start_export'
      ? checkMcpRateLimit(`${principal.subject}:exports`, Number(process.env.GHOST_MCP_EXPORT_RATE_LIMIT_PER_HOUR || 5), 3600)
      : { allowed: true, retryAfterSeconds: 0 }
    const denied = [baseLimit, aiLimit, exportLimit].find(limit => !limit.allowed)
    if (denied) {
      event.node.res.statusCode = 429
      event.node.res.setHeader('Retry-After', denied.retryAfterSeconds)
      event.node.res.setHeader('Content-Type', 'application/json')
      event.node.res.end(JSON.stringify({ error: 'too_many_requests', error_description: 'MCP request rate limit exceeded' }))
      return
    }

    const response = await ghostMcpHandler.fetch(request, { authInfo })
    const headers = new Headers(response.headers)
    headers.set('X-Accel-Buffering', 'no')
    return sendWebResponse(event, new Response(response.body, { status: response.status, statusText: response.statusText, headers }))
  } catch (error) {
    return sendWebResponse(event, bearerAuthChallengeResponse(error, {
      requiredScopes: ['ghost.read'],
      resourceMetadataUrl
    }))
  }
})
