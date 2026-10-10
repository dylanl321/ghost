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

// Map Consola log *types* (the method invoked, e.g. warn/error/info) to a
// canonical severity name. The call type is authoritative: Consola collapses
// several types onto the same numeric level (fatal and error are both level 0,
// warn is level 1), so numeric level alone misclassified logger.warn as "error"
// and logger.error as "fatal". Resolving from the type fixes that.
const TYPE_LEVELS: Record<string, string> = {
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

// Numeric-level fallback for unknown/unmapped types only.
const LEVEL_NAMES: Record<number, string> = {
  0: 'fatal',
  1: 'error',
  2: 'warn',
  3: 'info',
  4: 'debug',
  5: 'trace',
}

/**
 * Resolve the canonical severity for a structured log entry. The log type (the
 * method the caller invoked) is authoritative; the numeric level is only a
 * fallback for types we do not explicitly map.
 */
export function resolveLogSeverity(logObj: Pick<LogObject, 'type' | 'level'>): string {
  const type = typeof logObj.type === 'string' ? logObj.type.toLowerCase() : ''
  return TYPE_LEVELS[type] ?? LEVEL_NAMES[logObj.level] ?? 'info'
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
 * Build the structured JSON entry for a log object (pure; exported for tests).
 */
export function formatLogEntry(logObj: LogObject): Record<string, unknown> {
  const args = logObj.args ?? []
  const message = args
    .map(arg => (typeof arg === 'string' ? arg : JSON.stringify(safeSerialize(arg))))
    .join(' ')

  const entry: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level: resolveLogSeverity(logObj),
    message,
  }

  if (logObj.tag) {
    entry.tag = logObj.tag
  }

  // Preserve object arguments as queryable JSON context in addition to the
  // rendered message. This keeps existing human-readable output intact while
  // allowing Logs Insights queries such as `filter context.component = ...`.
  // Errors and arrays are excluded because they are payloads, not context maps.
  const context = args.reduce<Record<string, unknown>>((combined, arg) => {
    if (arg && typeof arg === 'object' && !Array.isArray(arg) && !(arg instanceof Error)) {
      const serialized = safeSerialize(arg)
      if (serialized && typeof serialized === 'object' && !Array.isArray(serialized)) {
        Object.assign(combined, serialized)
      }
    }
    return combined
  }, {})
  if (Object.keys(context).length > 0) {
    entry.context = context
  }

  return entry
}

// JSON reporter for production — writes one JSON line per log entry to stdout
const jsonReporter = {
  log(logObj: LogObject) {
    process.stdout.write(JSON.stringify(formatLogEntry(logObj)) + '\n')
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
