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

// Consola's LogObject.type is the authoritative severity name (the method
// invoked, e.g. 'warn', 'error'). The numeric `level` is NOT a 1:1 severity
// map — Consola collapses several types onto the same level (fatal/error → 0,
// warn → 1, info/success/ready/start/box → 3), so classifying by `level`
// alone misreports warn as error and error as fatal. Prefer `type`.
const VALID_LEVEL_TYPES = new Set<string>([
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
  'success',
  'log',
  'verbose',
  'ready',
  'start',
  'box',
])

// Numeric-level fallback, used only when `type` is absent or unrecognized.
const LEVEL_NAMES: Record<number, string> = {
  0: 'error',
  1: 'warn',
  2: 'info',
  3: 'info',
  4: 'debug',
  5: 'trace',
}

// Derive the structured JSON `level` from a Consola LogObject, preferring the
// authoritative `type` name and guarding against arbitrary type values.
function resolveLevel(logObj: LogObject): string {
  const type = logObj.type
  if (typeof type === 'string' && VALID_LEVEL_TYPES.has(type)) {
    return type
  }
  return LEVEL_NAMES[logObj.level] ?? 'info'
}

// Serialize a log argument to JSON. Errors (including ones nested in objects,
// such as logger.error('...', { error })) keep their message and stack,
// circular references become "[Circular]", and serialization never throws.
export function serializeLogArg(value: unknown): string {
  const seen = new WeakSet<object>()
  try {
    return JSON.stringify(value, (_key, item) => {
      if (item instanceof Error) {
        return {
          message: item.message,
          stack: item.stack,
          name: item.name,
          ...((item as any).code ? { code: (item as any).code } : {}),
        }
      }
      if (typeof item === 'bigint') return item.toString()
      if (item && typeof item === 'object') {
        if (seen.has(item)) return '[Circular]'
        seen.add(item)
      }
      return item
    }) ?? String(value)
  } catch {
    return String(value)
  }
}

// JSON reporter for production — writes one JSON line per log entry to stdout
const jsonReporter = {
  log(logObj: LogObject) {
    const level = resolveLevel(logObj)
    const message = logObj.args
      .map(arg => (typeof arg === 'string' ? arg : serializeLogArg(arg)))
      .join(' ')

    const entry: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level,
      message,
    }

    if (logObj.tag) {
      entry.tag = logObj.tag
    }

    process.stdout.write(JSON.stringify(entry) + '\n')
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
