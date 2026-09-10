import { createError, getHeader, type H3Event } from 'h3'
import { getGhostMcpIdentity } from '../mcp/oauth/identity'
import { getOAuthProvider } from '../mcp/oauth/provider'
import { getKiroCrewResourceUrl } from './config'
import type { KiroCrewScope } from './types'

export async function requireKiroCrewToken(
  event: H3Event,
  required: KiroCrewScope[]
) {
  const authorization = getHeader(event, 'authorization') || ''
  const match = /^Bearer ([^\s]+)$/i.exec(authorization)
  if (!match) throw createError({ statusCode: 401, statusMessage: 'OAuth bearer token required' })

  const provider = await getOAuthProvider()
  const accessToken = await provider.AccessToken.find(match[1]!)
  if (!accessToken?.accountId || !accessToken.clientId || !accessToken.exp || accessToken.exp <= Math.floor(Date.now() / 1000)) {
    throw createError({ statusCode: 401, statusMessage: 'OAuth access token is invalid or expired' })
  }
  const audience = Array.isArray(accessToken.aud) ? accessToken.aud : [accessToken.aud]
  if (!audience.filter(Boolean).includes(getKiroCrewResourceUrl().href)) {
    throw createError({ statusCode: 401, statusMessage: 'OAuth token has the wrong resource audience' })
  }
  const scopes = new Set(String(accessToken.scope || '').split(' ').filter(Boolean))
  if (!required.some(scope => scopes.has(scope))) {
    throw createError({ statusCode: 403, statusMessage: `Missing required scope: ${required.join(' or ')}` })
  }
  const identity = await getGhostMcpIdentity(accessToken.accountId)
  if (!identity) throw createError({ statusCode: 401, statusMessage: 'OAuth identity no longer exists' })
  return { accessToken, identity, scopes }
}
