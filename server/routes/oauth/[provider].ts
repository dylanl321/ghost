import { createError, defineEventHandler, getRouterParam } from 'h3'
import { handleOAuthProviderRequest } from '../../mcp/oauth/http'
import { rejectIfRegistrationRateLimited } from '../../mcp/oauth/registration-rate-limit'

const PROVIDER_ENDPOINTS = new Set(['authorize', 'token', 'register', 'jwks', 'revoke'])

export default defineEventHandler(async event => {
  const endpoint = getRouterParam(event, 'provider') || ''
  if (!PROVIDER_ENDPOINTS.has(endpoint)) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  if (endpoint === 'register' && event.method === 'POST' && await rejectIfRegistrationRateLimited(event)) return
  // Route authorize/token through the managed lifecycle gate (task 8.2). Other
  // provider endpoints (jwks/revoke/register) are not lifecycle-gated here.
  const boundary = endpoint === 'authorize' ? 'authorize' : endpoint === 'token' ? 'token' : undefined
  await handleOAuthProviderRequest(event, boundary)
})
