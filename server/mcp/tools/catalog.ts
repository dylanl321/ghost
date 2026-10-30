import {
  acceptedContent,
  inputRequired,
  type McpServer,
  type RequestStateCodec,
  type ServerContext
} from '@modelcontextprotocol/server'
import * as z from 'zod-v4'
import { getPresignedDownloadUrl } from '../../utils/s3-storage'
import { getAllAccountsUnified, getAccountStatistics } from '../../utils/accounts-consolidated'
import { calculateRelevanceScore, fuzzySearchAccounts } from '../../utils/fuzzy-search'
import { findAccountByIdentifierOptimized } from '../../utils/account-lookup-optimized'
import { parseAWSGroup } from '../../utils/entra/group-parser'
import { getOrganizationInfo, getOrganizationalUnitTree, getAccountPolicies } from '../../utils/organizations'
import { buildCostFilter } from '../../utils/cost-domain'
import { getCostAllocationTags, getCostAndUsage, getCostAndUsageWithResources, getCostForecast, getProformaForecast } from '../../utils/cost-explorer'
import type { RelativePeriod } from '../../utils/date-helpers'
import { getAlertsByAccount, getAlertsByMonth, getAlertsByType, getAllAlerts } from '../../utils/budget-alerts'
import { queryEntraUsers } from '../../utils/entra-users-data'
import { queryConfigResources } from '../../utils/aws-config-data'
import { querySecurityHubFindings } from '../../utils/security-hub-data'
import { queryCloudTrailEvents } from '../../utils/cloudtrail-data'
import { buildAccountSecurityViaAthena, buildSecuritySummaryViaAthena } from '../../utils/security-hub-athena'
import { loadSecuritySummary } from '../../utils/security-summary-store'
import { getAccountPatchCompliance, getInstancePatchStatus } from '../../utils/ssm-patch-compliance'
import { analyzeBucketPolicy } from '../../utils/s3-policy-analyzer'
import {
  getOrganizationSummary,
  getOrganizationTimeline,
  getAccountDeploymentHealthData,
  getPipelineByIdWithDetails,
  getPipelineRunsForAccount,
  getPlannedVsAppliedSummary,
  getUnappliedResources,
  searchResourceAcrossAccounts
} from '../../utils/athena-pipeline-queries'
import { queryAIUsage } from '../../utils/ai-usage-query'
import { invokeBedrock } from '../../utils/bedrock-client'
import { getUserPreferences, updateUserPreferences } from '../../utils/user-preferences'
import { cancelDatasetExportJob, createDatasetExportJob, getDatasetExportJob, queryDatasetExportJobs } from '../../utils/dataset-export-jobs'
import { setNotificationMute, setNotificationStatus } from '../../utils/notification-service'
import { getDatasetReportConfigErrors } from '../../utils/dataset-report-validation'
import { listUserReports } from '../../utils/scheduled-reports'
import { getLatestAnalysis, getInstanceClassifications } from '../../utils/utilization-persistence'
import { buildInstanceHealth } from '../../utils/instance-health'
import { getAnnualBudgetArray, getPeriodBudget } from '../../../shared/utils/budget-utils'
import type { DatasetReportConfig } from '../../../shared/types/dataset-reports'
import type { NotificationCategory, NotificationStatus } from '../../../shared/types/notifications'
import type { GhostMcpClientAttribution, GhostMcpPrincipal } from '../types'
import {
  beginMcpIdentityCenterAuthorization,
  issueMcpIdentityCenterCredentials,
  validateMcpIdentityCenterCredentialRequest
} from '../idc-credentials'
import { explainMcpIdentityCenterUserAccess, getMcpIdentityCenterAccountAccess, getMcpIdentityCenterUserAccess } from '../idc-admin-access'
import { createMcpDelegatedGraphEvent } from '../oauth/delegated-graph'
import { renderGhostOutput } from '../output-format'
import { answerSupportKnowledgeBase, searchSupportKnowledgeBase } from '../support-knowledge'
import { collectCompliance } from '../compliance'
import { getGoldenAmis } from '../golden-amis'
import { createRemediationPlan } from '../remediation'
import { buildAccountHealth } from '../account-health'
import { EVIDENCE_DOMAINS, createEvidenceBundle, deleteEvidenceBundle, evidenceDownloadUrl, getEvidenceBundle, listEvidenceBundles } from '../evidence'
import { decodeCursor, encodeCursor, normalizeLimit, toolError, toolRenderedOutput, toolSuccess } from '../results'
import { runIdempotent } from '../idempotency'
import { buildMcpCostDashboard } from '../cost-dashboard'
import { costScopeMetadata, normalizeCostDateRange, normalizeCostForecastRange, resolveCostScope } from '../cost-scope'
import { compareMcpCosts } from '../cost-comparison'
import { queryCostAnomalies } from '../../utils/cost-anomalies'
import { buildPersonalAccountContext } from '../personal-account-context'
import { advancedQueryGuidance, isCentralAccount } from '../guidance'
import {
  booleanValue,
  boundedInteger,
  enumList,
  flexibleBooleanSchema,
  flexibleEnvironmentSchema,
  flexibleIntegerSchema,
  flexibleStringListSchema,
  operationalEnvironment,
  resolveAccountReference,
  resolveOperationalScope,
  resourceTypes,
  stringList,
  type ResolvedOperationalScope
} from '../tool-input'
import { registerGhostTool } from './register'
import { buildAccountResolution } from '../account-resolver'

const operationalEnvironmentSchema = z.string().default('govcloud').transform(value => operationalEnvironment(value))
const costEnvironmentSchema = z.enum(['commercial', 'govcloud']).default('commercial')
const accountIdentifiersSchema = z.union([z.string(), z.array(z.string())]).default([]).transform(value => stringList(value))
const notificationCategorySchema = z.enum([
  'BUDGET_THRESHOLD', 'COST_ANOMALY', 'COST_SUMMARY', 'SECURITY_CRITICAL',
  'COMPLIANCE', 'SECURITY_SCORE', 'PIPELINE_FAILURE', 'DEPLOYMENT',
  'REPORT_READY', 'SYSTEM', 'ACHIEVEMENT'
])
const notificationStatusSchema = z.enum(['unread', 'read', 'archived'])
const paginationSchema = {
  limit: z.number().int().min(1).max(100).optional(),
  cursor: z.string().optional()
}

function accountDisplayName(account: any): string {
  return account.name || account.projectName || account.accountName || account.accountAlias || account.accountId || 'Unknown account'
}

async function resolveAccount(identifier: string) {
  const result = await findAccountByIdentifierOptimized(identifier, { includeDecommissioned: true })
  if (result) return result
  const account = await resolveAccountReference(identifier, await getAllAccountsUnified(true))
  return { account, identifierType: 'name' as any, matchedValue: identifier, source: account.source || 'both' }
}

async function commercialIds(identifiers: string[]): Promise<string[]> {
  if (!identifiers.length) return []
  const scope = await resolveOperationalScope(identifiers, 'commercial')
  return scope.commercialAccountIds
}

function accountInput(args: any): unknown {
  return args.account ?? args.accounts ?? args.account_identifiers ?? args.account_identifier ?? args.account_id ?? args.identifier
}

function scopeMetadata(scope: ResolvedOperationalScope): Record<string, unknown> {
  return {
    environment: scope.environment,
    organizationWide: scope.organizationWide,
    accounts: scope.accounts
  }
}

function dateRange(args: { start_date?: string; end_date?: string; period?: string }) {
  return normalizeCostDateRange({ start_date: args.start_date, end_date: args.end_date, period: args.period as RelativePeriod | undefined })
}

function groupTotals(resultsByTime: any[]): Map<string, number> {
  const totals = new Map<string, number>()
  for (const period of resultsByTime) {
    for (const group of period.Groups || []) {
      const key = group.Keys?.[0]
      if (!key) continue
      totals.set(key, (totals.get(key) || 0) + Number(group.Metrics?.UnblendedCost?.Amount || 0))
    }
  }
  return totals
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function forecastTotal(result: any, mode: 'billable' | 'proforma'): number {
  const forecast = mode === 'proforma' ? result?.proformaAccount?.forecast : result
  return Number(forecast?.total?.Amount || 0)
}

function idempotencyKeySchema() {
  return z.string().min(8).max(128).describe('Stable caller-generated key used to prevent accidental duplicate writes')
}

export function registerCatalogTools(
  server: McpServer,
  principal: GhostMcpPrincipal,
  confirmationCodec: RequestStateCodec<{ tool: string; targetId: string }>,
  requestClient: Partial<GhostMcpClientAttribution> = {}
): void {
  const read = (definition: Omit<Parameters<typeof registerGhostTool>[2], 'scope' | 'annotations'>) => registerGhostTool(server, principal, {
    ...definition,
    scope: 'ghost.read',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  }, requestClient)
  const collaborate = (definition: Omit<Parameters<typeof registerGhostTool>[2], 'scope'>) => registerGhostTool(server, principal, {
    ...definition,
    scope: 'ghost.collaborate'
  }, requestClient)
  const ai = (definition: Omit<Parameters<typeof registerGhostTool>[2], 'scope'>) => registerGhostTool(server, principal, {
    ...definition,
    scope: 'ghost.ai.invoke'
  }, requestClient)
  const credentials = (definition: Omit<Parameters<typeof registerGhostTool>[2], 'scope'>) => registerGhostTool(server, principal, {
    ...definition,
    scope: 'ghost.credentials.issue'
  }, requestClient)

  const searchPipelines = async (args: any) => {
    const days = boundedInteger(args.days, { name: 'days', minimum: 1, maximum: 90, fallback: 30 })
    const limit = boundedInteger(args.limit, { name: 'limit', minimum: 1, maximum: 100, fallback: 25 })
    const mode = args.mode || 'auto'
    if (args.environment && String(args.environment).toLowerCase() !== 'auto' && operationalEnvironment(args.environment) !== 'govcloud') {
      const error = new Error('Pipeline telemetry is stored in GovCloud; environment must be auto or govcloud.')
      error.name = 'INVALID_ENVIRONMENT'
      throw error
    }
    const scope = await resolveOperationalScope(args.account, 'govcloud')
    if (mode === 'overview' && (scope.accounts.length || args.query)) {
      const error = new Error('Pipeline overview mode does not accept account or query filters.')
      error.name = 'CONFLICTING_FILTERS'
      throw error
    }
    if (mode === 'health' || mode === 'drift') {
      if (scope.accounts.length !== 1) {
        const error = new Error(`Pipeline ${mode} mode requires exactly one account.`)
        error.name = 'ACCOUNT_REQUIRED'
        throw error
      }
      const account = scope.accounts[0]!
      if (mode === 'health') {
        const result = await getAccountDeploymentHealthData(account.selectedAccountId, days, 'govcloud')
        return toolSuccess({ mode, account, result }, 'Pipeline deployment health loaded.', 'Athena pipeline telemetry', { resolvedScope: scopeMetadata(scope), appliedFilters: { days } })
      }
      const [summary, unappliedResources] = await Promise.all([
        getPlannedVsAppliedSummary(account.selectedAccountId, days, 'govcloud'),
        getUnappliedResources(account.selectedAccountId, days, 'govcloud')
      ])
      return toolSuccess({ mode, account, summary, unappliedResources: unappliedResources.slice(0, limit), truncated: unappliedResources.length > limit }, 'Pipeline drift evidence loaded.', 'Athena pipeline telemetry', {
        resolvedScope: scopeMetadata(scope), appliedFilters: { days, limit }, warnings: unappliedResources.length > limit ? [`Only the first ${limit} unapplied resources are included.`] : undefined
      })
    }
    if (mode === 'resource_search' || (mode === 'auto' && args.query)) {
      if (!args.query) {
        const error = new Error('Pipeline resource_search mode requires query.')
        error.name = 'QUERY_REQUIRED'
        throw error
      }
      if (scope.accounts.length > 1) {
        const error = new Error('Pipeline resource search accepts one account at a time.')
        error.name = 'TOO_MANY_ACCOUNTS'
        throw error
      }
      const result = await searchResourceAcrossAccounts(args.query, days, scope.operationalAccountIds[0], 'govcloud')
      return toolSuccess({ mode: 'resource_search', result }, 'Pipeline resource search complete.', 'Athena pipeline telemetry', { resolvedScope: scopeMetadata(scope), appliedFilters: { query: args.query, days } })
    }
    if (mode === 'account_runs' || (mode === 'auto' && scope.accounts.length)) {
      if (!scope.accounts.length) {
        const error = new Error('Pipeline account_runs mode requires at least one account.')
        error.name = 'ACCOUNT_REQUIRED'
        throw error
      }
      const accounts = await Promise.all(scope.accounts.map(async account => ({ account, runs: await getPipelineRunsForAccount(account.selectedAccountId, days, 'govcloud', limit) })))
      return toolSuccess({ mode: 'account_runs', accounts }, 'Account pipeline runs loaded.', 'Athena pipeline telemetry', { resolvedScope: scopeMetadata(scope), appliedFilters: { days, limit } })
    }
    const [summary, timeline] = await Promise.all([getOrganizationSummary(days, 'govcloud'), getOrganizationTimeline(days, limit, 'govcloud')])
    return toolSuccess({ mode: 'overview', summary, timeline }, 'Pipeline overview loaded.', 'Athena pipeline telemetry', { resolvedScope: scopeMetadata(scope), appliedFilters: { days, limit } })
  }

  read({
    name: 'ghost.accounts.resolve', title: 'Resolve an AWS access target',
    description: 'Return canonical account metadata, direct IDC choices, and approved master-account hub recipes without returning credentials.',
    inputSchema: z.object({ identifier: z.string().min(1) }),
    handler: async args => {
      const resolved = await resolveAccount(args.identifier)
      const environment = (
        resolved.identifierType === 'govId' ||
        args.identifier === resolved.account.govCloudAccountId ||
        args.identifier === resolved.account.awsGovCloudAccountID ||
        (!['accountId'].includes(resolved.identifierType) && Boolean(resolved.account.govCloudAccountId || resolved.account.awsGovCloudAccountID))
      ) ? 'govcloud' : 'commercial'
      const userAccess = await getMcpIdentityCenterUserAccess(principal.email, [environment])
      const result = buildAccountResolution(
        { account: resolved.account, identifierType: resolved.identifierType, matchedValue: resolved.matchedValue },
        userAccess.accounts
      )
      return toolSuccess(result, `Resolved AWS access target ${result.canonical_account_id}.`, 'GHOST account metadata and AWS IAM Identity Center Admin')
    }
  })

  read({
    name: 'ghost.accounts.search', title: 'Search GHOST accounts',
    description: 'Search enriched GHOST AWS account metadata by name, alias, ID, email, request ID, project, department, or line of business.',
    inputSchema: z.object({ query: z.string().min(1), ...paginationSchema }),
    handler: async args => {
      const accounts = await getAllAccountsUnified(false)
      const limit = normalizeLimit(args.limit)
      const cursor = decodeCursor<{ query: string; score: number; id: string }>(args.cursor)
      if (cursor && cursor.query !== args.query.trim().toLowerCase()) throw new Error('Pagination cursor does not match the account query')
      const key = (item: any) => item.accountId || item.awsStandardAccountID || item.govCloudAccountId || item.awsGovCloudAccountID || String(item.requestId || '')
      let matches = await fuzzySearchAccounts(args.query, accounts, accounts.length)
      matches.sort((left, right) => left.score - right.score || key(left.item).localeCompare(key(right.item)))
      if (cursor) matches = matches.filter(match => match.score > cursor.score || (match.score === cursor.score && key(match.item) > cursor.id))
      const page = matches.slice(0, limit)
      const last = page.at(-1)
      const nextCursor = matches.length > page.length && last ? encodeCursor({ query: args.query.trim().toLowerCase(), score: last.score, id: key(last.item) }) : undefined
      const records = page.map(match => ({
        ...match.item,
        match: { relevance: calculateRelevanceScore(match.score), fields: [...new Set((match.matches || []).map(value => value.key).filter(Boolean))] }
      }))
      return toolSuccess(records, `Found ${records.length} matching account(s).`, 'Organizations and GHOST account metadata', { nextCursor })
    }
  })

  read({
    name: 'ghost.accounts.get', title: 'Get a GHOST account',
    description: 'Resolve one account from a commercial ID, GovCloud ID, request ID, email, or unambiguous name and return its enriched metadata.',
    inputSchema: z.object({ identifier: z.string().min(1), include_decommissioned: z.boolean().default(false) }),
    handler: async args => {
      const result = await resolveAccount(args.identifier)
      if (!args.include_decommissioned && result.account.enclaveStatus === 'Decommissioned') return toolError('ACCOUNT_DECOMMISSIONED', 'The account is decommissioned.')
      return toolSuccess(result, `Resolved ${accountDisplayName(result.account)}.`, 'Organizations and GHOST account metadata')
    }
  })

  read({
    name: 'ghost.accounts.list', title: 'List GHOST accounts',
    description: 'List organization accounts with GHOST metadata and optional status, environment, department, line-of-business, or text filters.',
    inputSchema: z.object({
      search: z.string().optional(), department: z.string().optional(), line_of_business: z.string().optional(),
      include_decommissioned: z.boolean().default(false), ...paginationSchema
    }),
    handler: async args => {
      let accounts = await getAllAccountsUnified(args.include_decommissioned)
      if (args.search) {
        const term = args.search.toLowerCase()
        accounts = accounts.filter(account => JSON.stringify(account).toLowerCase().includes(term))
      }
      if (args.department) accounts = accounts.filter(account => account.departmentNumber === args.department)
      if (args.line_of_business) accounts = accounts.filter(account => account.linesOfBusiness?.includes(args.line_of_business))
      const limit = normalizeLimit(args.limit)
      const sortKey = (account: any) => `${accountDisplayName(account).toLowerCase()}\0${account.accountId || account.awsStandardAccountID || account.govCloudAccountId || account.awsGovCloudAccountID || account.requestId || ''}`
      accounts.sort((left, right) => sortKey(left).localeCompare(sortKey(right)))
      const signature = JSON.stringify({ search: args.search || '', department: args.department || '', lineOfBusiness: args.line_of_business || '', includeDecommissioned: args.include_decommissioned })
      const cursor = decodeCursor<{ key: string; signature: string }>(args.cursor)
      if (cursor && cursor.signature !== signature) throw new Error('Pagination cursor does not match the account filters')
      if (cursor) accounts = accounts.filter(account => sortKey(account) > cursor.key)
      const page = accounts.slice(0, limit)
      const nextCursor = accounts.length > page.length && page.length ? encodeCursor({ key: sortKey(page[page.length - 1]!), signature }) : undefined
      return toolSuccess(page, `Listed ${page.length} account(s).`, 'Organizations and GHOST account metadata', { nextCursor })
    }
  })

  read({
    name: 'ghost.accounts.statistics', title: 'Get account statistics', description: 'Return aggregate counts and classifications for the GHOST account catalog.',
    inputSchema: z.object({}), handler: async () => toolSuccess(await getAccountStatistics(), 'Account statistics loaded.', 'GHOST account metadata')
  })

  read({
    name: 'ghost.access.mine', title: 'Get my AWS accounts',
    description: 'List the authenticated user\'s effective AWS accounts and roles from IAM Identity Center using GHOST management-account APIs. No user AWS session is required.',
    inputSchema: z.object({
      environment: z.enum(['commercial', 'govcloud', 'both']).default('both')
    }),
    handler: async args => {
      const environments = args.environment === 'both' ? ['commercial', 'govcloud'] as const : [args.environment]
      const access = await getMcpIdentityCenterUserAccess(principal.email, [...environments])
      return toolSuccess(access, `Loaded ${access.accounts.length} effective account assignment(s) from IAM Identity Center.`, 'AWS IAM Identity Center Admin and GHOST account metadata')
    }
  })

  read({
    name: 'ghost.organization.overview', title: 'Get organization overview', description: 'Return AWS Organizations metadata and GHOST account statistics for Commercial or GovCloud.',
    inputSchema: z.object({ environment: operationalEnvironmentSchema }),
    handler: async args => toolSuccess({ organization: await getOrganizationInfo(args.environment), accounts: await getAccountStatistics() }, 'Organization overview loaded.', 'AWS Organizations')
  })

  read({
    name: 'ghost.organization.structure', title: 'Get organization structure', description: 'Return the cached AWS Organizations OU and account hierarchy.',
    inputSchema: z.object({ environment: operationalEnvironmentSchema }),
    handler: async args => toolSuccess(await getOrganizationalUnitTree(args.environment), 'Organization structure loaded.', 'AWS Organizations')
  })

  read({
    name: 'ghost.organization.governance', title: 'Get account governance', description: 'Return service control policies attached to a resolved account.',
    inputSchema: z.object({ identifier: z.string().min(1), environment: operationalEnvironmentSchema }),
    handler: async args => {
      const { account } = await resolveAccount(args.identifier)
      const id = args.environment === 'govcloud' ? account.govCloudAccountId || account.awsGovCloudAccountID : account.accountId || account.awsStandardAccountID
      if (!id) return toolError('ACCOUNT_ENVIRONMENT_MISSING', `The account has no ${args.environment} identifier.`)
      return toolSuccess(await getAccountPolicies(id, args.environment), `Governance policies loaded for ${accountDisplayName(account)}.`, 'AWS Organizations')
    }
  })

  const costQuerySchema = z.object({
    start_date: z.string().optional(), end_date: z.string().optional(),
    period: z.enum(['last7days', 'last30days', 'last90days', 'thisMonth', 'lastMonth', 'thisQuarter', 'lastQuarter', 'thisYear', 'lastYear', 'ytd', 'last12months']).optional(),
    environment: costEnvironmentSchema,
    mode: z.enum(['billable', 'proforma']).default('proforma'),
    account_identifiers: accountIdentifiersSchema,
    group_by: z.enum(['SERVICE', 'LINKED_ACCOUNT', 'REGION', 'NONE']).default('SERVICE'),
    granularity: z.enum(['DAILY', 'MONTHLY']).default('MONTHLY')
  })

  read({
    name: 'ghost.costs.query', title: 'Query AWS costs', description: 'Query GHOST canonical costs for a date range, account scope, and grouping. Defaults to proforma chargeback costs; use billable only when explicitly needed.',
    auditSource: 'AWS Cost Explorer',
    inputSchema: costQuerySchema,
    handler: async args => {
      const range = dateRange(args)
      const scope = await resolveCostScope({ identifiers: args.account_identifiers, environment: args.environment, mode: args.mode })
      const response = await getCostAndUsage({
        startDate: range.startDate, endDate: range.endDate, granularity: args.granularity,
        metrics: ['UnblendedCost'], filter: buildCostFilter({ accountIds: scope.linkedAccountIds.length ? scope.linkedAccountIds : undefined }),
        groupBy: args.group_by === 'NONE' ? undefined : [{ type: 'DIMENSION', key: args.group_by }]
      }, args.environment, scope.payerAccountId)
      return toolSuccess(response.dataset, `Cost query returned ${response.dataset.reconciliation.authoritativeTotal.toFixed(2)} USD.`, 'AWS Cost Explorer', { resolvedScope: costScopeMetadata(scope) })
    }
  })

  read({
    name: 'ghost.costs.compare', title: 'Compare AWS cost periods', description: 'Compare two validated cost periods with reconciled totals plus service and account deltas.',
    inputSchema: z.object({
      current_start_date: z.string(), current_end_date: z.string(),
      comparison_start_date: z.string(), comparison_end_date: z.string(),
      environment: costEnvironmentSchema,
      mode: z.enum(['billable', 'proforma']).default('proforma'),
      account_identifiers: accountIdentifiersSchema
    }),
    getAuditTargetIds: args => args.account_identifiers,
    handler: async args => {
      const scope = await resolveCostScope({ identifiers: args.account_identifiers, environment: args.environment, mode: args.mode })
      const result = await compareMcpCosts({
        scope,
        current: { start_date: args.current_start_date, end_date: args.current_end_date },
        comparison: { start_date: args.comparison_start_date, end_date: args.comparison_end_date }
      })
      return toolSuccess(result, `Cost changed by ${result.totalDelta.toFixed(2)} USD between the two periods.`, 'AWS Cost Explorer', {
        resolvedScope: costScopeMetadata(scope),
        warnings: result.warnings.length ? result.warnings : undefined
      })
    }
  })

  read({
    name: 'ghost.costs.anomalies', title: 'List AWS cost anomalies', description: 'Return bounded AWS Cost Anomaly Detection results with observed-window and confidence metadata.',
    inputSchema: z.object({
      account_identifier: z.string().optional(),
      environment: costEnvironmentSchema,
      lookback_days: z.number().int().min(1).max(90).default(30),
      limit: z.number().int().min(1).max(100).default(25),
      cursor: z.string().optional()
    }),
    getAuditTargetIds: args => args.account_identifier ? [args.account_identifier] : undefined,
    handler: async args => {
      const scope = await resolveCostScope({ identifiers: args.account_identifier ? [args.account_identifier] : [], environment: args.environment, mode: 'billable' })
      const result = await queryCostAnomalies({ environment: args.environment, accountId: scope.linkedAccountIds[0], daysBack: args.lookback_days, limit: args.limit, cursor: args.cursor })
      return toolSuccess(result, `Returned ${result.anomalies.length} matching cost anomaly(ies).`, 'AWS Cost Anomaly Detection', {
        nextCursor: result.nextCursor,
        resolvedScope: costScopeMetadata(scope),
        warnings: result.confidence.exhaustive ? undefined : ['More anomaly records are available.']
      })
    }
  })

  read({
    name: 'ghost.costs.dashboard', title: 'Get cost dashboard', description: 'Return dashboard cost totals plus budget health, end-of-month and year-end projections, account estimates, and methodology. Defaults to proforma chargeback costs.',
    auditSource: 'AWS Cost Explorer and GHOST account budgets',
    inputSchema: costQuerySchema.omit({ group_by: true, granularity: true }),
    handler: async args => {
      const range = dateRange(args)
      const scope = await resolveCostScope({ identifiers: args.account_identifiers, environment: args.environment, mode: args.mode })
      const ids = scope.linkedAccountIds
      const target = scope.payerAccountId
      const base = { startDate: range.startDate, endDate: range.endDate, granularity: 'MONTHLY' as const, metrics: ['UnblendedCost'], filter: buildCostFilter({ accountIds: ids.length ? ids : undefined }) }
      const [accounts, services, accountMetadata] = await Promise.all([
        getCostAndUsage({ ...base, groupBy: [{ type: 'DIMENSION', key: 'LINKED_ACCOUNT' }] }, args.environment, target),
        getCostAndUsage({ ...base, groupBy: [{ type: 'DIMENSION', key: 'SERVICE' }] }, args.environment, target),
        getAllAccountsUnified(true)
      ])
      const now = new Date()
      const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
      const currentMonthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))
      const nextMonthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1))
      const nextYearStart = new Date(Date.UTC(today.getUTCFullYear() + 1, 0, 1))
      const isCurrentPeriod = range.startDate < formatDate(nextMonthStart) && range.endDate > formatDate(currentMonthStart)
      const currentBase = {
        startDate: formatDate(currentMonthStart), endDate: formatDate(today), granularity: 'MONTHLY' as const,
        metrics: ['UnblendedCost'], filter: buildCostFilter({ accountIds: ids.length ? ids : undefined }),
        groupBy: [{ type: 'DIMENSION' as const, key: 'LINKED_ACCOUNT' }]
      }
      const completedBase = {
        startDate: formatDate(new Date(Date.UTC(today.getUTCFullYear(), 0, 1))), endDate: formatDate(currentMonthStart), granularity: 'MONTHLY' as const,
        metrics: ['UnblendedCost'], filter: buildCostFilter({ accountIds: ids.length ? ids : undefined }),
        groupBy: [{ type: 'DIMENSION' as const, key: 'LINKED_ACCOUNT' }]
      }
      const previousMonthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1))
      const previousMonthMtdEnd = new Date(Math.min(
        previousMonthStart.getTime() + (today.getTime() - currentMonthStart.getTime()),
        currentMonthStart.getTime()
      ))
      const currentForecastRange = { startDate: formatDate(today), endDate: formatDate(nextMonthStart) }
      const forecastFilter = buildCostFilter({ accountIds: ids.length ? ids : undefined })
      const currentForecast = () => args.mode === 'proforma'
        ? getProformaForecast(currentForecastRange.startDate, currentForecastRange.endDate, 'UNBLENDED_COST', 'DAILY', forecastFilter)
        : getCostForecast(currentForecastRange.startDate, currentForecastRange.endDate, 'UNBLENDED_COST', 'DAILY', forecastFilter, args.environment, target)
      const futureForecast = () => args.mode === 'proforma'
        ? getProformaForecast(formatDate(nextMonthStart), formatDate(nextYearStart), 'UNBLENDED_COST', 'MONTHLY', forecastFilter)
        : getCostForecast(formatDate(nextMonthStart), formatDate(nextYearStart), 'UNBLENDED_COST', 'MONTHLY', forecastFilter, args.environment, target)

      const currentData = isCurrentPeriod
        ? await Promise.all([
            getCostAndUsage(currentBase, args.environment, target),
            getCostAndUsage({ ...currentBase, groupBy: undefined }, args.environment, target),
            getCostAndUsage({ ...currentBase, startDate: formatDate(previousMonthStart), endDate: formatDate(previousMonthMtdEnd), groupBy: undefined }, args.environment, target),
            getCostAndUsage({ ...currentBase, startDate: formatDate(previousMonthStart), endDate: formatDate(currentMonthStart), groupBy: undefined }, args.environment, target),
            getCostAndUsage(completedBase, args.environment, target),
            Promise.allSettled([currentForecast(), today.getUTCMonth() === 11 ? Promise.resolve(null) : futureForecast()])
          ])
        : null
      const periodTotals = groupTotals(accounts.resultsByTime)
      const metadataById = new Map<string, any>()
      for (const account of accountMetadata) {
        for (const id of [account.accountId, account.awsStandardAccountID, account.awsGovCloudAccountID, account.govCloudAccountId]) {
          if (id) metadataById.set(id, account)
        }
      }
      const currentTotals = currentData ? groupTotals(currentData[0].resultsByTime) : new Map<string, number>()
      const completedTotals = currentData ? groupTotals(currentData[4].resultsByTime) : new Map<string, number>()
      const accountIds = new Set([...periodTotals.keys(), ...currentTotals.keys(), ...completedTotals.keys(), ...ids])
      const projectionResults = currentData?.[5]
      const currentProjection = projectionResults?.[0]
      const futureProjection = projectionResults?.[1]
      const currentProjectionValue = currentProjection?.status === 'fulfilled' ? currentProjection.value : undefined
      const futureProjectionValue = futureProjection?.status === 'fulfilled' ? futureProjection.value : undefined
      const projectionsAvailable = isCurrentPeriod && currentProjection?.status === 'fulfilled' && futureProjection?.status !== 'rejected'
      const projectionReason = !isCurrentPeriod
        ? 'Forecasts are unavailable for historical dashboard periods.'
        : !projectionsAvailable
          ? 'AWS Cost Explorer forecast data is currently unavailable for this scope.'
          : undefined
      const dashboard = buildMcpCostDashboard({
        mode: args.mode,
        environment: args.environment,
        period: { startDate: range.startDate, endDate: range.endDate, description: range.description },
        accountIdentifiers: args.account_identifiers,
        resolvedAccountIds: ids,
        accounts: [...accountIds].map(accountId => {
          const account = metadataById.get(accountId)
          const budget = getPeriodBudget(account, range.startDate, range.endDate)
          const annualBudget = getAnnualBudgetArray(account).monthlyArray.reduce((total, amount) => total + amount, 0)
          return {
            accountId,
            accountName: accountDisplayName(account || { accountId }),
            periodSpend: periodTotals.get(accountId) || 0,
            currentMonthSpend: currentTotals.get(accountId) || 0,
            completedMonthsSpend: completedTotals.get(accountId) || 0,
            periodBudget: budget.periodBudget,
            paceToDateBudget: budget.paceToDateBudget,
            budgetSource: budget.source,
            annualBudget
          }
        }),
        services: [...groupTotals(services.resultsByTime)].map(([service, spend]) => ({ service, spend })),
        previousMonthMtd: currentData ? currentData[2].dataset.reconciliation.authoritativeTotal : null,
        previousMonthFull: currentData ? currentData[3].dataset.reconciliation.authoritativeTotal : null,
        projectionAvailability: projectionsAvailable ? 'available' : isCurrentPeriod ? 'unavailable' : 'not_applicable',
        projectionReason,
        currentMonthRemainderForecast: projectionsAvailable ? forecastTotal(currentProjectionValue, args.mode) : undefined,
        futureMonthsForecast: projectionsAvailable ? futureProjectionValue ? forecastTotal(futureProjectionValue, args.mode) : 0 : undefined,
        dayOfMonth: today.getUTCDate()
      })
      return toolSuccess({ accounts: accounts.dataset, services: services.dataset, dashboard }, 'Cost dashboard data loaded.', 'AWS Cost Explorer and GHOST account budgets', {
        resolvedScope: costScopeMetadata(scope),
        warnings: projectionReason ? [projectionReason] : undefined
      })
    }
  })

  read({
    name: 'ghost.costs.forecast', title: 'Forecast AWS costs', description: 'Return cost forecasts for an optional account scope. Defaults to proforma chargeback forecasts.',
    auditSource: 'AWS Cost Explorer',
    inputSchema: z.object({ start_date: z.string(), end_date: z.string(), mode: z.enum(['billable', 'proforma']).default('proforma'), environment: costEnvironmentSchema, account_identifiers: accountIdentifiersSchema, granularity: z.enum(['DAILY', 'MONTHLY']).default('DAILY') }),
    handler: async args => {
      const range = normalizeCostForecastRange({ start_date: args.start_date, end_date: args.end_date, maximumDays: 365 })
      const scope = await resolveCostScope({ identifiers: args.account_identifiers, environment: args.environment, mode: args.mode })
      const filter = buildCostFilter({ accountIds: scope.linkedAccountIds.length ? scope.linkedAccountIds : undefined })
      const result = args.mode === 'proforma'
        ? await getProformaForecast(range.startDate, range.endDate, 'UNBLENDED_COST', args.granularity, filter)
        : await getCostForecast(range.startDate, range.endDate, 'UNBLENDED_COST', args.granularity, filter, args.environment, scope.payerAccountId)
      return toolSuccess(result, 'Cost forecast loaded.', 'AWS Cost Explorer', { resolvedScope: costScopeMetadata(scope) })
    }
  })

  read({
    name: 'ghost.costs.resources', title: 'Get resource-level costs', description: 'Return billable resource-level Cost Explorer data for a required account and date range. Billing Conductor does not provide resource-level proforma allocation.',
    auditSource: 'AWS Cost Explorer',
    inputSchema: z.object({ identifier: z.string(), start_date: z.string(), end_date: z.string(), environment: costEnvironmentSchema, granularity: z.enum(['DAILY', 'MONTHLY']).default('DAILY') }),
    handler: async args => {
      const range = normalizeCostDateRange({ start_date: args.start_date, end_date: args.end_date, maximumDays: 14 })
      const scope = await resolveCostScope({ identifiers: [args.identifier], environment: args.environment, mode: 'billable', requireAccount: true })
      const result = await getCostAndUsageWithResources({ startDate: range.startDate, endDate: range.endDate, granularity: args.granularity, metrics: ['UnblendedCost'], filter: buildCostFilter({ accountIds: scope.linkedAccountIds })! }, args.environment, scope.payerAccountId)
      return toolSuccess(result, 'Resource-level costs loaded.', 'AWS Cost Explorer', { resolvedScope: costScopeMetadata(scope) })
    }
  })

  read({
    name: 'ghost.costs.tags', title: 'Discover cost tags', description: 'List billable Cost Explorer allocation tag keys or values for a date range. Billing Conductor does not provide native tag-level proforma allocation.',
    auditSource: 'AWS Cost Explorer',
    inputSchema: z.object({ start_date: z.string(), end_date: z.string(), tag_key: z.string().optional(), environment: costEnvironmentSchema, limit: z.number().int().min(1).max(100).default(50), cursor: z.string().optional() }),
    handler: async args => {
      const range = normalizeCostDateRange({ start_date: args.start_date, end_date: args.end_date, maximumDays: 365 })
      const scope = await resolveCostScope({ environment: args.environment, mode: 'billable' })
      const result = await getCostAllocationTags({ Start: range.startDate, End: range.endDate }, args.tag_key, undefined, args.environment, scope.payerAccountId, { limit: args.limit, nextToken: args.cursor })
      return toolSuccess(result, 'Cost tags loaded.', 'AWS Cost Explorer', { nextCursor: result.nextToken, resolvedScope: costScopeMetadata(scope) })
    }
  })

  read({
    name: 'ghost.costs.budget_vs_actual', title: 'Compare budget and actual cost', description: 'Compare account actuals with GHOST account budgets for a date range. Defaults to proforma chargeback actuals.',
    auditSource: 'AWS Cost Explorer and GHOST account budgets',
    inputSchema: costQuerySchema.omit({ group_by: true, granularity: true }),
    handler: async args => {
      const range = dateRange(args)
      const scope = await resolveCostScope({ identifiers: args.account_identifiers, environment: args.environment, mode: args.mode })
      const ids = scope.linkedAccountIds
      const response = await getCostAndUsage({
        startDate: range.startDate, endDate: range.endDate, granularity: 'MONTHLY', metrics: ['UnblendedCost'],
        filter: buildCostFilter({ accountIds: ids.length ? ids : undefined }),
        groupBy: [{ type: 'DIMENSION', key: 'LINKED_ACCOUNT' }]
      }, args.environment, scope.payerAccountId)
      const actuals = new Map<string, number>()
      for (const period of response.resultsByTime) {
        for (const group of period.Groups || []) {
          const id = group.Keys?.[0]
          if (id) actuals.set(id, (actuals.get(id) || 0) + Number(group.Metrics?.UnblendedCost?.Amount || 0))
        }
      }
      const accounts = (await getAllAccountsUnified(true))
        .filter(account => !ids.length || ids.includes(args.environment === 'govcloud' ? account.govCloudAccountId || account.awsGovCloudAccountID || '' : account.accountId || account.awsStandardAccountID || ''))
        .map(account => {
          const accountId = account.accountId || account.awsStandardAccountID || ''
          const linkedAccountId = args.environment === 'govcloud' ? account.govCloudAccountId || account.awsGovCloudAccountID || '' : accountId
          const budget = getPeriodBudget(account, range.startDate, range.endDate)
          const actual = actuals.get(linkedAccountId) || 0
          return { accountId, linkedAccountId, accountName: accountDisplayName(account), actual, budget: budget.periodBudget, variance: budget.periodBudget === null ? null : actual - budget.periodBudget, budgetSource: budget.source }
        })
      return toolSuccess({ accounts, totalActual: response.dataset.reconciliation.authoritativeTotal }, 'Budget-versus-actual data loaded.', 'AWS Cost Explorer and GHOST account budgets', { resolvedScope: costScopeMetadata(scope) })
    }
  })

  read({
    name: 'ghost.alerts.list', title: 'List budget alerts', description: 'List budget alerts by account, month, or alert type with a bounded result size.',
    inputSchema: z.object({ account_id: z.string().optional(), month: z.string().regex(/^\d{4}-\d{2}$/).optional(), alert_type: z.enum(['FORECAST', 'ACTUAL']).optional(), limit: z.number().int().min(1).max(100).default(25), cursor: z.string().optional() }),
    getAuditTargetIds: args => args.account_id ? [args.account_id] : undefined,
    handler: async args => {
      const monthStart = args.month ? `${args.month}-01T00:00:00.000Z` : undefined
      const monthEnd = args.month ? new Date(Date.UTC(Number(args.month.slice(0, 4)), Number(args.month.slice(5, 7)), 1)).toISOString() : undefined
      const options = { limit: args.limit, nextToken: args.cursor, sortOrder: 'desc' as const, dateFrom: monthStart, dateTo: monthEnd, types: args.alert_type ? [args.alert_type] : undefined }
      let result
      if (args.account_id) {
        const { account } = await resolveAccount(args.account_id)
        const commercialId = account.accountId || account.awsStandardAccountID
        if (!commercialId) return toolError('ACCOUNT_ENVIRONMENT_MISSING', 'The account has no Commercial identifier for budget alerts.')
        result = await getAlertsByAccount(commercialId, options)
      } else if (args.month) result = await getAlertsByMonth(args.month, options)
      else if (args.alert_type) result = await getAlertsByType(args.alert_type, options)
      else result = await getAllAlerts(options)
      return toolSuccess(result, `Loaded ${result.count} budget alert(s).`, 'GHOST budget alerts', { nextCursor: result.nextToken })
    }
  })

  read({
    name: 'ghost.users.search', title: 'Search users', description: 'Search Entra users who have access to GHOST-managed AWS accounts.',
    inputSchema: z.object({ query: z.string().min(1), limit: z.number().int().min(1).max(100).default(25) }),
    handler: async args => {
      const event = await createMcpDelegatedGraphEvent(principal)
      const result = await queryEntraUsers(event, [], { userSearch: args.query }, { mode: 'preview', limit: args.limit })
      return toolSuccess(result, `Found ${result.records.length} user access record(s).`, 'Microsoft Graph', {
        warnings: result.truncated ? ['Microsoft Graph page limits prevented an exhaustive user search.'] : undefined
      })
    }
  })

  read({
    name: 'ghost.access.for_account', title: 'Get account access', description: 'List effective IAM Identity Center user/group assignments for one GHOST account using management-account APIs.',
    inputSchema: z.object({ identifier: z.string(), environment: z.enum(['commercial', 'govcloud', 'both']).default('both'), limit: z.number().int().min(1).max(100).default(50), cursor: z.string().optional() }),
    handler: async args => {
      const { account } = await resolveAccount(args.identifier)
      const commercialId = account.accountId || account.awsStandardAccountID
      const govCloudId = account.govCloudAccountId || account.awsGovCloudAccountID
      const targets = [] as Array<{ environment: 'commercial' | 'govcloud'; accountId: string }>
      if (args.environment !== 'govcloud' && commercialId) targets.push({ environment: 'commercial', accountId: commercialId })
      if (args.environment !== 'commercial' && govCloudId) targets.push({ environment: 'govcloud', accountId: govCloudId })
      if (!targets.length) return toolError('ACCOUNT_ENVIRONMENT_MISSING', 'The account has no identifier for the requested IDC environment.')
      const result = await getMcpIdentityCenterAccountAccess(targets, args.limit, args.cursor)
      return toolSuccess(result, `Loaded ${result.records.length} effective IDC assignment(s).`, 'AWS IAM Identity Center Admin', { nextCursor: result.nextCursor })
    }
  })

  read({
    name: 'ghost.access.for_user', title: 'Get user access', description: 'List effective IAM Identity Center account and permission-set assignments for one user using management-account APIs.',
    inputSchema: z.object({ user: z.string().min(1), environment: z.enum(['commercial', 'govcloud', 'both']).default('both') }),
    handler: async args => {
      const userName = args.user.includes('@') ? args.user : `${args.user}@${process.env.ENTRA_DEFAULT_DOMAIN || 'gd-ms.com'}`
      const environments = args.environment === 'both' ? ['commercial', 'govcloud'] as const : [args.environment]
      const result = await getMcpIdentityCenterUserAccess(userName, [...environments])
      return toolSuccess(result, `Loaded ${result.accounts.length} effective IDC account assignment(s).`, 'AWS IAM Identity Center Admin and GHOST account metadata')
    }
  })

  read({
    name: 'ghost.access.explain', title: 'Explain effective AWS access',
    description: 'Explain direct and group-derived IAM Identity Center assignments for the current user, another user, or an account. Entra directory metadata is shown only as non-authoritative comparison context.',
    inputSchema: z.discriminatedUnion('target_type', [
      z.object({ target_type: z.literal('current_user'), environment: z.enum(['commercial', 'govcloud', 'both']).default('both'), include_directory_comparison: z.boolean().default(false) }),
      z.object({ target_type: z.literal('user'), user: z.string().min(1), environment: z.enum(['commercial', 'govcloud', 'both']).default('both'), include_directory_comparison: z.boolean().default(false) }),
      z.object({ target_type: z.literal('account'), account_identifier: z.string().min(1), environment: z.enum(['commercial', 'govcloud', 'both']).default('both'), limit: z.number().int().min(1).max(250).default(100), cursor: z.string().optional() })
    ]),
    getAuditTargetIds: args => args.target_type === 'account' ? [args.account_identifier] : undefined,
    handler: async args => {
      const environments = args.environment === 'both' ? ['commercial', 'govcloud'] as const : [args.environment]
      if (args.target_type === 'account') {
        const { account } = await resolveAccount(args.account_identifier)
        const targets = environments.flatMap(environment => {
          const accountId = environment === 'govcloud' ? account.govCloudAccountId || account.awsGovCloudAccountID : account.accountId || account.awsStandardAccountID
          return accountId ? [{ environment, accountId }] : []
        })
        if (!targets.length) return toolError('ACCOUNT_ENVIRONMENT_MISSING', 'The account has no identifier for the requested IDC environment.')
        const effective = await getMcpIdentityCenterAccountAccess(targets, args.limit, args.cursor)
        return toolSuccess({ account: { name: accountDisplayName(account), commercialAccountId: account.accountId || account.awsStandardAccountID, govCloudAccountId: account.govCloudAccountId || account.awsGovCloudAccountID }, effective, directoryMetadata: { authoritative: false, available: false, reason: 'Account access is derived from IDC assignments; directory groups are user-specific.' } }, 'Explained effective IDC access for the account.', 'AWS IAM Identity Center Admin and Identity Store')
      }
      const userName = args.target_type === 'current_user' ? principal.email : (args.user.includes('@') ? args.user : `${args.user}@${process.env.ENTRA_DEFAULT_DOMAIN || 'gd-ms.com'}`)
      const assignments = await explainMcpIdentityCenterUserAccess(userName, [...environments])
      const directoryGroups = args.target_type === 'current_user' && args.include_directory_comparison
        ? principal.groups.filter((displayName, index) => Boolean(parseAWSGroup({ id: `mcp-${index}`, displayName })))
        : []
      return toolSuccess({ user: userName, assignments, directoryMetadata: { authoritative: false, groups: directoryGroups, available: args.target_type === 'current_user' && args.include_directory_comparison, difference: 'IDC assignments are effective AWS access. Entra groups are directory metadata and may not map to an IDC assignment.' } }, 'Explained direct and group-derived IDC access.', 'AWS IAM Identity Center Admin and Identity Store')
    }
  })

  const documentationSearch = async (args: { query: string; max_results: number; cursor?: string }) => {
    const result = await searchSupportKnowledgeBase(args.query, args.max_results, args.cursor)
    return toolSuccess(result, `Retrieved ${result.results.length} official documentation result(s).`, 'ISGDDocs Amazon Bedrock Knowledge Base', {
      nextCursor: result.nextToken
    })
  }

  read({
    name: 'ghost.docs.search', title: 'Search official GDMS documentation',
    description: 'Mandatory first lookup for internal GDMS/GHOST catalogs and concepts, including golden AMIs, approved images, baselines, standards, architecture, processes, onboarding, and team terminology. Returns cited ISGDDocs knowledge-base passages. Search this before AWS inventory or the downstream agent; no AWS inventory result proves that a documented offering does not exist.',
    inputSchema: z.object({
      query: z.string().min(2).max(2000),
      max_results: z.number().int().min(1).max(10).default(5),
      cursor: z.string().optional()
    }),
    handler: documentationSearch
  })

  read({
    name: 'ghost.docs.answer', title: 'Answer from official GDMS documentation',
    description: 'Generate a concise, cited answer from the GovCloud ISGDDocs knowledge base. Keeps Bedrock follow-up sessions server-side and returns the next session ID for a related question.',
    inputSchema: z.object({
      question: z.string().min(2).max(2_000),
      result_limit: z.number().int().min(1).max(10).default(5),
      kb_session_id: z.string().min(1).optional()
    }),
    handler: async args => toolSuccess(
      await answerSupportKnowledgeBase(args.question, args.result_limit, args.kb_session_id),
      'Generated a grounded answer from official documentation.',
      'ISGDDocs Amazon Bedrock Knowledge Base'
    )
  })

  read({
    name: 'ghost.catalog.golden_amis', title: 'List Golden AMIs',
    description: 'Combine ISGDDocs approved-image guidance with live GovCloud AMIBuilder images. Only GD_Approved=Y and Release=Latest images are live catalog entries; documentation and inventory mismatches are explicit.',
    inputSchema: z.object({
      regions: z.array(z.enum(['us-gov-west-1', 'us-gov-east-1'])).min(1).max(2).default(['us-gov-west-1', 'us-gov-east-1'])
    }),
    handler: async args => {
      const catalog = await getGoldenAmis(args.regions)
      return toolSuccess(catalog, `Loaded ${catalog.entries.length} live Golden AMI catalog entry(ies).`, 'ISGDDocs and GovCloud AMIBuilder')
    }
  })

  read({
    name: 'ghost.outputs.render', title: 'Render GHOST values',
    description: 'Render supplied GHOST data as JSON, Markdown, CSV, or plain text for reuse outside the MCP client.',
    inputSchema: z.object({
      value: z.unknown(),
      format: z.enum(['json', 'markdown', 'csv', 'text']).default('json')
    }),
    handler: async args => {
      const serialized = JSON.stringify(args.value) || ''
      if (serialized.length > 200_000) return toolError('OUTPUT_TOO_LARGE', 'Rendered output is limited to 200 KB. Narrow the source query or use a dataset export.')
      return toolRenderedOutput(renderGhostOutput(args.value, args.format), 'GHOST MCP output renderer')
    }
  })

  const confirmationSchema = z.object({ confirm: z.boolean() })
  const credentialConfirmationSchema = z.object({ confirm: z.boolean() })
  credentials({
    name: 'ghost.credentials.start', title: 'Start AWS Identity Center authorization',
    description: 'Begin IAM Identity Center device authorization for effective account/role discovery and optional short-lived credentials.',
    inputSchema: z.object({ environment: z.enum(['commercial', 'govcloud']).default('govcloud') }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    handler: async args => toolSuccess(
      await beginMcpIdentityCenterAuthorization(principal, args.environment),
      'Open the verification URL and complete IAM Identity Center sign-in. Use the returned session ID only when requesting short-lived credentials.',
      'AWS IAM Identity Center'
    )
  })

  credentials({
    name: 'ghost.credentials.issue', title: 'Issue AWS role credentials',
    description: 'After Identity Center authorization, issue short-lived role credentials only for an account and role assigned to the authenticated user.',
    inputSchema: z.object({
      session_id: z.string().uuid(),
      account_id: z.string().regex(/^\d{12}$/),
      role_name: z.string().min(1).max(128),
      environment: z.enum(['commercial', 'govcloud']).default('govcloud')
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    getAuditTargetIds: args => [args.account_id],
    handler: async (args, context: ServerContext) => {
      if (isCentralAccount(args.account_id)) {
        return toolError('CENTRAL_ACCOUNT_CREDENTIALS_DENIED', 'Direct credential issuance is disabled for organization, master, monitoring, deployment, payer, and proforma accounts.')
      }
      const eligibility = await validateMcpIdentityCenterCredentialRequest(principal, args.session_id, args.account_id, args.role_name)
      if (eligibility.environment !== args.environment) {
        return toolError('IDC_ENVIRONMENT_MISMATCH', `The Identity Center session is for ${eligibility.environment}, not ${args.environment}.`)
      }
      let displayName = args.account_id
      try {
        displayName = accountDisplayName((await resolveAccount(args.account_id)).account)
      } catch {
        // IDC remains authoritative even when an assigned account is absent from GHOST metadata.
      }
      const confirmed = acceptedContent(context.mcpReq.inputResponses, 'confirm_credential_issue', credentialConfirmationSchema)
      const state = context.mcpReq.requestState<{ tool: string; targetId: string }>()
      const targetId = `${args.environment}:${args.account_id}:${args.role_name}`
      if (!confirmed?.confirm || state?.tool !== 'ghost.credentials.issue' || state.targetId !== targetId) {
        return inputRequired({
          inputRequests: {
            confirm_credential_issue: inputRequired.elicit({
              message: `Issue short-lived ${args.environment} credentials for ${displayName} (${args.account_id}) as ${args.role_name}? IAM Identity Center will enforce the assignment.`,
              requestedSchema: credentialConfirmationSchema
            })
          },
          requestState: await confirmationCodec.mint({ tool: 'ghost.credentials.issue', targetId }, context)
        })
      }
      const credential = await issueMcpIdentityCenterCredentials(principal, args.session_id, args.account_id, args.role_name)
      return toolSuccess({
        ...credential,
        localRunner: {
          command: 'npm run ghost:aws -- <service> <operation> [--parameter value]',
          recommendedRegion: credential.region,
          note: 'Set the returned credentials only in the command process environment. The runner uses the AWS SDK and does not require an AWS CLI installation or profile.'
        }
      }, 'Short-lived AWS role credentials issued. Keep them process-local and do not persist or log them.', 'AWS IAM Identity Center')
    }
  })

  read({
    name: 'ghost.resources.search', title: 'Search AWS resources', description: 'Search live AWS Config aggregate inventory across GHOST accounts with resource, region, compliance, and tag filters. This is deployment inventory, not the authoritative source for documented catalogs such as golden AMIs; call ghost.docs.search first for those questions.',
    inputSchema: z.object({
      account: flexibleStringListSchema,
      account_identifiers: flexibleStringListSchema,
      environment: flexibleEnvironmentSchema,
      resource_type: flexibleStringListSchema,
      resource_types: flexibleStringListSchema,
      region: flexibleStringListSchema,
      regions: flexibleStringListSchema,
      query: z.string().optional(),
      resource_id: z.string().optional(),
      resource_name: z.string().optional(),
      tags: z.record(z.string().min(1).max(128), z.string().max(256)).refine(value => Object.keys(value).length <= 20, 'At most 20 tag filters are allowed').optional(),
      compliance_status: z.array(z.enum(['COMPLIANT', 'NON_COMPLIANT', 'NOT_APPLICABLE', 'INSUFFICIENT_DATA'])).max(4).optional(),
      compliance_only: z.boolean().default(false),
      limit: flexibleIntegerSchema
    }),
    getAuditTargetIds: args => stringList(accountInput(args)),
    handler: async args => {
      const scope = await resolveOperationalScope(accountInput(args), args.environment)
      const limit = boundedInteger(args.limit, { name: 'limit', minimum: 1, maximum: 100, fallback: 25 })
      const filters = {
        resourceTypes: resourceTypes(args.resource_type ?? args.resource_types),
        regions: stringList(args.region ?? args.regions),
        resourceId: args.resource_id,
        resourceName: args.resource_name || args.query,
        tags: args.tags,
        complianceStatus: args.compliance_status,
        complianceOnly: args.compliance_only
      }
      const result = await queryConfigResources(scope.operationalAccountIds, filters, { mode: 'preview', limit, environment: scope.environment })
      const guidance = scope.accounts.length === 1
        ? await advancedQueryGuidance(principal, scope.accounts[0]!, `npm run ghost:aws -- config list-discovered-resources --resource-type ${filters.resourceTypes[0] || '<AWS::Resource::Type>'} --region ${scope.environment === 'govcloud' ? 'us-gov-west-1' : 'us-east-1'} --output json`)
        : []
      return toolSuccess(result, `Loaded ${result.records.length} AWS resource(s).`, 'AWS Config', {
        warnings: result.hasMore ? ['Results are bounded. Narrow the filters or use a dataset export for complete inventory.'] : undefined,
        resolvedScope: scopeMetadata(scope),
        appliedFilters: filters,
        guidance
      })
    }
  })

  const instanceSearchSchema = z.object({
    account: flexibleStringListSchema,
    account_identifiers: flexibleStringListSchema,
    environment: flexibleEnvironmentSchema,
    query: z.string().optional(),
    instance_id: z.string().optional(),
    state: flexibleStringListSchema,
    region: flexibleStringListSchema,
    regions: flexibleStringListSchema,
    limit: flexibleIntegerSchema
  })

  const searchInstances = async (args: any) => {
    const scope = await resolveOperationalScope(accountInput(args), args.environment, { requireAccount: true })
    const limit = boundedInteger(args.limit, { name: 'limit', minimum: 1, maximum: 100, fallback: 25 })
    const states = enumList(args.state, ['pending', 'running', 'shutting-down', 'terminated', 'stopping', 'stopped'] as const, 'state')
    const regions = stringList(args.region ?? args.regions)
    const result = await queryConfigResources(scope.operationalAccountIds, {
      resourceTypes: ['AWS::EC2::Instance'],
      regions,
      resourceId: args.instance_id,
      resourceName: args.instance_id ? undefined : args.query,
      instanceStates: states
    }, { mode: 'preview', limit, environment: scope.environment })
    const records = result.records.map(resource => {
      const configuration = resource.configuration || {}
      return {
        instanceId: resource.resourceId,
        name: resource.tags?.Name || resource.resourceName,
        state: configuration.state?.name || 'unknown',
        instanceType: configuration.instanceType,
        region: resource.region,
        privateIpAddress: configuration.privateIpAddress,
        publicIpAddress: configuration.publicIpAddress,
        configurationItemCaptureTime: resource.configurationItemCaptureTime,
        accountId: resource.accountId,
        accountName: resource.accountName
      }
    })
    const guidance = await advancedQueryGuidance(principal, scope.accounts[0]!, `npm run ghost:aws -- ec2 describe-instances --region ${regions[0] || (scope.environment === 'govcloud' ? 'us-gov-west-1' : 'us-east-1')} --output json`)
    return toolSuccess({ records, hasMore: result.hasMore || records.length >= limit }, `Loaded ${records.length} EC2 instance(s).`, 'AWS Config', {
      warnings: result.hasMore ? ['Results are bounded. Narrow the account, region, state, or name filters for complete inventory.'] : undefined,
      resolvedScope: scopeMetadata(scope),
      appliedFilters: { query: args.query, instanceId: args.instance_id, states, regions, limit },
      guidance
    })
  }

  read({
    name: 'ghost.instances.search', title: 'Search EC2 instances',
    description: 'Use this to list or find current EC2 instances in one GHOST account. Accepts account names, aliases, emails, request IDs, Commercial IDs, or GovCloud IDs.',
    inputSchema: instanceSearchSchema,
    getAuditTargetIds: args => stringList(accountInput(args)),
    handler: searchInstances
  })

  read({
    name: 'ghost.instances.utilization', title: 'Get EC2 utilization analysis', description: 'Return the latest persisted GHOST utilization summary and bounded instance classifications for an account.',
    inputSchema: z.object({ account_id: z.string(), environment: operationalEnvironmentSchema, classification: z.enum(['over-provisioned', 'under-provisioned', 'optimized', 'no-data']).optional(), limit: z.number().int().min(1).max(100).default(25) }),
    getAuditTargetIds: args => [args.account_id],
    handler: async args => {
      const { account } = await resolveAccount(args.account_id)
      const accountId = args.environment === 'govcloud' ? account.govCloudAccountId || account.awsGovCloudAccountID : account.accountId || account.awsStandardAccountID
      if (!accountId) return toolError('ACCOUNT_ENVIRONMENT_MISSING', `The account has no ${args.environment} identifier.`)
      const latest = await getLatestAnalysis(accountId, args.environment)
      if (!latest) return toolError('UTILIZATION_NOT_FOUND', 'No completed utilization analysis is available for this account.')
      const classifications = await getInstanceClassifications(latest.jobId, { classification: args.classification, limit: args.limit })
      return toolSuccess({ latest, classifications }, 'Utilization analysis loaded.', 'GHOST utilization analysis')
    }
  })

  read({
    name: 'ghost.instances.health', title: 'Get EC2 instance health', description: 'Return bounded patch, security, vulnerability, alarm, and inventory evidence for one EC2 instance.',
    inputSchema: z.object({
      account_identifier: z.string().min(1),
      instance_id: z.string().regex(/^i-[0-9a-f]{8,17}$/),
      environment: operationalEnvironmentSchema,
      region: z.string().regex(/^(?:[a-z]{2}(?:-gov)?-[a-z]+-\d)$/).optional(),
      lookback_days: z.number().int().min(1).max(90).default(30),
      limit: z.number().int().min(1).max(25).default(10)
    }),
    getAuditTargetIds: args => [args.account_identifier],
    handler: async args => {
      const { account } = await resolveAccount(args.account_identifier)
      const result = await buildInstanceHealth({ instanceId: args.instance_id, account, environment: args.environment, region: args.region, lookbackDays: args.lookback_days, limit: args.limit })
      return toolSuccess(result, `Instance health is ${result.healthStatus} with score ${result.healthScore}.`, 'AWS Config, Systems Manager, Security Hub, Inspector, and CloudWatch', {
        warnings: result.partialData ? ['One or more instance health domains were unavailable.'] : undefined
      })
    }
  })

  read({
    name: 'ghost.security.summary', title: 'Get security summary', description: 'Return a 90-day Security Hub and Inspector posture summary, including vulnerability findings and Security Hub control results. This is distinct from AWS Config rule compliance and SSM patch compliance.',
    inputSchema: z.object({ account_id: z.string().optional(), environment: operationalEnvironmentSchema }),
    getAuditTargetIds: args => args.account_id ? [args.account_id] : undefined,
    handler: async args => {
      const account = args.account_id ? (await resolveAccount(args.account_id)).account : undefined
      const operationalId = account ? args.environment === 'govcloud' ? account.govCloudAccountId || account.awsGovCloudAccountID : account.accountId || account.awsStandardAccountID : undefined
      if (account && !operationalId) return toolError('ACCOUNT_ENVIRONMENT_MISSING', `The account has no ${args.environment} identifier.`)
      const result = args.account_id
        ? await buildAccountSecurityViaAthena(operationalId!, accountDisplayName(account))
        : await loadSecuritySummary() || await buildSecuritySummaryViaAthena()
      return toolSuccess(result, args.account_id ? 'Account security summary loaded.' : 'Organization security summary loaded.', 'AWS Security Hub and Athena')
    }
  })

  read({
    name: 'ghost.compliance.summary', title: 'Get compliance summary',
    description: 'Return separate Security Hub control, Inspector vulnerability, Config rule, and SSM patch/scan domains with evidence, timestamps, coverage gaps, and independent healthy/warning/critical/unknown statuses. Never returns an overall compliance percentage.',
    inputSchema: z.object({
      account_identifier: z.string().min(1),
      environment: operationalEnvironmentSchema,
      detail_level: z.enum(['summary', 'detailed']).default('summary')
    }),
    getAuditTargetIds: args => [args.account_identifier],
    handler: async args => {
      const { account } = await resolveAccount(args.account_identifier)
      const operationalId = args.environment === 'govcloud'
        ? account.govCloudAccountId || account.awsGovCloudAccountID
        : account.accountId || account.awsStandardAccountID
      if (!operationalId) return toolError('ACCOUNT_ENVIRONMENT_MISSING', `The account has no ${args.environment} identifier.`)
      const domains = await collectCompliance(operationalId, args.environment, account.accountId || account.awsStandardAccountID, args.detail_level)
      const response = {
        account: { name: accountDisplayName(account), commercialAccountId: account.accountId || account.awsStandardAccountID, govCloudAccountId: account.govCloudAccountId || account.awsGovCloudAccountID },
        environment: args.environment,
        ...domains,
        coverageGaps: Object.entries(domains).flatMap(([domain, value]) => value.coverageGaps.map(gap => ({ domain, gap }))),
        detailLevel: args.detail_level
      }
      return toolSuccess(response, `Loaded separate compliance evidence for ${accountDisplayName(account)}.`, 'AWS Security Hub, Inspector, Config, and Systems Manager')
    }
  })

  read({
    name: 'ghost.security.findings', title: 'Query security findings', description: 'Query a bounded subset of current Security Hub findings across selected accounts. Do not treat the returned page count as the account-wide finding total; use ghost.security.summary for that.',
    inputSchema: z.object({ account_identifiers: accountIdentifiersSchema, severities: flexibleStringListSchema, statuses: flexibleStringListSchema, lookback_days: flexibleIntegerSchema, limit: flexibleIntegerSchema }),
    getAuditTargetIds: args => args.account_identifiers,
    handler: async args => {
      const severities = enumList(args.severities, ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFORMATIONAL'] as const, 'severities')
      const statuses = enumList(args.statuses, ['NEW', 'NOTIFIED', 'RESOLVED', 'SUPPRESSED'] as const, 'statuses')
      const lookbackDays = boundedInteger(args.lookback_days, { name: 'lookback_days', minimum: 1, maximum: 90, fallback: 30 })
      const limit = boundedInteger(args.limit, { name: 'limit', minimum: 1, maximum: 100, fallback: 25 })
      const result = await querySecurityHubFindings(await commercialIds(args.account_identifiers), { severities, statuses, lookbackDays }, { mode: 'preview', limit })
      return toolSuccess(result, `Loaded ${result.records.length} security finding(s).`, 'AWS Security Hub')
    }
  })

  const auditSearchSchema = z.object({
    account: flexibleStringListSchema,
    account_identifiers: flexibleStringListSchema,
    environment: flexibleEnvironmentSchema,
    event_name: flexibleStringListSchema,
    event_names: flexibleStringListSchema,
    service: flexibleStringListSchema,
    event_sources: flexibleStringListSchema,
    user: flexibleStringListSchema,
    user_identities: flexibleStringListSchema,
    region: flexibleStringListSchema,
    regions: flexibleStringListSchema,
    errors_only: flexibleBooleanSchema,
    write_only: flexibleBooleanSchema,
    write_events_only: flexibleBooleanSchema,
    lookback_days: flexibleIntegerSchema,
    limit: flexibleIntegerSchema,
    cursor: z.string().optional()
  })
  const searchAudit = async (args: any) => {
    const scope = await resolveOperationalScope(accountInput(args), args.environment, { requireAccount: true })
    const lookbackDays = boundedInteger(args.lookback_days, { name: 'lookback_days', minimum: 1, maximum: 90, fallback: 7 })
    const limit = boundedInteger(args.limit, { name: 'limit', minimum: 1, maximum: 100, fallback: 25 })
    const filters = {
      eventNames: stringList(args.event_name ?? args.event_names),
      eventSources: stringList(args.service ?? args.event_sources),
      userIdentities: stringList(args.user ?? args.user_identities),
      regions: stringList(args.region ?? args.regions),
      errorsOnly: booleanValue(args.errors_only),
      writeEventsOnly: booleanValue(args.write_only ?? args.write_events_only),
      lookbackDays
    }
    const result = await queryCloudTrailEvents(scope.operationalAccountIds, filters, {
      mode: 'preview', environment: scope.environment, limit, cursor: args.cursor
    })
    return toolSuccess(result, `Loaded ${result.records.length} organization CloudTrail event(s).`, 'AWS CloudWatch Logs organization CloudTrail', {
      warnings: result.hasMore ? ['More matching events are available; use the returned cursor to continue.'] : undefined,
      nextCursor: result.nextCursor,
      resolvedScope: scopeMetadata(scope),
      appliedFilters: filters
    })
  }

  read({
    name: 'ghost.audit.search', title: 'Search organization CloudTrail logs',
    description: 'Use this to search account-scoped CloudTrail events in the organization trail CloudWatch log group. Accepts friendly account references and scalar or list filters.',
    inputSchema: auditSearchSchema,
    getAuditTargetIds: args => stringList(accountInput(args)),
    handler: searchAudit
  })

  read({
    name: 'ghost.support.patch_compliance', title: 'Get patch compliance', description: 'Get SSM patch compliance for an account or a specific EC2 instance. This measures managed-instance patch state only, not Security Hub or AWS Config control compliance.',
    inputSchema: z.object({ account_id: z.string(), instance_id: z.string().regex(/^i-[0-9a-f]{8,17}$/).optional(), environment: operationalEnvironmentSchema, region: z.string().regex(/^(?:[a-z]{2}(?:-gov)?-[a-z]+-\d)$/).optional() }),
    getAuditTargetIds: args => [args.account_id],
    handler: async args => {
      const { account } = await resolveAccount(args.account_id)
      const accountId = args.environment === 'govcloud' ? account.govCloudAccountId || account.awsGovCloudAccountID : account.accountId || account.awsStandardAccountID
      if (!accountId) return toolError('ACCOUNT_ENVIRONMENT_MISSING', `The account has no ${args.environment} identifier.`)
      return toolSuccess(args.instance_id ? await getInstancePatchStatus(args.instance_id, accountId, args.environment, args.region) : await getAccountPatchCompliance(accountId, args.environment, args.region), 'Patch compliance loaded.', 'AWS Systems Manager')
    }
  })

  read({
    name: 'ghost.security.remediation_plan', title: 'Build security remediation plan',
    description: 'Deduplicate active Inspector findings into read-only remediation groups with deployment-state evidence and fixed-version guidance. Does not create tickets or mutate AWS findings.',
    inputSchema: z.object({ account_identifier: z.string().min(1), environment: operationalEnvironmentSchema }),
    getAuditTargetIds: args => [args.account_identifier],
    handler: async args => {
      const { account } = await resolveAccount(args.account_identifier)
      const accountId = args.environment === 'govcloud' ? account.govCloudAccountId || account.awsGovCloudAccountID : account.accountId || account.awsStandardAccountID
      if (!accountId) return toolError('ACCOUNT_ENVIRONMENT_MISSING', `The account has no ${args.environment} identifier.`)
      const plan = await createRemediationPlan(accountId, args.environment)
      return toolSuccess(plan, `Built ${plan.groups.length} remediation group(s) without making changes.`, 'AWS Inspector, Config, and pipeline evidence')
    }
  })

  read({
    name: 'ghost.account.health', title: 'Get account health',
    description: 'Return independent security, controls, Config, patching, proforma budget, ownership, and pipeline health domains with evidence and remediation guidance. Never returns a composite score.',
    inputSchema: z.object({ account_identifier: z.string().min(1), environment: operationalEnvironmentSchema }),
    getAuditTargetIds: args => [args.account_identifier],
    handler: async args => {
      const { account } = await resolveAccount(args.account_identifier)
      const health = await buildAccountHealth(account, args.environment)
      return toolSuccess(health, `Loaded independent health domains for ${accountDisplayName(account)}.`, 'GHOST authoritative account health sources')
    }
  })

  read({
    name: 'ghost.s3.analyze_policy', title: 'Analyze an S3 policy', description: 'Analyze a supplied S3 bucket policy for public and cross-account access risks.',
    inputSchema: z.object({ bucket_name: z.string(), bucket_account_id: z.string().regex(/^\d{12}$/), policy: z.record(z.string(), z.unknown()).nullable() }),
    handler: async args => JSON.stringify(args.policy || {}).length > 100_000
      ? toolError('POLICY_TOO_LARGE', 'S3 policy input is limited to 100 KB.')
      : toolSuccess(analyzeBucketPolicy(args.bucket_name, args.policy as any, args.bucket_account_id), 'Bucket policy analysis complete.', 'GHOST policy analyzer')
  })

  read({
    name: 'ghost.pipelines.overview', title: 'Get pipeline overview', description: 'Return organization-wide GitLab/Terraform pipeline summary and recent timeline.',
    inputSchema: z.object({ days: z.number().int().min(1).max(90).default(30), limit: z.number().int().min(1).max(100).default(25) }),
    handler: args => searchPipelines({ ...args, environment: 'govcloud' })
  })

  read({
    name: 'ghost.pipelines.search', title: 'Search pipeline activity',
    description: 'Use this for pipeline overview, account runs, or Terraform resource search. Account names and either AWS account ID are accepted.',
    inputSchema: z.object({
      account: flexibleStringListSchema,
      environment: flexibleEnvironmentSchema,
      mode: z.enum(['auto', 'overview', 'account_runs', 'resource_search', 'health', 'drift']).default('auto'),
      query: z.string().optional(),
      days: flexibleIntegerSchema,
      limit: flexibleIntegerSchema
    }),
    getAuditTargetIds: args => stringList(args.account),
    handler: searchPipelines
  })

  read({
    name: 'ghost.pipelines.get_run', title: 'Get pipeline run', description: 'Return a pipeline run with account plans, resource changes, and errors.',
    inputSchema: z.object({ pipeline_id: z.string().regex(/^\d+$/, 'Pipeline ID must contain only digits') }),
    handler: async args => {
      const result = await getPipelineByIdWithDetails(args.pipeline_id, 'govcloud')
      return result.pipeline ? toolSuccess(result, 'Pipeline details loaded.', 'Athena pipeline telemetry') : toolError('PIPELINE_NOT_FOUND', 'Pipeline run not found.')
    }
  })

  read({
    name: 'ghost.ai.usage', title: 'Get organization AI usage', description: 'Return Bedrock and AWS AI adoption, invocation, token, latency, and cost metrics.',
    inputSchema: z.object({ period: z.enum(['last7days', 'last30days', 'last90days', 'thisMonth', 'thisQuarter', 'ytd', 'last12months']).default('last30days'), environment: z.enum(['all', 'commercial', 'govcloud']).default('all'), account_identifiers: accountIdentifiersSchema, group_by: z.enum(['enclave', 'account', 'environment', 'provider', 'service', 'project', 'model', 'region', 'day']).default('enclave'), cost_basis: z.enum(['billable', 'proforma']).default('proforma') }),
    handler: async args => toolSuccess(await queryAIUsage({ period: args.period, environment: args.environment, accountIds: await commercialIds(args.account_identifiers), groupBy: args.group_by, costBasis: args.cost_basis }), 'AI usage metrics loaded.', 'GHOST AI usage facts')
  })

  ai({
    name: 'ghost.ai.insight', title: 'Generate a GHOST insight', description: 'Generate a bounded AWS account, cost, resource, or security insight from supplied GHOST context.',
    inputSchema: z.object({ question: z.string().min(1).max(4000), context: z.record(z.string(), z.unknown()).default({}) }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    handler: async args => {
      if (Buffer.byteLength(JSON.stringify(args.context), 'utf8') > 64_000) return toolError('CONTEXT_TOO_LARGE', 'AI context is limited to 64 KB.')
      const response = await invokeBedrock({ prompt: args.question, context: args.context, model: 'claude-sonnet', maxTokens: 1500, temperature: 0.3, systemPrompt: 'You are a GHOST AWS analyst. Use only the provided context, clearly identify missing data, and return concise actionable findings.' })
      if (!response.success) return toolError(response.error?.code || 'AI_ERROR', response.error?.message || 'Insight generation failed', response.error?.retryable)
      return toolSuccess({ insight: response.content, model: response.model, inputTokens: response.inputTokens, outputTokens: response.outputTokens }, 'GHOST insight generated.', 'AWS Bedrock')
    }
  })

  ai({
    name: 'ghost.ai.troubleshoot', title: 'Generate a troubleshooting plan', description: 'Generate a bounded AWS troubleshooting plan using GHOST diagnostic capabilities.',
    inputSchema: z.object({ problem: z.string().min(1).max(2000), account_id: z.string().optional(), environment: operationalEnvironmentSchema, service: z.string().optional() }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    handler: async args => {
      const evidence = args.account_id ? await buildAccountHealth((await resolveAccount(args.account_id)).account, args.environment) : undefined
      const response = await invokeBedrock({ prompt: `Problem: ${args.problem}\nAccount: ${args.account_id || 'not specified'}\nEnvironment: ${args.environment}\nService: ${args.service || 'not specified'}\nReturn a prioritized diagnostic plan and do not claim that any action was executed.`, context: evidence ? { accountHealth: evidence } : undefined, model: 'claude-sonnet', maxTokens: 1800, temperature: 0.3 })
      if (!response.success) return toolError(response.error?.code || 'AI_ERROR', response.error?.message || 'Troubleshooting generation failed')
      return toolSuccess({ plan: response.content, model: response.model, grounded: Boolean(evidence), evidence: evidence ? { account: evidence.account, environment: evidence.environment } : undefined }, 'Troubleshooting plan generated.', evidence ? 'AWS Bedrock and GHOST account health' : 'AWS Bedrock')
    }
  })


  collaborate({
    name: 'ghost.preferences.get', title: 'Get my preferences', description: 'Return the authenticated user’s GHOST preferences.',
    inputSchema: z.object({}), annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    handler: async () => toolSuccess(await getUserPreferences(principal.email), 'Preferences loaded.', 'GHOST user preferences')
  })

  collaborate({
    name: 'ghost.accounts.personal_context', title: 'Get my favorite and recent accounts',
    description: 'Return the authenticated user’s saved favorite accounts and recently viewed accounts, resolved to current GHOST account metadata.',
    inputSchema: z.object({ limit: z.number().int().min(1).max(100).default(50) }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    handler: async args => {
      const [preferences, accounts] = await Promise.all([
        getUserPreferences(principal.email),
        getAllAccountsUnified(true)
      ])
      const context = buildPersonalAccountContext(preferences, accounts, args.limit)
      return toolSuccess(context, `Loaded ${context.favorites.total} favorite and ${context.recentAccounts.total} recently viewed account(s).`, 'GHOST user preferences and account metadata', {
        warnings: context.favorites.truncated || context.recentAccounts.truncated
          ? [`Only the first ${args.limit} account(s) from each list are included.`]
          : undefined
      })
    }
  })

  collaborate({
    name: 'ghost.notifications.list', title: 'List my notifications',
    description: 'List the authenticated user’s GHOST notifications by category or read status.',
    inputSchema: z.object({
      categories: z.array(notificationCategorySchema).max(12).optional(),
      status: notificationStatusSchema.optional(),
      limit: z.number().int().min(1).max(50).default(20),
      cursor: z.string().optional()
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    handler: async args => {
      const { getUserNotifications } = await import('../../utils/notification-service')
      const notifications = await getUserNotifications(principal.email, {
        category: args.categories as NotificationCategory[] | undefined,
        status: args.status as NotificationStatus | undefined,
        limit: args.limit,
        lastKey: args.cursor
      })
      return toolSuccess(notifications, `Loaded ${notifications.notifications.length} notification(s).`, 'GHOST user notification inbox', {
        nextCursor: notifications.nextKey || undefined
      })
    }
  })

  collaborate({
    name: 'ghost.notifications.action', title: 'Update my notifications', description: 'Mark one notification read, archive it, or mute/unmute personal notifications.',
    inputSchema: z.discriminatedUnion('action', [
      z.object({ action: z.literal('mark_read'), notification_id: z.string().min(1), idempotency_key: idempotencyKeySchema() }),
      z.object({ action: z.literal('archive'), notification_id: z.string().min(1), idempotency_key: idempotencyKeySchema() }),
      z.object({ action: z.literal('mute'), duration: z.enum(['1h', '4h', '24h']).default('1h'), idempotency_key: idempotencyKeySchema() }),
      z.object({ action: z.literal('unmute'), idempotency_key: idempotencyKeySchema() })
    ]),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    handler: async args => {
      const request = { action: args.action, notificationId: 'notification_id' in args ? args.notification_id : undefined, duration: 'duration' in args ? args.duration : undefined }
      const result = await runIdempotent(principal, 'ghost.notifications.action', args.idempotency_key, request, async () => {
        if (args.action === 'mark_read' || args.action === 'archive') {
          const updated = await setNotificationStatus(principal.email, args.notification_id, args.action === 'mark_read' ? 'read' : 'archived')
          if (!updated) throw Object.assign(new Error('Notification not found.'), { code: 'NOTIFICATION_NOT_FOUND' })
          return { action: args.action, notificationId: args.notification_id, status: args.action === 'mark_read' ? 'read' : 'archived' }
        }
        const mute = await setNotificationMute(principal.email, { duration: args.action === 'mute' ? args.duration : undefined, unmute: args.action === 'unmute' })
        return { action: args.action, ...mute }
      }, value => value, async reference => reference)
      return toolSuccess(result.value, result.replayed ? 'Existing notification action returned.' : 'Notification action completed.', 'GHOST user notification inbox')
    }
  })

  collaborate({
    name: 'ghost.evidence.create', title: 'Create evidence bundle',
    description: 'Explicitly rerun authoritative account-health queries and create a private 90-day JSON and Markdown evidence bundle. It never captures credentials or delegated tokens.',
    inputSchema: z.object({ account_identifier: z.string().min(1), title: z.string().min(1).max(160), selected_domains: z.array(z.enum(EVIDENCE_DOMAINS)).min(1), lookback_days: z.number().int().min(1).max(90).default(30), environment: operationalEnvironmentSchema, idempotency_key: idempotencyKeySchema() }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    getAuditTargetIds: args => [args.account_identifier],
    handler: async args => {
      const { account } = await resolveAccount(args.account_identifier)
      const input = { ownerSubject: principal.subject, accountIdentifier: args.account_identifier, title: args.title, selectedDomains: args.selected_domains, lookbackDays: args.lookback_days, account, environment: args.environment }
      const result = await runIdempotent(principal, 'ghost.evidence.create', args.idempotency_key, { accountIdentifier: args.account_identifier, title: args.title, selectedDomains: args.selected_domains, lookbackDays: args.lookback_days, environment: args.environment },
        () => createEvidenceBundle(input), value => ({ bundleId: value.bundleId }), async reference => {
          const bundle = await getEvidenceBundle(reference.bundleId, principal.subject)
          if (!bundle) throw new Error('Idempotent evidence bundle no longer exists.')
          return bundle
        })
      return toolSuccess(result.value, result.replayed ? 'Existing evidence bundle returned for this idempotency key.' : 'Created a private evidence bundle with a 90-day retention period.', 'GHOST private evidence storage')
    }
  })

  collaborate({
    name: 'ghost.evidence.list', title: 'List my evidence bundles', description: 'List only evidence bundles owned by the authenticated MCP user.',
    inputSchema: z.object({ limit: z.number().int().min(1).max(100).default(50) }), annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    handler: async args => toolSuccess(await listEvidenceBundles(principal.subject, args.limit), 'Evidence bundles loaded.', 'GHOST private evidence storage')
  })

  collaborate({
    name: 'ghost.evidence.get', title: 'Get my evidence bundle', description: 'Get metadata and JSON evidence for one authenticated-user-owned evidence bundle.',
    inputSchema: z.object({ bundle_id: z.string().uuid(), include_content: z.boolean().default(true) }), annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    handler: async args => {
      const bundle = await getEvidenceBundle(args.bundle_id, principal.subject, args.include_content)
      return bundle ? toolSuccess(bundle, 'Evidence bundle loaded.', 'GHOST private evidence storage') : toolError('EVIDENCE_NOT_FOUND', 'Evidence bundle not found.')
    }
  })

  collaborate({
    name: 'ghost.evidence.download', title: 'Download my evidence bundle', description: 'Create a five-minute private download URL for a JSON or Markdown evidence bundle.',
    inputSchema: z.object({ bundle_id: z.string().uuid(), format: z.enum(['json', 'markdown']).default('json') }), annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    handler: async args => {
      const result = await evidenceDownloadUrl(args.bundle_id, principal.subject, args.format)
      return result ? toolSuccess(result, 'Evidence download URL created.', 'GHOST private evidence storage') : toolError('EVIDENCE_NOT_FOUND', 'Evidence bundle not found.')
    }
  })

  collaborate({
    name: 'ghost.evidence.delete', title: 'Delete my evidence bundle', description: 'Permanently delete an authenticated-user-owned evidence bundle after explicit confirmation.',
    inputSchema: z.object({ bundle_id: z.string().uuid() }), annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    handler: async (args, context: ServerContext) => {
      const confirmed = acceptedContent(context.mcpReq.inputResponses, 'confirm_evidence_delete', confirmationSchema)
      const state = context.mcpReq.requestState<{ tool: string; targetId: string }>()
      if (!confirmed?.confirm || state?.tool !== 'ghost.evidence.delete' || state.targetId !== args.bundle_id) {
        return inputRequired({ inputRequests: { confirm_evidence_delete: inputRequired.elicit({ message: `Permanently delete evidence bundle ${args.bundle_id}?`, requestedSchema: confirmationSchema }) }, requestState: await confirmationCodec.mint({ tool: 'ghost.evidence.delete', targetId: args.bundle_id }, context) })
      }
      return await deleteEvidenceBundle(args.bundle_id, principal.subject)
        ? toolSuccess({ deleted: true, bundleId: args.bundle_id }, 'Evidence bundle deleted.', 'GHOST private evidence storage')
        : toolError('EVIDENCE_NOT_FOUND', 'Evidence bundle not found.')
    }
  })

  collaborate({
    name: 'ghost.preferences.update', title: 'Update my preferences', description: 'Update the authenticated user’s timezone, favorite accounts, or recent accounts using validated values.',
    inputSchema: z.object({
      timezone: z.string().min(1).max(64).optional(),
      favorite_accounts: z.array(z.string().min(1).max(256)).max(100).optional(),
      recent_accounts: z.array(z.object({ account: z.string().min(1).max(256), viewed_at: z.string().datetime().optional() })).max(10).optional()
    }).refine(value => value.timezone !== undefined || value.favorite_accounts !== undefined || value.recent_accounts !== undefined, 'Provide at least one preference update.'),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    handler: async args => {
      if (args.timezone) {
        try {
          new Intl.DateTimeFormat('en-US', { timeZone: args.timezone }).format()
        } catch {
          return toolError('INVALID_TIMEZONE', 'timezone must be a valid IANA timezone name.')
        }
      }
      const preferences: Record<string, unknown> = {}
      if (args.favorite_accounts) preferences.favoriteAccounts = await Promise.all(args.favorite_accounts.map(async identifier => {
        const account = (await resolveAccount(identifier)).account
        return account.accountId || account.awsStandardAccountID || account.govCloudAccountId || account.awsGovCloudAccountID
      }))
      if (args.recent_accounts) preferences.recentlyViewedAccounts = await Promise.all(args.recent_accounts.map(async item => {
        const account = (await resolveAccount(item.account)).account
        return { accountId: account.accountId || account.awsStandardAccountID || account.govCloudAccountId || account.awsGovCloudAccountID, viewedAt: item.viewed_at || new Date().toISOString() }
      }))
      const result = await updateUserPreferences(principal.email, { timezone: args.timezone, preferences })
      return toolSuccess(result, 'Preferences updated.', 'GHOST user preferences')
    }
  })


  collaborate({
    name: 'ghost.reports.list', title: 'List my reports and exports', description: 'List the authenticated user’s scheduled reports and recent asynchronous dataset exports.',
    inputSchema: z.object({
      status: z.enum(['active', 'paused']).optional(),
      export_status: z.enum(['queued', 'running', 'complete', 'error', 'canceled']).optional(),
      limit: z.number().int().min(1).max(100).default(25),
      report_cursor: z.string().optional(),
      export_cursor: z.string().optional()
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    handler: async args => {
      const [reports, exports] = await Promise.all([
        listUserReports(principal.email, args.status, args.limit, args.report_cursor),
        queryDatasetExportJobs(principal.email, { status: args.export_status, limit: args.limit, cursor: args.export_cursor })
      ])
      return toolSuccess({ reports: reports.reports, exports: exports.jobs, nextReportCursor: reports.nextCursor, nextExportCursor: exports.nextCursor }, 'Reports and exports loaded.', 'GHOST report storage')
    }
  })

  collaborate({
    name: 'ghost.reports.start_export', title: 'Start a dataset export', description: 'Queue a user-owned Config, Security Hub, CloudTrail, or Entra dataset export.',
    inputSchema: z.object({ report_config: z.record(z.string(), z.unknown()), idempotency_key: idempotencyKeySchema() }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    handler: async args => {
      const config = args.report_config as unknown as DatasetReportConfig
      const errors = getDatasetReportConfigErrors(config)
      if (errors.length) return toolError('INVALID_REPORT_CONFIG', errors.join('; '))
      const result = await runIdempotent(principal, 'ghost.reports.start_export', args.idempotency_key, args.report_config, () => createDatasetExportJob(principal.email, config),
        value => ({ jobId: value.jobId }), async reference => {
          const job = await getDatasetExportJob(reference.jobId, principal.email)
          if (!job) throw new Error('Idempotent export job no longer exists.')
          return job
        })
      return toolSuccess(result.value, result.replayed ? 'Existing export returned for this idempotency key.' : 'Dataset export queued.', 'GHOST dataset export queue')
    }
  })

  collaborate({
    name: 'ghost.reports.export_status', title: 'Get export status', description: 'Get one authenticated-user-owned dataset export job.',
    inputSchema: z.object({ job_id: z.string().uuid() }), annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    handler: async args => {
      const job = await getDatasetExportJob(args.job_id, principal.email)
      return job ? toolSuccess(job, 'Dataset export status loaded.', 'GHOST dataset export queue') : toolError('EXPORT_NOT_FOUND', 'Export job not found.')
    }
  })

  collaborate({
    name: 'ghost.reports.cancel_export', title: 'Cancel a dataset export', description: 'Cancel an authenticated-user-owned queued or running dataset export.',
    inputSchema: z.object({ job_id: z.string().uuid(), idempotency_key: idempotencyKeySchema() }),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    handler: async args => {
      const result = await runIdempotent(principal, 'ghost.reports.cancel_export', args.idempotency_key, { jobId: args.job_id }, async () => {
        const job = await getDatasetExportJob(args.job_id, principal.email)
        if (!job) throw Object.assign(new Error('Export job not found.'), { code: 'EXPORT_NOT_FOUND' })
        if (!await cancelDatasetExportJob(args.job_id, principal.email)) throw Object.assign(new Error(`Export cannot be canceled from status ${job.status}.`), { code: 'EXPORT_NOT_CANCELABLE' })
        return { jobId: args.job_id, canceled: true, previousStatus: job.status }
      }, value => value, async reference => reference)
      return toolSuccess(result.value, result.replayed ? 'Existing cancellation result returned.' : 'Dataset export canceled.', 'GHOST dataset export queue')
    }
  })

  collaborate({
    name: 'ghost.reports.download_url', title: 'Get export download URL', description: 'Create a five-minute download URL for a completed authenticated-user-owned export.',
    inputSchema: z.object({ job_id: z.string().uuid() }), annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    handler: async args => {
      const job = await getDatasetExportJob(args.job_id, principal.email)
      if (!job?.s3Key || job.status !== 'complete') return toolError('EXPORT_NOT_READY', 'Export is not complete or was not found.')
      return toolSuccess({ url: await getPresignedDownloadUrl({ key: job.s3Key, expiresInSeconds: 300 }), expiresInSeconds: 300 }, 'Download URL created.', 'GHOST S3 report storage')
    }
  })

}
