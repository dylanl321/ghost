/**
 * Frontend logging utility using Consola
 *
 * Environment-aware: verbose in dev/local, errors-only in production.
 * NODE_ENV is injected at runtime via ECS task definition ('prod' or 'dev').
 *
 * Usage (auto-imported by Nuxt — no import needed):
 *   const logger = createLogger('MyComponent')
 *   logger.info('Something happened')
 *   logger.warn('Degraded state')
 *   logger.error('Something failed', error)
 *   logger.debug('Verbose detail')
 */

import { createConsola, type ConsolaInstance } from 'consola/browser'

// Consola levels: 0=silent, 1=error, 2=warn, 3=info, 4=debug, 5=trace
const getLogLevel = (): number => {
  if (typeof window === 'undefined') {
    const env = process.env.NODE_ENV?.toLowerCase()
    return (env === 'production' || env === 'prod') ? 1 : 4
  }
  // Client-side: read from Nuxt runtime config injected into the page
  try {
    const env = (window as any).__NUXT__?.config?.public?.environment?.toLowerCase()
    if (env === 'production' || env === 'prod') return 1
  } catch {
    // Fallback if __NUXT__ not available yet
  }
  return 4
}

const clientLogger: ConsolaInstance = createConsola({
  level: getLogLevel(),
  defaults: { tag: 'GHOST' },
})

/** Creates a tagged child logger for a specific subsystem or component */
export const createLogger = (tag: string): ConsolaInstance => {
  return clientLogger.withTag(tag)
}

export { clientLogger }
