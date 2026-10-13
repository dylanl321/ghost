/**
 * Shared Investigations — Nitro adapter for the Collaboration_API (task 9.1).
 *
 * Owner: Ghostv2 Nitro routes under `/api/kirocrew/v1/collaboration`.
 *
 * Bridges an h3 `H3Event` to the transport-neutral {@link RouteHandler} contract
 * so the route `.ts` files stay one line each. It:
 *   - reads the RAW request bytes (not a pre-parsed body) so the 128 KiB JSON
 *     limit is measured on what was actually received, before any parsing
 *     (Requirement 11.4);
 *   - forwards the `Authorization` header UNCHANGED to the identity path (never
 *     decoded here);
 *   - carries the Gateway_ID transport header into the handler query as
 *     `__gatewayId` (authored mutations attribute to it; it is never derived
 *     from a client actor identity field);
 *   - serializes the handler's `RouteResult` with its HTTP status, and the safe
 *     `ErrorEnvelope` on failure.
 */

import { getHeader, getQuery, getRouterParams, setResponseStatus, type H3Event } from 'h3'
import { httpStatusForError, MAX_JSON_BODY_BYTES, toErrorEnvelope } from './api-support'
import { readCollaborationBody } from './request-body'
import {
  getCollaborationRuntime,
  handleRoute,
  type RawRequest,
  type RouteHandler
} from './api-runtime'

/** The header the trusted Registry transport uses to carry the Gateway_ID. */
const GATEWAY_ID_HEADER = 'x-kirocrew-gateway-id'

/**
 * Run a collaboration route handler for an h3 event. Reads the raw body once
 * (bounded by the handler's own 128 KiB check), resolves the disabled-first
 * runtime, invokes the handler, and writes the response status + JSON body.
 */
export async function runCollaborationRoute(event: H3Event, handler: RouteHandler): Promise<unknown> {
  let raw: Buffer | undefined
  try {
    raw = await readCollaborationBody(event, MAX_JSON_BODY_BYTES)
  } catch (error) {
    setResponseStatus(event, httpStatusForError(error))
    return toErrorEnvelope(error)
  }
  const params = getRouterParams(event) as Record<string, string | undefined>
  const query = { ...(getQuery(event) as Record<string, string | undefined>) }

  // Carry the transport Gateway_ID header into the handler query surface.
  const gatewayId = getHeader(event, GATEWAY_ID_HEADER)
  if (gatewayId) query['__gatewayId'] = gatewayId

  const request: RawRequest = {
    authorization: getHeader(event, 'authorization') ?? null,
    rawBody: (raw as Buffer | null) ?? null,
    params,
    query
  }

  const result = await handleRoute(getCollaborationRuntime(), request, handler)
  setResponseStatus(event, result.status)
  return result.body
}
