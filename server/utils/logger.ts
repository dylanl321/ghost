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

// Map Consola numeric levels to string names
const LEVEL_NAMES: Record<number, string> = {
  0: 'fatal',
  1: 'error',
  2: 'warn',
  3: 'info',
  4: 'debug',
  5: 'trace',
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

// A trailing plain object on a log call is treated as structured context and
// lifted to top-level JSON fields. Errors/arrays are messages, not context.
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false
  if (Array.isArray(value) || value instanceof Error) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

// Fields the reporter owns; structured context must never overwrite them.
const RESERVED_FIELDS = new Set(['timestamp', 'level', 'message', 'tag'])

// Build the structured JSON entry for a Consola log object. Exported for tests.
export function buildLogEntry(logObj: Pick<LogObject, 'type' | 'level' | 'args' | 'tag'>): Record<string, unknown> {
  // Consola's numeric level is ambiguous (warn and error can share level 1),
  // so prefer the semantic type; fall back to the numeric map, then 'info'.
  const level = logObj.type || LEVEL_NAMES[logObj.level] || 'info'

  const args = [...logObj.args]

  // Pull a trailing plain object off the args as structured context.
  let context: Record<string, unknown> | undefined
  if (args.length > 0 && isPlainObject(args[args.length - 1])) {
    context = args.pop() as Record<string, unknown>
  }

  const message = args
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

  // Merge structured context as top-level fields, protecting reserved keys.
  if (context) {
    for (const [key, value] of Object.entries(context)) {
      if (RESERVED_FIELDS.has(key)) continue
      entry[key] = safeSerialize(value)
    }
  }

  return entry
}

// JSON reporter for production — writes one JSON line per log entry to stdout
const jsonReporter = {
  log(logObj: LogObject) {
    process.stdout.write(JSON.stringify(buildLogEntry(logObj)) + '\n')
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
