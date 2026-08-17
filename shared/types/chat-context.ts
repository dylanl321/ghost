export interface ChatPageContext {
  sourcePage: string
  accountIds?: string[]
  resourceIds?: string[]
  timeframe?: string
  dataMode?: 'billable' | 'proforma'
  services?: string[]
  severities?: string[]
}

const ACCOUNT_ID = /^\d{12}$/
const RESOURCE_ID = /^[A-Za-z0-9][A-Za-z0-9:./_-]{0,255}$/
const SAFE_VALUE = /^[A-Za-z0-9][A-Za-z0-9 ._:/()-]{0,99}$/
const TIMEFRAMES = new Set([
  'last7days', 'last30days', 'last90days', 'thisMonth', 'lastMonth',
  'thisQuarter', 'lastQuarter', 'ytd', 'last12months', 'lastYear'
])

function validList(value: unknown, pattern: RegExp, limit = 20): string[] | undefined {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : []
  const filtered = [...new Set(values.filter((item): item is string => typeof item === 'string')
    .map(item => item.trim())
    .filter(item => pattern.test(item)))]
    .slice(0, limit)
  return filtered.length ? filtered : undefined
}

export function validateChatPageContext(value: unknown): ChatPageContext | null {
  if (!value || typeof value !== 'object') return null
  const input = value as Record<string, unknown>
  if (typeof input.sourcePage !== 'string' || !input.sourcePage.startsWith('/') || input.sourcePage.length > 200) return null

  const timeframe = typeof input.timeframe === 'string' && TIMEFRAMES.has(input.timeframe)
    ? input.timeframe
    : undefined
  const dataMode = input.dataMode === 'billable' || input.dataMode === 'proforma' ? input.dataMode : undefined

  return {
    sourcePage: input.sourcePage,
    accountIds: validList(input.accountIds, ACCOUNT_ID),
    resourceIds: validList(input.resourceIds, RESOURCE_ID),
    timeframe,
    dataMode,
    services: validList(input.services, SAFE_VALUE, 10),
    severities: validList(input.severities, SAFE_VALUE, 10)
  }
}

export function formatChatPageContext(context: ChatPageContext): string {
  const lines = [`Source page: ${context.sourcePage}`]
  if (context.accountIds?.length) lines.push(`Selected accounts: ${context.accountIds.join(', ')}`)
  if (context.resourceIds?.length) lines.push(`Selected resources: ${context.resourceIds.join(', ')}`)
  if (context.timeframe) lines.push(`Timeframe: ${context.timeframe}`)
  if (context.dataMode) lines.push(`Data mode: ${context.dataMode}`)
  if (context.services?.length) lines.push(`Services: ${context.services.join(', ')}`)
  if (context.severities?.length) lines.push(`Severities: ${context.severities.join(', ')}`)
  return lines.join('\n')
}
