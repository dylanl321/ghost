import type { H3Event } from 'h3'
import { getClientAddress } from '../../utils/client-address'
import { checkMcpRateLimit } from '../rate-limit'
import { getOAuthStageInstrumentation } from './admin/stage-instrumentation'

/**
 * Per-address quota on dynamic client registration.
 *
 * Returns true when the request was rejected and a response has been sent.
 * The rejection uses the RFC 7591 error shape OAuth clients already parse, plus
 * Retry-After, rather than the generic H3 error body.
 */
export async function rejectIfRegistrationRateLimited(event: H3Event): Promise<boolean> {
  const address = getClientAddress(event.node.req) || 'unknown'
  const limit = Number(process.env.GHOST_OAUTH_REGISTRATION_RATE_LIMIT_PER_HOUR || 10)
  const decision = await checkMcpRateLimit(`oauth-register:${address}`, limit, 3600)
  if (decision.allowed) return false

  // A quota rejection never reaches the provider, so record the registration
  // failure here at the network boundary. Fire-and-forget; the raw address is
  // pseudonymized by the collector and discarded (Requirements 4.1, 16.4).
  getOAuthStageInstrumentation().record({
    stage: 'registration',
    outcome: 'failure',
    httpStatus: 429,
    errorCode: 'rate_limited',
    rawNetworkAddress: address === 'unknown' ? undefined : address
  })
  const res = event.node.res
  res.statusCode = 429
  res.setHeader('Retry-After', decision.retryAfterSeconds)
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify({
    error: 'too_many_requests',
    error_description: `OAuth client registration rate limit exceeded. Retry after ${decision.retryAfterSeconds} seconds.`
  }))
  return true
}
