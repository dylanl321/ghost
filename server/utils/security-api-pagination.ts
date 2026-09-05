import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { createError } from 'h3'

export const SECURITY_CURSOR_TTL_MS = 15 * 60 * 1000

export interface SecurityStreamState {
  id: string
  token?: string
  offset: number
  done?: boolean
}

interface SecurityCursor {
  version: 1
  issuedAt: number
  expiresAt: number
  fingerprint: string
  streams: SecurityStreamState[]
}

export interface StreamPage<T> {
  records: T[]
  nextToken?: string
}

const stable = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stable(item)]))
  }
  return value
}

export function securityQueryFingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(stable(value))).digest('base64url')
}

function cursorSecret(): string {
  const secret = process.env.SECURITY_API_CURSOR_SECRET ||
    process.env.NUXT_SESSION_PASSWORD ||
    process.env.ENTRA_CLIENT_SECRET
  if (!secret || secret.length < 16) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Security pagination is not configured.'
    })
  }
  return secret
}

function sign(payload: string): string {
  return createHmac('sha256', cursorSecret()).update(payload).digest('base64url')
}

export function encodeSecurityCursor(
  fingerprint: string,
  streams: SecurityStreamState[],
  now = Date.now()
): string {
  const payload = Buffer.from(JSON.stringify({
    version: 1,
    issuedAt: now,
    expiresAt: now + SECURITY_CURSOR_TTL_MS,
    fingerprint,
    streams
  } satisfies SecurityCursor)).toString('base64url')
  return `${payload}.${sign(payload)}`
}

function readSecurityCursor(encoded: string, now = Date.now()): SecurityCursor {
  try {
    const [payload, signature, extra] = encoded.split('.')
    if (!payload || !signature || extra) throw new Error('Malformed cursor')
    const expected = Buffer.from(sign(payload))
    const actual = Buffer.from(signature)
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      throw new Error('Invalid signature')
    }
    const cursor = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as SecurityCursor
    if (cursor.version !== 1 || !Number.isFinite(cursor.issuedAt) || cursor.expiresAt <= now) {
      throw new Error('Expired cursor')
    }
    return cursor
  } catch {
    throw createError({
      statusCode: 400,
      statusMessage: 'The pagination cursor is invalid, expired, tampered with, or does not match the requested filters.'
    })
  }
}

export function securityCursorIssuedAt(encoded: string | undefined, now = Date.now()): number | undefined {
  return encoded ? readSecurityCursor(encoded, now).issuedAt : undefined
}

export function decodeSecurityCursor(
  encoded: string | undefined,
  fingerprint: string,
  initialStreams: SecurityStreamState[],
  now = Date.now()
): SecurityStreamState[] {
  if (!encoded) return initialStreams.map(stream => ({ ...stream }))
  try {
    const cursor = readSecurityCursor(encoded, now)
    if (cursor.fingerprint !== fingerprint) throw new Error('Cursor does not match this query')
    const expectedIds = initialStreams.map(stream => stream.id).sort()
    const cursorIds = cursor.streams.map(stream => stream.id).sort()
    if (JSON.stringify(expectedIds) !== JSON.stringify(cursorIds)) {
      throw new Error('Cursor scope does not match this query')
    }
    return cursor.streams.map(stream => ({
      id: stream.id,
      token: stream.token,
      offset: Math.max(0, Number(stream.offset) || 0),
      done: Boolean(stream.done)
    }))
  } catch {
    throw createError({
      statusCode: 400,
      statusMessage: 'The pagination cursor is invalid, expired, tampered with, or does not match the requested filters.'
    })
  }
}

/**
 * Merge independently sorted AWS streams without collecting the complete result set.
 * A partially consumed upstream page is replayed with an offset on the next request.
 */
export async function mergeSecurityStreams<T>(
  states: SecurityStreamState[],
  limit: number,
  load: (state: SecurityStreamState) => Promise<StreamPage<T>>,
  compare: (left: T, right: T) => number
): Promise<{ records: T[]; states: SecurityStreamState[]; hasMore: boolean }> {
  const pages = new Map<string, StreamPage<T>>()

  const ensureAvailable = async (state: SecurityStreamState): Promise<T | undefined> => {
    while (!state.done) {
      let page = pages.get(state.id)
      if (!page) {
        page = await load(state)
        pages.set(state.id, page)
      }
      if (state.offset < page.records.length) return page.records[state.offset]
      if (!page.nextToken) {
        state.done = true
        return undefined
      }
      state.token = page.nextToken
      state.offset = 0
      pages.delete(state.id)
    }
    return undefined
  }

  const records: T[] = []
  while (records.length < limit) {
    const candidates = await Promise.all(states.map(async state => ({
      state,
      record: await ensureAvailable(state)
    })))
    const available = candidates
      .filter(candidate => candidate.record !== undefined) as Array<{ state: SecurityStreamState; record: T }>
    if (available.length === 0) break
    available.sort((left, right) => compare(left.record, right.record))
    const selected = available[0]!
    records.push(selected.record)
    selected.state.offset++
  }

  const hasMore = (await Promise.all(states.map(ensureAvailable))).some(record => record !== undefined)
  return { records, states, hasMore }
}

export function parseBoundedInteger(
  value: unknown,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  if (value === undefined || value === '') return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw createError({ statusCode: 400, statusMessage: `${name} must be an integer from ${minimum} to ${maximum}.` })
  }
  return parsed
}

export function parseCsv(value: unknown): string[] | undefined {
  const values = (Array.isArray(value) ? value : [value])
    .flatMap(item => typeof item === 'string' ? item.split(',') : [])
    .map(item => item.trim())
    .filter(Boolean)
  return values.length ? [...new Set(values)] : undefined
}

export function parseEnum<T extends string>(
  value: unknown,
  name: string,
  allowed: readonly T[],
  fallback?: T
): T | undefined {
  if (value === undefined || value === '') return fallback
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw createError({ statusCode: 400, statusMessage: `${name} must be one of: ${allowed.join(', ')}.` })
  }
  return value as T
}

export function parseEnumCsv<T extends string>(
  value: unknown,
  name: string,
  allowed: readonly T[]
): T[] | undefined {
  const values = parseCsv(value)?.map(item => item.toUpperCase())
  if (!values) return undefined
  const invalid = values.filter(item => !allowed.includes(item as T))
  if (invalid.length) {
    throw createError({ statusCode: 400, statusMessage: `${name} contains unsupported values: ${invalid.join(', ')}.` })
  }
  return values as T[]
}

export function parseDateRange(query: Record<string, unknown>, defaultLookbackDays?: number) {
  const dateField = typeof query.dateField === 'string' ? query.dateField : undefined
  const start = typeof query.startDate === 'string' ? query.startDate : undefined
  const end = typeof query.endDate === 'string' ? query.endDate : undefined
  const hasAbsolute = Boolean(start || end)
  if (hasAbsolute && (!start || !end)) {
    throw createError({ statusCode: 400, statusMessage: 'startDate and endDate must be supplied together.' })
  }
  if (hasAbsolute && query.lookbackDays !== undefined) {
    throw createError({ statusCode: 400, statusMessage: 'Absolute dates cannot be combined with lookbackDays.' })
  }
  if (hasAbsolute) {
    const startDate = new Date(start!)
    const endDate = new Date(end!)
    const iso8601 = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2}))?$/
    if (!iso8601.test(start!) || !iso8601.test(end!) ||
      !Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime()) || startDate > endDate) {
      throw createError({ statusCode: 400, statusMessage: 'startDate and endDate must be valid inclusive ISO-8601 dates in ascending order.' })
    }
    return { dateField, start: startDate, end: endDate }
  }
  const lookbackDays = query.lookbackDays === undefined && defaultLookbackDays === undefined
    ? undefined
    : parseBoundedInteger(query.lookbackDays, 'lookbackDays', defaultLookbackDays!, 1, 3650)
  return {
    dateField,
    lookbackDays,
    ...(lookbackDays
      ? { start: new Date(Date.now() - lookbackDays * 86_400_000), end: new Date() }
      : {})
  }
}

/**
 * Bounded, non-sensitive operation context callers may attach to a provider
 * failure. Only counts, the environment partition, and the page number are
 * permitted — never IDs, ARNs, cursors, query values, or credentials.
 */
export interface SecurityProviderErrorContext {
  operation?: string
  environment?: 'commercial' | 'govcloud'
  page?: number
  regionCount?: number
  accountCount?: number
}

/**
 * Diagnostic payload emitted when a security provider call fails. Every field
 * is explicitly allowlisted; the raw Error, its message/stack, and any caller
 * context beyond {@link SecurityProviderErrorContext} are intentionally dropped
 * so that ARNs, account IDs, cursors, credentials, and user input never reach
 * the logs. Exported for regression testing of the safe shape.
 */
export interface SecurityProviderFailureLog extends SecurityProviderErrorContext {
  type: 'security_provider_failure'
  level: 'error'
  provider: string
  code: string
  requestId?: string
  httpStatus?: number
  attempts?: number
  timestamp: string
}

/**
 * Build the safe diagnostic payload for a provider failure, reading only
 * allowlisted metadata off the error and merging allowlisted caller context.
 * Undefined fields are stripped so the emitted record stays compact.
 */
export function buildSecurityProviderFailureLog(
  provider: string,
  error: unknown,
  context?: SecurityProviderErrorContext,
  now = Date.now()
): SecurityProviderFailureLog {
  const candidate = error as {
    name?: string
    $metadata?: { requestId?: string; requestID?: string; httpStatusCode?: number; attempts?: number }
  }
  const metadata = candidate?.$metadata
  const payload: SecurityProviderFailureLog = {
    type: 'security_provider_failure',
    level: 'error',
    provider,
    code: candidate?.name || 'ProviderError',
    requestId: metadata?.requestId || metadata?.requestID,
    httpStatus: metadata?.httpStatusCode,
    attempts: metadata?.attempts,
    operation: context?.operation,
    environment: context?.environment,
    page: context?.page,
    regionCount: context?.regionCount,
    accountCount: context?.accountCount,
    timestamp: new Date(now).toISOString()
  }
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined)
  ) as SecurityProviderFailureLog
}

/**
 * Emit the safe diagnostic payload as one structured JSON line. Written
 * directly to stdout (mirroring the request/job records) so the exact shape
 * reaches CloudWatch Log Insights unaltered.
 */
export function logSecurityProviderFailure(payload: SecurityProviderFailureLog): void {
  process.stdout.write(JSON.stringify(payload) + '\n')
}

export function sanitizeProviderError(
  provider: string,
  error: unknown,
  context?: SecurityProviderErrorContext
): never {
  const payload = buildSecurityProviderFailureLog(provider, error, context)
  logSecurityProviderFailure(payload)
  throw createError({
    statusCode: 502,
    statusMessage: `${provider} could not complete the findings request.`,
    data: {
      provider,
      code: payload.code,
      requestId: payload.requestId
    }
  })
}
