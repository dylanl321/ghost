/**
 * GET /api/notifications/stream
 * Server-Sent Events endpoint for real-time notification delivery.
 *
 * Clients connect via EventSource and receive push events when
 * new notifications are created for their user. Falls back to
 * polling if SSE is unavailable.
 */

import { defineEventHandler, setResponseHeaders } from 'h3'
import { getUserSession } from '../../utils/entra/session'
import { notificationEmitter } from '../../utils/notification-emitter'
import { logger } from '../../utils/logger'

export default defineEventHandler(async (event) => {
  // Authenticate
  const session = await getUserSession(event)
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Authentication required' })
  }

  const userId = session.user.email || session.user.id || session.user.sub
  if (!userId) {
    throw createError({ statusCode: 401, message: 'User identification failed' })
  }

  // Set SSE headers
  setResponseHeaders(event, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no' // Disable nginx buffering if present
  })

  const res = event.node.res

  // Helper to write SSE event
  function send(eventType: string, data: any) {
    res.write(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`)
  }

  // Register this connection with the emitter
  const cleanup = notificationEmitter.registerConnection(userId, res)

  // Keep-alive ping every 30 seconds
  const pingInterval = setInterval(() => {
    try {
      send('ping', { ts: Date.now() })
    } catch {
      clearInterval(pingInterval)
      cleanup()
    }
  }, 30_000)

  // Send initial connected event
  send('connected', { userId, ts: Date.now() })

  // Clean up on client disconnect
  res.on('close', () => {
    clearInterval(pingInterval)
    cleanup()
    logger.debug(`[SSE] Notification stream closed for ${userId}`)
  })

  // Keep the handler alive — do NOT call res.end()
  // The promise never resolves, keeping the connection open until the client disconnects
  await new Promise(() => {})
})
