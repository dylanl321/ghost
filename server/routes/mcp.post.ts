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
import { checkMcpRateLimit, extractMcpToolNames } from '../mcp/rate-limit'
import { getMcpPrincipal } from '../mcp/policy'

const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(getMcpResourceUrl())

export default defineEventHandler(async event => {
  const request = toWebRequest(event)
  let toolNames: string[] = []
  try {
    toolNames = extractMcpToolNames(await request.clone().json())
  } catch {
    // Protocol negotiation requests may not have a JSON body.
  }
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
      tools: toolNames,
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

    const requestCount = Math.max(1, toolNames.length)
    const aiCount = toolNames.filter(name => name.startsWith('ghost.ai.')).length
    const exportCount = toolNames.filter(name => name === 'ghost.reports.start_export').length
    const baseLimit = await checkMcpRateLimit(`${principal.subject}:all`, Number(process.env.GHOST_MCP_RATE_LIMIT_PER_MINUTE || 120), 60, requestCount)
    const aiLimit = aiCount
      ? await checkMcpRateLimit(`${principal.subject}:ai`, Number(process.env.GHOST_MCP_AI_RATE_LIMIT_PER_MINUTE || 10), 60, aiCount)
      : { allowed: true, retryAfterSeconds: 0 }
    const exportLimit = exportCount
      ? await checkMcpRateLimit(`${principal.subject}:exports`, Number(process.env.GHOST_MCP_EXPORT_RATE_LIMIT_PER_HOUR || 5), 3600, exportCount)
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
