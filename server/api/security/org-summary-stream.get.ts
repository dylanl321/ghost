/**
 * GET /api/security/org-summary-stream
 * SSE streaming endpoint for organization security health summary.
 *
 * Default: checks DynamoDB first, returns instant data if available.
 * With ?refresh=true: skips DynamoDB, runs Athena with progress events.
 */

import { defineEventHandler, setResponseHeaders, getQuery } from 'h3'
import { getOrgSecuritySummary } from '../../utils/security-summary-store'
import { logger } from '../../utils/logger'

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  })

  const res = event.node.res
  const query = getQuery(event)
  const forceRefresh = query.refresh === 'true'

  function send(eventType: string, data: any) {
    res.write(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`)
  }

  // The client may close the page mid-refresh; the refresh still finishes
  // and is saved, but nothing more is written to the closed socket.
  let closed = false
  event.node.req.on('close', () => { closed = true })
  const sendIfOpen = (eventType: string, data: any) => {
    if (!closed) send(eventType, data)
  }

  try {
    const { summary, source } = await getOrgSecuritySummary({
      forceRefresh,
      onProgress: progress => sendIfOpen('progress', progress)
    })

    if (source !== 'computed') {
      sendIfOpen('progress', { stage: 'cache_hit', message: 'Loading cached results...', percent: 100 })
    } else {
      sendIfOpen('progress', { stage: 'complete', message: 'Security data loaded', percent: 100 })
    }
    sendIfOpen('complete', { success: true, data: summary })
  } catch (err: any) {
    logger.error('[SecurityHub Stream] Fatal error', { error: err.message })
    sendIfOpen('error', { message: err.message || 'Failed to load security data' })
  }

  res.end()
})
