import type { CallToolResult } from '@modelcontextprotocol/server'
import type { GhostToolEnvelope, GhostToolMetadata } from './types'

export function toolSuccess<T>(
  data: T,
  summary: string,
  source: string,
  options: Partial<Omit<GhostToolMetadata, 'asOf' | 'source'>> = {}
): CallToolResult {
  const envelope: GhostToolEnvelope<T> = {
    data,
    metadata: {
      asOf: new Date().toISOString(),
      source,
      ...options
    }
  }

  const comments = [
    ...(options.warnings || []).map(warning => `Note: ${warning}`),
    ...(options.guidance || []).map(item => `Advanced option: ${item.message}${item.tools?.length ? ` Tools: ${item.tools.join(', ')}.` : ''}`)
  ]
  return {
    content: [{ type: 'text', text: [summary, ...comments].join('\n') }],
    structuredContent: envelope as unknown as Record<string, unknown>,
    isError: false
  }
}

export function toolError(code: string, message: string, retryable = false, details?: Record<string, unknown>): CallToolResult {
  const error = { error: { code, message, retryable, details } }
  return {
    content: [{ type: 'text', text: `${code}: ${message}` }],
    structuredContent: error,
    isError: true
  }
}

export function toolRenderedOutput(
  data: { format: string; mimeType: string; content: string },
  source: string
): CallToolResult {
  const envelope: GhostToolEnvelope<typeof data> = {
    data,
    metadata: { asOf: new Date().toISOString(), source }
  }
  return {
    content: [{ type: 'text', text: data.content }],
    structuredContent: envelope as unknown as Record<string, unknown>,
    isError: false
  }
}

export function normalizeLimit(limit: number | undefined, fallback = 25, maximum = 100): number {
  if (!Number.isFinite(limit)) return fallback
  return Math.max(1, Math.min(Math.trunc(limit!), maximum))
}

export function encodeCursor(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
}

export function decodeCursor<T>(cursor?: string): T | undefined {
  if (!cursor) return undefined
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as T
  } catch {
    throw new Error('Invalid pagination cursor')
  }
}
