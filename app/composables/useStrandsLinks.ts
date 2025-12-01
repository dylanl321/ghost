/**
 * Strands Links Composable
 * Client-side utilities for building deep links to GHOST pages
 */

export interface LinkBuilderOptions {
  accountIds?: string[]
  dateRange?: { start: string; end: string }
  services?: string[]
  resourceTypes?: string[]
  granularity?: 'DAILY' | 'MONTHLY'
  groupBy?: 'SERVICE' | 'ACCOUNT'
  metric?: 'Billable' | 'Proforma'
  highlight?: string
}

export function useStrandsLinks() {
  /**
   * Build Cost Dashboard link with pre-filled filters
   */
  function buildCostDashboardLink(options: LinkBuilderOptions): string {
    const params = new URLSearchParams()

    if (options.accountIds && options.accountIds.length > 0) {
      params.set('accounts', options.accountIds.join(','))
    }

    if (options.dateRange) {
      params.set('start', options.dateRange.start)
      params.set('end', options.dateRange.end)
      params.set('range', 'custom')
    }

    params.set('granularity', options.granularity || 'DAILY')
    params.set('metric', options.metric || 'Billable')
    params.set('groupBy', options.groupBy || 'SERVICE')

    if (options.services && options.services.length > 0) {
      params.set('services', options.services.join(','))
    }

    return `/account/costs?${params.toString()}`
  }

  /**
   * Build Account Explorer link with filters
   */
  function buildExplorerLink(options: LinkBuilderOptions): string {
    const params = new URLSearchParams()

    if (options.accountIds && options.accountIds.length > 0) {
      params.set('accounts', options.accountIds.join(','))
    }

    if (options.resourceTypes && options.resourceTypes.length > 0) {
      params.set('resourceTypes', options.resourceTypes.join(','))
    }

    return `/account/explorer?${params.toString()}`
  }

  /**
   * Build Users page link with account filter
   */
  function buildUsersLink(accountId?: string, username?: string): string {
    if (username) {
      // Direct link to user profile
      return `/account/user/${username}`
    }

    // General users page
    const params = new URLSearchParams()
    if (accountId) {
      params.set('account', accountId)
    }

    return `/account/user${params.toString() ? '?' + params.toString() : ''}`
  }

  /**
   * Build Organization Chart link with highlight
   */
  function buildOrgChartLink(options: LinkBuilderOptions): string {
    const params = new URLSearchParams()

    if (options.highlight) {
      params.set('highlight', options.highlight)
    }

    return `/account/org-chart${params.toString() ? '?' + params.toString() : ''}`
  }

  /**
   * Build Dataset Reports link
   */
  function buildReportsLink(): string {
    return '/reports/datasets'
  }

  /**
   * Navigate to a link (uses nuxt router)
   */
  function navigateToLink(url: string) {
    const router = useRouter()
    router.push(url)
  }

  return {
    buildCostDashboardLink,
    buildExplorerLink,
    buildUsersLink,
    buildOrgChartLink,
    buildReportsLink,
    navigateToLink
  }
}
