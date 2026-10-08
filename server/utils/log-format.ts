/**
 * Pure helpers for producing structured production log entries.
 *
 * Kept dependency-free (only a type-level import from consola) so the
 * severity mapping and entry shaping can be unit-tested deterministically.
 */

import type { LogObject } from 'consola'

/**
 * Map Consola 3 numeric log levels to CloudWatch severity names.
 *
 * Consola collapses several log types onto the same numeric level:
 *   0 → fatal + error   (reported as "error"; we never claim "fatal")
 *   1 → warn
 *   2 → log
 *   3 → info + success
 *   4 → debug
 *   5 → trace
 */
export const LEVEL_NAMES: Record<number, string> = {
  0: 'error',
  1: 'warn',
  2: 'info',
  3: 'info',
  4: 'debug',
  5: 'trace',
}

export interface SerializedError {
  name: string
  message: string
  stack?: string
  code?: string | number
}

/** Extract safe, serializable fields from an Error. */
export function serializeError(value: Error): SerializedError {
  const code = (value as { code?: unknown }).code
  return {
    name: value.name,
    message: value.message,
    ...(value.stack ? { stack: value.stack } : {}),
    ...(typeof code === 'string' || typeof code === 'number' ? { code } : {}),
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Error)
  )
}

/** Guard against pathological / deeply nested context objects. */
const MAX_DEPTH = 8
const REDACTED = '[REDACTED]'

/**
 * Key names (case-insensitive, separator-insensitive) whose values are
 * treated as secrets and redacted. Covers common forms such as api_key,
 * api-key, apiKey, accessKey, authorization, cookie, credential, etc.
 */
const SECRET_KEY_SUBSTRINGS = [
  'secret',
  'token',
  'password',
  'authorization',
  'cookie',
  'apikey',
  'accesskey',
  'credential',
]

function isSecretKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[-_]/g, '')
  return SECRET_KEY_SUBSTRINGS.some((needle) => normalized.includes(needle))
}

/**
 * Produce a JSON-serializable copy of an arbitrary logging value.
 *
 * Pure (no mutation of the input). Handles circular references, bounds
 * recursion depth, drops/stringifies values JSON cannot represent, and
 * redacts values whose key name indicates a secret. Guarantees the result
 * can be passed to JSON.stringify without throwing.
 */
export function sanitizeValue(value: unknown, seen: WeakSet<object> = new WeakSet(), depth = 0): unknown {
  if (value === null) return null

  const type = typeof value
  if (type === 'string' || type === 'boolean') return value
  if (type === 'number') return Number.isFinite(value as number) ? value : String(value)
  if (type === 'bigint') return `${(value as bigint).toString()}n`
  if (type === 'undefined' || type === 'function' || type === 'symbol') return undefined

  if (value instanceof Error) return serializeError(value)

  // From here value is a non-null object or array.
  if (depth >= MAX_DEPTH) return '[MaxDepth]'
  if (seen.has(value as object)) return '[Circular]'
  seen.add(value as object)
  try {
    if (Array.isArray(value)) {
      return value.map((item) => {
        const sanitized = sanitizeValue(item, seen, depth + 1)
        // JSON.stringify renders undefined array holes as null; keep that shape.
        return sanitized === undefined ? null : sanitized
      })
    }

    if (isPlainObject(value)) {
      const out: Record<string, unknown> = {}
      for (const [key, child] of Object.entries(value)) {
        if (isSecretKey(key)) {
          out[key] = REDACTED
          continue
        }
        const sanitized = sanitizeValue(child, seen, depth + 1)
        if (sanitized !== undefined) out[key] = sanitized
      }
      return out
    }

    // Dates, Maps, class instances, etc. — stringify defensively.
    try {
      return JSON.parse(JSON.stringify(value))
    } catch {
      return String(value)
    }
  } finally {
    seen.delete(value as object)
  }
}

/** Sanitize a plain-object context argument into a safe record. */
function sanitizeContext(value: Record<string, unknown>): Record<string, unknown> {
  return sanitizeValue(value) as Record<string, unknown>
}

// Render a single arg exactly as the legacy reporter did, so existing
// message-substring metric filters keep matching. Non-string args are
// sanitized first so the rendered message cannot leak secret values or
// throw on circular structures.
function renderArg(value: unknown): string {
  if (typeof value === 'string') return value
  const normalized = value instanceof Error ? serializeError(value) : sanitizeValue(value)
  try {
    return JSON.stringify(normalized)
  } catch {
    return String(value)
  }
}

/** Build the human-readable message from the full arg list. */
export function renderMessage(args: readonly unknown[]): string {
  return args.map(renderArg).join(' ')
}

/**
 * Shape a Consola LogObject into the JSON entry written to stdout in
 * production. Timestamp is injected for deterministic testing.
 *
 * Structured context is kept under dedicated top-level keys (`context`,
 * `error`) and never spread into the root of the entry.
 */
export function formatLogEntry(logObj: LogObject, timestamp: string): Record<string, unknown> {
  const args = logObj.args ?? []

  const entry: Record<string, unknown> = {
    timestamp,
    level: LEVEL_NAMES[logObj.level] ?? 'info',
    message: renderMessage(args),
  }

  if (logObj.tag) {
    entry.tag = logObj.tag
  }

  let context: Record<string, unknown> | undefined
  let error: SerializedError | undefined

  for (const arg of args) {
    if (arg instanceof Error) {
      error = error ?? serializeError(arg)
    } else if (isPlainObject(arg)) {
      context = { ...(context ?? {}), ...sanitizeContext(arg) }
    }
  }

  if (context) entry.context = context
  if (error) entry.error = error

  return entry
}
