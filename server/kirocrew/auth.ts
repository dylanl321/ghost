import { createError, getHeader, setResponseHeader, type H3Event } from 'h3'
import { getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/server'
import { getGhostMcpIdentity } from '../mcp/oauth/identity'
import { getOAuthProvider } from '../mcp/oauth/provider'
import { getOAuthStageInstrumentation } from '../mcp/oauth/admin/stage-instrumentation'
import { isGrantRevoked } from '../mcp/oauth/admin/lifecycle-enforcement'
import { getKiroCrewResourceUrl } from './config'
import type { KiroCrewScope } from './types'
import { isTransientDependencyError } from '../mcp/oauth/transient-error'

/**
 * RFC 6750 / RFC 9728 challenge so OAuth clients can tell an expired token from
 * a missing scope and discover where to get a new one.
 */
function bearerChallenge(
  event: H3Event,
  statusCode: 401 | 403,
  error: 'invalid_token' | 'insufficient_scope' | undefined,
  message: string,
  scopes?: readonly string[]
) {
  const parts = [`resource_metadata="${getOAuthProtectedResourceMetadataUrl(getKiroCrewResourceUrl())}"`]
  if (error) parts.unshift(`error="${error}"`, `error_description="${message.replace(/"/g, "'")}"`)
  if (scopes?.length) parts.push(`scope="${scopes.join(' ')}"`)
  setResponseHeader(event, 'WWW-Authenticate', `Bearer ${parts.join(', ')}`)
  return createError({ statusCode, statusMessage: message })
}

async function findAccessToken(event: H3Event, token: string) {
  const provider = await getOAuthProvider()
  try {
    return await provider.AccessToken.find(token)
  } catch (error) {
    if (!isTransientDependencyError(error)) throw error
    // The token store is throttled or unreachable; the token may be fine.
    setResponseHeader(event, 'Retry-After', 5)
    throw createError({ statusCode: 503, statusMessage: 'OAuth token verification is temporarily unavailable. Retry shortly.' })
  }
}

export async function requireKiroCrewToken(
  event: H3Event,
  required: KiroCrewScope[]
) {
  // Crew configuration/profile retrieval boundary. Instrumentation is
  // fire-and-forget and self-guarding; it never alters the authorization
  // decision and only records the safe outcome/reason (Requirements 2.3, 4.1).
  const telemetry = getOAuthStageInstrumentation()
  const resource = getKiroCrewResourceUrl().href
  const authorization = getHeader(event, 'authorization') || ''
  const match = /^Bearer ([^\s]+)$/i.exec(authorization)
  if (!match) {
    telemetry.record({ stage: 'crew-profile-retrieval', outcome: 'failure', errorCode: 'missing_bearer', resourceReference: resource })
    throw bearerChallenge(event, 401, undefined, 'OAuth bearer token required', required)
  }

  const accessToken = await findAccessToken(event, match[1]!)
  if (!accessToken?.accountId || !accessToken.clientId || !accessToken.exp || accessToken.exp <= Math.floor(Date.now() / 1000)) {
    telemetry.record({ stage: 'crew-profile-retrieval', outcome: 'failure', errorCode: 'invalid_token', resourceReference: resource })
    throw bearerChallenge(event, 401, 'invalid_token', 'OAuth access token is invalid or expired')
  }

  // Task 9.2 (Req 9.2): the Crew configuration/profile boundary is an opaque-token
  // consumer, so it must reject a token whose grant is under a revocation marker
  // while the grant's credentials/indexes are being cleaned up. When no fence is
  // installed / no marker exists, `isGrantRevoked` returns false and this is a
  // pure pass-through, so a non-revoked grant is authorized exactly as today
  // (Req 18.2). The safe outcome is 401 (invalid/revoked token), not 403.
  const grantId = (accessToken as { grantId?: string }).grantId
  if (await isGrantRevoked(grantId)) {
    telemetry.record({
      stage: 'crew-profile-retrieval',
      outcome: 'failure',
      errorCode: 'grant_revoked',
      clientReference: accessToken.clientId,
      resourceReference: resource,
      subjectReference: accessToken.accountId
    })
    throw bearerChallenge(event, 401, 'invalid_token', 'OAuth access token grant has been revoked')
  }

  const audience = Array.isArray(accessToken.aud) ? accessToken.aud : [accessToken.aud]
  if (!audience.filter(Boolean).includes(resource)) {
    telemetry.record({
      stage: 'crew-profile-retrieval',
      outcome: 'failure',
      errorCode: 'invalid_audience',
      clientReference: accessToken.clientId,
      resourceReference: resource,
      subjectReference: accessToken.accountId
    })
    throw bearerChallenge(event, 401, 'invalid_token', 'OAuth token has the wrong resource audience')
  }
  const scopes = new Set(String(accessToken.scope || '').split(' ').filter(Boolean))
  if (!required.some(scope => scopes.has(scope))) {
    telemetry.record({
      stage: 'crew-profile-retrieval',
      outcome: 'denied',
      errorCode: 'insufficient_scope',
      clientReference: accessToken.clientId,
      resourceReference: resource,
      subjectReference: accessToken.accountId
    })
    throw bearerChallenge(event, 403, 'insufficient_scope', `Missing required scope: ${required.join(' or ')}`, required)
  }
  const identity = await getGhostMcpIdentity(accessToken.accountId)
  if (!identity) {
    telemetry.record({
      stage: 'crew-profile-retrieval',
      outcome: 'failure',
      errorCode: 'identity_missing',
      clientReference: accessToken.clientId,
      resourceReference: resource,
      subjectReference: accessToken.accountId
    })
    throw bearerChallenge(event, 401, 'invalid_token', 'OAuth identity no longer exists')
  }
  telemetry.record({
    stage: 'crew-profile-retrieval',
    outcome: 'success',
    clientReference: accessToken.clientId,
    resourceReference: resource,
    subjectReference: accessToken.accountId
  })
  return { accessToken, identity, scopes }
}
