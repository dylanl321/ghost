/**
 * Request Timing Middleware
 *
 * Logs structured JSON for every API request with duration and
 * background job correlation. Named 00- to run before other middleware.
 *
 * Output is written directly to stdout so CloudWatch Log Insights
 * metric filters can extract APILatencyMs and backgroundJobActive.
 */

import { randomUUID } from 'node:crypto'
import { defineEventHandler, getRequestURL, getHeader, setResponseHeader } from 'h3'
import { isAnyJobRunning, getActiveJobs } from '../utils/job-tracker'

// Normalize dynamic path segments for Log Insights grouping
function normalizePath(path: string): string {
  return path
    // Strip query string
    .split('?')[0]
    // Replace UUIDs (8-4-4-4-12 hex)
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
    // Replace long hex strings (8+ chars)
    .replace(/\/[0-9a-f]{8,}/gi, '/:id')
    // Replace pure numeric segments
    .replace(/\/\d+/g, '/:num')
}

interface RequestAuthContext {
  isAuthenticated?: boolean
  authType?: string
  apiKeyId?: string
  user?: {
    id?: unknown
    oid?: unknown
    sub?: unknown
    claims?: { id?: unknown; oid?: unknown; sub?: unknown } | null
  } | null
}

function firstStableId(...candidates: unknown[]): string | undefined {
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length > 0) return candidate
  }
  return undefined
}

/**
 * Derive non-secret correlation fields from the auth context. Only stable
 * identifiers are returned (oid/sub/id for users, apiKeyId for API keys) —
 * never tokens, cookies, email addresses, or raw credentials.
 */
export function resolveRequestAuthContext(
  auth: RequestAuthContext | undefined | null
): { authType?: string; userId?: string } {
  if (!auth?.isAuthenticated) return {}
  const user = auth.user || {}
  const claims = user.claims || {}
  const userId = auth.authType === 'apikey'
    ? firstStableId(auth.apiKeyId)
    : firstStableId(user.oid, user.sub, user.id, claims.oid, claims.sub, claims.id)
  return {
    ...(auth.authType ? { authType: auth.authType } : {}),
    ...(userId ? { userId } : {})
  }
}

export default defineEventHandler((event) => {
  const url = getRequestURL(event)
  const pathname = url.pathname

  // Correlate every request, even skipped ones, so downstream handlers and
  // clients can reference a single id.
  const requestId = getHeader(event, 'x-request-id') || randomUUID()
  event.context.requestId = requestId
  setResponseHeader(event, 'x-request-id', requestId)

  // Only track API routes, skip health checks (ALB polls every 30s)
  if (!pathname.startsWith('/api/') || pathname === '/api/health') {
    return
  }

  const start = performance.now()

  event.node.res.on('finish', () => {
    const durationMs = Math.round((performance.now() - start) * 100) / 100
    const backgroundJobActive = isAnyJobRunning()

    const entry: Record<string, unknown> = {
      type: 'request',
      requestId,
      method: event.method,
      path: normalizePath(pathname),
      statusCode: event.node.res.statusCode,
      durationMs,
      backgroundJobActive,
    }

    if (backgroundJobActive) {
      entry.activeJobs = getActiveJobs()
    }

    // Attach non-secret auth context when the request is authenticated.
    const { authType, userId } = resolveRequestAuthContext(event.context.auth)
    if (authType) entry.authType = authType
    if (userId) entry.userId = userId

    entry.timestamp = new Date().toISOString()

    process.stdout.write(JSON.stringify(entry) + '\n')
  })
})
