/**
 * Request correlation ID helpers.
 *
 * Kept dependency-free (only node:crypto) so it can be unit tested without the
 * h3/Nitro server stack and reused by the request-timing middleware.
 */

import { randomUUID } from 'node:crypto'

// Conservative safe token for an inbound x-request-id: ASCII alphanumerics plus
// . _ : - and at most 128 chars. Anything else is rejected to avoid log
// injection or header reflection of untrusted content.
const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/

/**
 * Resolve a request correlation ID, honoring a caller-supplied x-request-id
 * only when it is a safe token; otherwise generate a fresh UUID.
 */
export function resolveRequestId(headerValue: unknown): string {
  if (typeof headerValue === 'string' && SAFE_REQUEST_ID.test(headerValue)) {
    return headerValue
  }
  return randomUUID()
}
