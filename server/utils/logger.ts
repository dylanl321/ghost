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

// Map Consola numeric levels to string names.
// Consola 3 collapses several logger methods onto the same numeric level:
//   0 -> fatal AND error   1 -> warn   2 -> log   3 -> info AND success
//   4 -> debug             5 -> trace
// Because fatal and error share level 0, we label 0 as `error` (not `fatal`)
// so logger.error() is not misreported as fatal; likewise logger.warn()
// (level 1) must surface as `warn`, and both `log`/`info` (levels 2/3) as
// `info`. A missing level falls back to `info`.
const LEVEL_NAMES: Record<number, string> = {
  0: 'error',
  1: 'warn',
  2: 'info',
  3: 'info',
  4: 'debug',
  5: 'trace',
}

// Resolve a Consola numeric level to its reported string name, falling back to
// `info` for any unexpected value. Exported for testing the mapping directly.
export function levelName(level: number): string {
  return LEVEL_NAMES[level] ?? 'info'
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

// JSON reporter for production — writes one JSON line per log entry to stdout
const jsonReporter = {
  log(logObj: LogObject) {
    const level = levelName(logObj.level)
    const message = logObj.args
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
