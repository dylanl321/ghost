/**
 * Request Timing Middleware
 *
 * Logs structured JSON for every API request with duration and
 * background job correlation. Named 00- to run before other middleware.
 *
 * Output is written directly to stdout so CloudWatch Log Insights
 * metric filters can extract APILatencyMs and backgroundJobActive.
 */

import { defineEventHandler, getRequestURL, getRequestHeader, setResponseHeader } from 'h3'
import { randomUUID } from 'node:crypto'
import { isAnyJobRunning, getActiveJobs } from '../utils/job-tracker'
import { normalizePath, isSafeRequestId } from '../utils/request-telemetry'

export default defineEventHandler((event) => {
  const url = getRequestURL(event)
  const pathname = url.pathname

  // Only track API routes, skip health checks (ALB polls every 30s)
  if (!pathname.startsWith('/api/') || pathname === '/api/health') {
    return
  }

  // Establish a request id for end-to-end correlation. Accept an incoming
  // x-request-id only if it is a safe bounded token; otherwise generate one.
  const incoming = getRequestHeader(event, 'x-request-id')
  const requestId = isSafeRequestId(incoming) ? incoming : randomUUID()
  event.context.requestId = requestId
  setResponseHeader(event, 'x-request-id', requestId)

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

    entry.timestamp = new Date().toISOString()

    process.stdout.write(JSON.stringify(entry) + '\n')
  })
})
