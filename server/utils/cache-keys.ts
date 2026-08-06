import { createHash } from 'node:crypto'

/**
 * Build a compact cache-key segment for an account selection.
 * Sorting a copy makes selection order irrelevant without mutating the caller's list.
 */
export function getAccountScopeCacheKey(accountIds?: string[]): string | null {
  if (!accountIds) return null

  const normalizedIds = [...new Set(accountIds.map(id => String(id).trim()).filter(Boolean))].sort()
  const digest = createHash('sha256').update(normalizedIds.join(',')).digest('hex')
  return `${normalizedIds.length}:${digest}`
}
