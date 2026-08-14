export type ChatDestination =
  | { name: 'costs'; accountIds?: string[]; timeframe?: string; mode?: 'billable' | 'proforma' }
  | { name: 'explorer'; accountId?: string }
  | { name: 'organization' }
  | { name: 'security' }
  | { name: 'reports'; accountIds?: string[] }
  | { name: 'users' }
  | { name: 'chat'; threadId?: string; query?: string }

export function buildChatDestination(destination: ChatDestination): string {
  const params = new URLSearchParams()
  switch (destination.name) {
    case 'costs':
      if (destination.accountIds?.length) params.set('accounts', destination.accountIds.join(','))
      if (destination.timeframe) params.set('timeframe', destination.timeframe)
      if (destination.mode) params.set('mode', destination.mode)
      return `/account/costs${params.size ? `?${params}` : ''}`
    case 'explorer':
      return destination.accountId ? `/account/${encodeURIComponent(destination.accountId)}` : '/account/explorer'
    case 'organization': return '/account/org-chart'
    case 'security': return '/security'
    case 'reports':
      if (destination.accountIds?.length) params.set('accounts', JSON.stringify(destination.accountIds))
      return `/reports/datasets${params.size ? `?${params}` : ''}`
    case 'users': return '/account/user'
    case 'chat':
      if (destination.threadId) params.set('thread', destination.threadId)
      if (destination.query) params.set('q', destination.query)
      return `/chat${params.size ? `?${params}` : ''}`
  }
}

export function isSupportedChatDestination(value: string): boolean {
  try {
    const url = new URL(value, 'https://ghost.local')
    return [
      '/account/costs', '/account/explorer', '/account/org-chart', '/security',
      '/reports/datasets', '/account/user', '/chat'
    ].includes(url.pathname) || /^\/account\/\d{12}$/.test(url.pathname)
  } catch {
    return false
  }
}
