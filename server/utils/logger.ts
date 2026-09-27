/**
 * Centralized logging utility using Consola
 *
 * Environment Configuration:
 * - LOG_LEVEL: Controls log verbosity (silent | fatal | error | warn | info | debug | trace)
 * - Defaults to 'debug' in development, 'info' in production
 *
 * In production, outputs structured JSON for CloudWatch Log Insights parsing.
 * In development, keeps the default colored/formatted output.
 *
 * Usage:
 *   import { logger } from './logger'
 *
 *   logger.debug('Detailed debugging information')
 *   logger.info('General information')
 *   logger.warn('Warning messages')
 *   logger.error('Error messages')
 *   logger.success('Success messages')
 */

import { createConsola, type LogObject, type LogType } from 'consola'

// Map Consola's semantic log `type` to a CloudWatch severity string.
//
// Consola's NUMERIC levels are ambiguous and cannot be mapped 1:1 to a
// severity: verified against consola 3.4.2 (node_modules/consola/dist/core.cjs),
// `fatal` and `error` are BOTH level 0, and `info`/`success`/`ready`/`start`/
// `box`/`fail` all share level 3. Mapping by number therefore mislabels logs
// (previously logger.error -> level 0 -> "fatal", logger.warn -> level 1 ->
// "error"). The LogObject `type` field is the accurate, unambiguous source.
const TYPE_SEVERITY: Record<LogType, string> = {
  silent: 'silent',
  fatal: 'fatal',
  error: 'error',
  fail: 'error',
  warn: 'warn',
  log: 'info',
  info: 'info',
  success: 'info',
  ready: 'info',
  start: 'info',
  box: 'info',
  debug: 'debug',
  trace: 'trace',
  verbose: 'trace',
}

// Numeric-level fallback, used only when a log object lacks a known `type`.
// Because fatal and error collide at level 0, an unknown-typed level-0 log is
// reported as the less-alarming "error" rather than falsely paging as "fatal".
function severityFromLevel(level: number): string {
  if (!Number.isFinite(level)) return level > 0 ? 'trace' : 'silent'
  if (level <= 0) return 'error'
  if (level === 1) return 'warn'
  if (level <= 3) return 'info'
  if (level === 4) return 'debug'
  return 'trace'
}

// Resolve the accurate severity for a log object: prefer the semantic type,
// fall back to the numeric level.
export function severityForLog(logObj: Pick<LogObject, 'type' | 'level'>): string {
  const byType = logObj.type ? TYPE_SEVERITY[logObj.type] : undefined
  return byType ?? severityFromLevel(logObj.level)
}

// Safely serialize a value, handling Error objects and circular references
function safeSerialize(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      message: value.message,
      stack: value.stack,
      name: value.name,
      ...(value as any).code ? { code: (value as any).code } : {},
    }
  }
  return value
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Error)
  )
}

// Fields the reporter always controls; a promoted structured object may not
// overwrite them (protects the accurate severity, message and ordering).
const RESERVED_FIELDS = new Set(['timestamp', 'level', 'message'])

// JSON-stringify that tolerates Error values and circular references so a
// single malformed log argument can never throw and drop the log line.
function safeStringify(entry: Record<string, unknown>): string {
  const seen = new WeakSet<object>()
  return JSON.stringify(entry, (_key, value) => {
    if (value instanceof Error) return safeSerialize(value)
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) return '[Circular]'
      seen.add(value)
    }
    return value
  })
}

// Build the structured log entry for a single log object. String args are
// joined into `message`; plain-object args are promoted to top-level fields so
// structured context (e.g. `type`, `operation`, counts) is queryable in
// CloudWatch Log Insights and by metric filters. Reserved fields are protected.
export function buildLogEntry(logObj: LogObject): Record<string, unknown> {
  const messageParts: string[] = []
  const fields: Record<string, unknown> = {}

  for (const arg of logObj.args) {
    if (typeof arg === 'string') {
      messageParts.push(arg)
    } else if (isPlainObject(arg)) {
      for (const [key, value] of Object.entries(arg)) {
        if (!RESERVED_FIELDS.has(key)) {
          fields[key] = value
        }
      }
    } else {
      messageParts.push(JSON.stringify(safeSerialize(arg)))
    }
  }

  const entry: Record<string, unknown> = {
    ...fields,
    timestamp: new Date().toISOString(),
    level: severityForLog(logObj),
    message: messageParts.join(' '),
  }

  if (logObj.tag && !('tag' in fields)) {
    entry.tag = logObj.tag
  }

  return entry
}

// JSON reporter for production — writes one JSON line per log entry to stdout
const jsonReporter = {
  log(logObj: LogObject) {
    process.stdout.write(safeStringify(buildLogEntry(logObj)) + '\n')
  },
}

// Determine log level from environment
const getLogLevel = (): string => {
  // If LOG_LEVEL is explicitly set, use it
  if (process.env.LOG_LEVEL) {
    return process.env.LOG_LEVEL.toLowerCase()
  }

  // Default based on environment
  const nodeEnv = process.env.NODE_ENV?.toLowerCase()
  if (nodeEnv === 'production' || nodeEnv === 'prod') {
    return 'info'
  }

  // Development defaults to debug for visibility
  return 'debug'
}

const isProduction = (() => {
  const nodeEnv = process.env.NODE_ENV?.toLowerCase()
  return nodeEnv === 'production' || nodeEnv === 'prod'
})()

// Create consola instance with configuration
export const logger = createConsola({
  level: getLogLevel() as any,
  ...(isProduction
    ? { reporters: [jsonReporter] }
    : {
        formatOptions: {
          date: true,
          colors: true,
          compact: false,
        },
      }),
})

// Export log level for reference
export const currentLogLevel = getLogLevel()

// Log the current configuration on startup (only once)
if (process.env.NODE_ENV !== 'test') {
  logger.info(`Logger initialized with level: ${currentLogLevel} (structured JSON: ${isProduction})`)
}
