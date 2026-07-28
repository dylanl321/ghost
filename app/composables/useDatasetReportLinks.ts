/**
 * Composable for building deep links to dataset reports
 * Allows easy navigation from account details and other pages
 * with pre-populated filters and configurations
 */

import type { ConfigDatasetFilters, SecurityHubDatasetFilters, CloudTrailDatasetFilters, EntraUsersDatasetFilters } from '#shared/types/dataset-reports'

export function useDatasetReportLinks() {
  /**
   * Build link to SecurityHub findings report for specific account(s)
   */
  function buildSecurityHubLink(
    accountIds: string | string[],
    filters?: Partial<SecurityHubDatasetFilters>,
    options?: {
      autoPreview?: boolean
      format?: 'pdf' | 'xlsx' | 'csv' | 'json'
    }
  ) {
    const accounts = Array.isArray(accountIds) ? accountIds : [accountIds]

    const query: Record<string, string> = {
      accounts: JSON.stringify(accounts),
      datasets: 'securityHub'
    }

    if (filters && Object.keys(filters).length > 0) {
      query.securityHubFilters = JSON.stringify(filters)
    }

    if (options?.autoPreview) {
      query.autoPreview = 'true'
    }

    if (options?.format) {
      query.format = options.format
    }

    return {
      path: '/reports/datasets',
      query
    }
  }

  /**
   * Build link to Config resources report for specific account(s)
   */
  function buildConfigLink(
    accountIds: string | string[],
    filters?: Partial<ConfigDatasetFilters>,
    options?: {
      autoPreview?: boolean
      format?: 'pdf' | 'xlsx' | 'csv' | 'json'
    }
  ) {
    const accounts = Array.isArray(accountIds) ? accountIds : [accountIds]

    const query: Record<string, string> = {
      accounts: JSON.stringify(accounts),
      datasets: 'config'
    }

    if (filters && Object.keys(filters).length > 0) {
      query.configFilters = JSON.stringify(filters)
    }

    if (options?.autoPreview) {
      query.autoPreview = 'true'
    }

    if (options?.format) {
      query.format = options.format
    }

    return {
      path: '/reports/datasets',
      query
    }
  }

  /**
   * Build link to CloudTrail events report for specific account(s)
   */
  function buildCloudTrailLink(
    accountIds: string | string[],
    filters?: Partial<CloudTrailDatasetFilters>,
    options?: {
      autoPreview?: boolean
      format?: 'pdf' | 'xlsx' | 'csv' | 'json'
      timeRange?: { startDate: string; endDate: string }
    }
  ) {
    const accounts = Array.isArray(accountIds) ? accountIds : [accountIds]

    const query: Record<string, string> = {
      accounts: JSON.stringify(accounts),
      datasets: 'cloudtrail'
    }

    if (filters && Object.keys(filters).length > 0) {
      query.cloudtrailFilters = JSON.stringify(filters)
    }

    if (options?.autoPreview) {
      query.autoPreview = 'true'
    }

    if (options?.format) {
      query.format = options.format
    }

    return {
      path: '/reports/datasets',
      query
    }
  }

  /**
   * Build link to Entra Users report for specific account(s)
   */
  function buildEntraUsersLink(
    accountIds: string | string[],
    filters?: Partial<EntraUsersDatasetFilters>,
    options?: {
      autoPreview?: boolean
      format?: 'pdf' | 'xlsx' | 'csv' | 'json'
    }
  ) {
    const accounts = Array.isArray(accountIds) ? accountIds : [accountIds]

    const query: Record<string, string> = {
      accounts: JSON.stringify(accounts),
      datasets: 'entraUsers'
    }

    if (filters && Object.keys(filters).length > 0) {
      query.entraUsersFilters = JSON.stringify(filters)
    }

    if (options?.autoPreview) {
      query.autoPreview = 'true'
    }

    if (options?.format) {
      query.format = options.format
    }

    return {
      path: '/reports/datasets',
      query
    }
  }

  /**
   * Build link with multiple datasets enabled
   */
  function buildMultiDatasetLink(
    accountIds: string | string[],
    datasets: Array<'config' | 'securityHub' | 'cloudtrail' | 'entraUsers'>,
    options?: {
      autoPreview?: boolean
      format?: 'pdf' | 'xlsx' | 'csv' | 'json'
    }
  ) {
    const accounts = Array.isArray(accountIds) ? accountIds : [accountIds]

    const query: Record<string, string> = {
      accounts: JSON.stringify(accounts),
      datasets: datasets.join(',')
    }

    if (options?.autoPreview) {
      query.autoPreview = 'true'
    }

    if (options?.format) {
      query.format = options.format
    }

    return {
      path: '/reports/datasets',
      query
    }
  }

  /**
   * Helper: Get critical/high severity SecurityHub findings link
   */
  function buildCriticalFindingsLink(accountIds: string | string[]) {
    return buildSecurityHubLink(
      accountIds,
      {
        severities: ['CRITICAL', 'HIGH'],
        statuses: ['NEW', 'NOTIFIED']
      },
      { autoPreview: true }
    )
  }

  /**
   * Helper: Get non-compliant Config resources link
   */
  function buildNonCompliantResourcesLink(accountIds: string | string[]) {
    return buildConfigLink(
      accountIds,
      {
        complianceStatus: ['NON_COMPLIANT']
      },
      { autoPreview: true }
    )
  }

  /**
   * Helper: Get recent CloudTrail errors link (last 7 days)
   */
  function buildRecentErrorsLink(accountIds: string | string[]) {
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - 7)

    return buildCloudTrailLink(
      accountIds,
      {
        errorsOnly: true,
        startTime: startDate.toISOString(),
        endTime: endDate.toISOString()
      },
      {
        autoPreview: true,
        timeRange: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString()
        }
      }
    )
  }

  return {
    // Main builders
    buildSecurityHubLink,
    buildConfigLink,
    buildCloudTrailLink,
    buildEntraUsersLink,
    buildMultiDatasetLink,

    // Convenience helpers
    buildCriticalFindingsLink,
    buildNonCompliantResourcesLink,
    buildRecentErrorsLink
  }
}
