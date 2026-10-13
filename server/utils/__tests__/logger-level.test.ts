import { strict as assert } from 'node:assert'
import { test } from 'node:test'

/**
 * Verifies the production JSON reporter derives `level` from Consola's
 * authoritative LogObject.type rather than mis-mapping the numeric level
 * (which previously reported warn as error and error as fatal).
 *
 * The logger instance is configured at import time from env vars, so we set
 * NODE_ENV=production (enables the JSON reporter) and LOG_LEVEL=trace (lets
 * every level through) before importing, and capture stdout.
 */
async function captureLevels(): Promise<Record<string, string>> {
  process.env.NODE_ENV = 'production'
  process.env.LOG_LEVEL = 'trace'

  const lines: string[] = []
  const originalWrite = process.stdout.write.bind(process.stdout)
  // @ts-expect-error - test shim
  process.stdout.write = (chunk: any) => {
    lines.push(String(chunk))
    return true
  }

  try {
    const { logger } = await import('../logger')
    logger.error('level-check error message')
    logger.warn('level-check warn message')
    logger.info('level-check info message')
    logger.debug('level-check debug message')
  } finally {
    process.stdout.write = originalWrite
  }

  const byMessage: Record<string, string> = {}
  for (const line of lines) {
    for (const part of line.split('\n')) {
      if (!part.trim()) continue
      try {
        const parsed = JSON.parse(part)
        if (typeof parsed.message === 'string' && parsed.message.startsWith('level-check ')) {
          byMessage[parsed.message] = parsed.level
        }
      } catch {
        // Ignore non-JSON lines
      }
    }
  }
  return byMessage
}

test('production JSON level reflects the log method invoked', async () => {
  const levels = await captureLevels()
  assert.equal(levels['level-check error message'], 'error')
  assert.equal(levels['level-check warn message'], 'warn')
  assert.equal(levels['level-check info message'], 'info')
  assert.equal(levels['level-check debug message'], 'debug')
})
