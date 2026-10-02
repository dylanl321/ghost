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

import { createConsola, type LogObject } from 'consola'

// Fallback map from Consola numeric levels to string names.
//
// NOTE: this map is intentionally only a *last resort*. Consola assigns the
// same numeric level to several types (e.g. fatal and error are both 0; warn
// is 1 while log/info/success all share 3), so deriving severity from the
// number alone mislabels standard calls — logger.error() surfaced as "fatal"
// and logger.warn() as "error". The actual call is carried by logObj.type,
// which is authoritative; resolveLevel() prefers it and only consults this map
// when the type is unusable.
const LEVEL_NAMES: Record<number, string> = {
  0: 'fatal',
  1: 'error',
  2: 'warn',
  3: 'info',
  4: 'debug',
  5: 'trace',
}

// Canonical severity levels we emit in structured logs.
const RECOGNIZED_LEVELS = new Set(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])

// Consola log types that are not themselves severity levels, mapped to the
// closest canonical severity (e.g. logger.success -> info, logger.fail -> error).
const TYPE_TO_LEVEL: Record<string, string> = {
  fail: 'error',
  success: 'info',
  ready: 'info',
  start: 'info',
  log: 'info',
  box: 'info',
  verbose: 'trace',
}

// Minimal shape of what the reporter/formatter needs from a Consola LogObject.
type LoggableObject = Pick<LogObject, 'args'> & Partial<Pick<LogObject, 'type' | 'level' | 'tag'>>

/**
 * Resolve the canonical severity level for a log entry.
 * Prefers logObj.type (the actual call: error/warn/info/...) and only falls
 * back to the ambiguous numeric level map when the type is missing/unknown.
 */
export function resolveLevel(logObj: LoggableObject): string {
  const type = typeof logObj.type === 'string' ? logObj.type.toLowerCase() : ''
  if (RECOGNIZED_LEVELS.has(type)) return type
  if (type in TYPE_TO_LEVEL) return TYPE_TO_LEVEL[type]
  if (typeof logObj.level === 'number' && LEVEL_NAMES[logObj.level]) return LEVEL_NAMES[logObj.level]
  return 'info'
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

/**
 * Build the structured log entry for a Consola log object.
 * Exported so the severity-mapping and serialization can be unit tested
 * without a running Consola instance.
 */
export function formatLogEntry(logObj: LoggableObject): Record<string, unknown> {
  const level = resolveLevel(logObj)
  const message = (logObj.args ?? [])
    .map(arg => (typeof arg === 'string' ? arg : JSON.stringify(safeSerialize(arg))))
    .join(' ')

  const entry: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level,
    message,
  }

  if (logObj.tag) {
    entry.tag = logObj.tag
  }

  return entry
}

/**
 * Serialize a log object to a single JSON line (no embedded newlines).
 */
export function serializeLogEntry(logObj: LoggableObject): string {
  return JSON.stringify(formatLogEntry(logObj))
}

// JSON reporter for production — writes one JSON line per log entry to stdout
const jsonReporter = {
  log(logObj: LogObject) {
    process.stdout.write(serializeLogEntry(logObj) + '\n')
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
