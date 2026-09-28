/**
 * Request correlation id helper.
 *
 * Kept dependency-free (only node:crypto) so it can be unit tested outside the
 * Nuxt/h3 runtime and reused by the request-timing middleware.
 */
import { randomUUID } from 'node:crypto'

// Conservative request-id token: ASCII alphanumerics plus . _ : - , max 128 chars.
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/

/**
 * Accept a caller-supplied x-request-id only when it is a safe bounded token;
 * otherwise mint a fresh UUID so downstream logs always have a correlation id.
 */
export function normalizeRequestId(incoming: unknown): string {
  if (typeof incoming === 'string' && REQUEST_ID_PATTERN.test(incoming)) {
    return incoming
  }
  return randomUUID()
}
