import type { EventHandler, H3Event } from 'h3'
import { defineEventHandler, getRequestURL, setResponseStatus } from 'h3'
import type { APIResponse } from '../types'
import { logger } from './logger'

/**
 * The /api/v1 contract documents one error body (components.schemas.Error):
 *   { success: false, error: { code, message, details? }, metadata }
 * Handlers and the auth middleware throw H3 errors, which Nitro would otherwise
 * render as { error: true, statusCode, statusMessage, ... }. Integrations then
 * see two different shapes depending on which layer refused them.
 */

const CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'VALIDATION_ERROR',
  429: 'RATE_LIMITED',
  502: 'UPSTREAM_ERROR',
  503: 'SERVICE_UNAVAILABLE',
  504: 'UPSTREAM_TIMEOUT'
}

export function isV1Path(pathname: string): boolean {
  return pathname.startsWith('/api/v1/')
}

export function v1ErrorBody(
  event: H3Event,
  statusCode: number,
  message: string,
  details?: unknown,
  code = CODES[statusCode] || (statusCode >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST')
): APIResponse {
  const requestID = typeof event.context?.requestId === 'string' ? event.context.requestId : undefined
  return {
    success: false,
    error: { code, message, ...(details === undefined ? {} : { details }) },
    metadata: { timestamp: new Date().toISOString(), ...(requestID ? { requestID } : {}) }
  }
}

/** Set the status and return the documented envelope for a status/message pair. */
export function sendV1Error(event: H3Event, statusCode: number, message: string, details?: unknown): APIResponse {
  setResponseStatus(event, statusCode)
  return v1ErrorBody(event, statusCode, message, details)
}

/**
 * Convert anything a v1 handler throws into the documented envelope. Client
 * errors keep their message; server faults are logged and answered generically
 * so stack details never reach integrations.
 */
export function toV1Error(event: H3Event, error: unknown): APIResponse {
  // Legacy helpers throw the envelope itself after setting the status.
  const envelope = error as APIResponse
  if (envelope && typeof envelope === 'object' && envelope.success === false && envelope.error?.message) {
    const status = event.node.res.statusCode >= 400 ? event.node.res.statusCode : 400
    setResponseStatus(event, status)
    return { ...envelope, metadata: { ...v1ErrorBody(event, status, '').metadata!, ...envelope.metadata } }
  }

  const h3Error = error as { statusCode?: number, statusMessage?: string, message?: string, data?: unknown, unhandled?: boolean }
  const statusCode = typeof h3Error?.statusCode === 'number' && h3Error.statusCode >= 400 ? h3Error.statusCode : 500
  if (statusCode >= 500) {
    logger.error('[API v1] Request failed', {
      requestId: event.context?.requestId,
      path: getRequestURL(event).pathname,
      error
    })
  }
  const exposeMessage = statusCode < 500 || statusCode === 502 || statusCode === 503 || statusCode === 504
  const message = exposeMessage
    ? h3Error?.statusMessage || h3Error?.message || 'Request failed'
    : 'Internal server error'
  return sendV1Error(event, statusCode, message, statusCode < 500 && !h3Error?.unhandled ? h3Error?.data : undefined)
}

export function withV1Errors(handler: EventHandler): EventHandler {
  return defineEventHandler(async (event: H3Event) => {
    try {
      return await handler(event)
    } catch (error) {
      return toV1Error(event, error)
    }
  })
}
