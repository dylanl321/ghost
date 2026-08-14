import {
  acceptedContent,
  inputRequired,
  type McpServer,
  type RequestStateCodec,
  type ServerContext
} from '@modelcontextprotocol/server'
import * as z from 'zod-v4'
import { getPresignedDownloadUrl } from '../../utils/s3-storage'
import { getAllAccountsUnified, getAccountStatistics, searchAccountsUnified } from '../../utils/accounts-consolidated'
import { findAccountByIdentifierOptimized } from '../../utils/account-lookup-optimized'
import { getOrganizationInfo, getOrganizationalUnitTree, getAccountPolicies } from '../../utils/organizations'
import { resolveToCommercialAccountIds } from '../../utils/account-filters'
import { buildCostFilter } from '../../utils/cost-domain'
import { getCostAllocationTags, getCostAndUsage, getCostAndUsageWithResources, getCostForecast, getProformaForecast } from '../../utils/cost-explorer'
import { validateDateParams, type RelativePeriod } from '../../utils/date-helpers'
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
  getPipelineByIdWithDetails,
  getPipelineRunsForAccount,
  searchResourceAcrossAccounts
} from '../../utils/athena-pipeline-queries'
import { queryAIUsage } from '../../utils/ai-usage-query'
import { invokeBedrock } from '../../utils/bedrock-client'
import { sendStrandsQuery } from '../../utils/strands-client'
import { getUserPreferences, updateUserPreferences } from '../../utils/user-preferences'
import {
  addMessageToThread,
  createThread,
  deleteThread,
  getThreadById,
  getUserThreads,
  updateThread
} from '../../utils/chat-threads'
import { createDatasetExportJob, getDatasetExportJob, listDatasetExportJobs } from '../../utils/dataset-export-jobs'
import { getDatasetReportConfigErrors } from '../../utils/dataset-report-validation'
import { getReport, listUserReports } from '../../utils/scheduled-reports'
import { executeScheduledReport } from '../../utils/report-scheduler'
import { getLatestAnalysis, getInstanceClassifications } from '../../utils/utilization-persistence'
import { getAnnualBudgetArray, getPeriodBudget } from '../../../shared/utils/budget-utils'
import type { DatasetReportConfig } from '../../../shared/types/dataset-reports'
import type { NotificationCategory, NotificationStatus } from '../../../shared/types/notifications'
import type { GhostMcpClientAttribution, GhostMcpPrincipal } from '../types'
import {
  beginMcpIdentityCenterAuthorization,
  issueMcpIdentityCenterCredentials
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
import { normalizeLimit, toolError, toolRenderedOutput, toolSuccess } from '../results'
import { runIdempotent } from '../idempotency'
import { buildMcpCostDashboard } from '../cost-dashboard'
import { buildPersonalAccountContext } from '../personal-account-context'
import { registerGhostTool } from './register'

const operationalEnvironmentSchema = z.enum(['commercial', 'govcloud']).default('govcloud')
const costEnvironmentSchema = z.enum(['commercial', 'govcloud']).default('commercial')
const accountIdentifiersSchema = z.array(z.string().min(1)).max(100).default([])
const notificationCategorySchema = z.enum([
  'BUDGET_THRESHOLD', 'COST_ANOMALY', 'COST_SUMMARY', 'SECURITY_CRITICAL',
  'COMPLIANCE', 'SECURITY_SCORE', 'PIPELINE_FAILURE', 'DEPLOYMENT',
  'REPORT_READY', 'CHAT_COMPLETE', 'SYSTEM', 'ACHIEVEMENT'
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
  const matches = await searchAccountsUnified(identifier)
  if (matches.length !== 1) {
    const error = new Error(matches.length > 1 ? `Account name is ambiguous; ${matches.length} accounts matched` : 'Account not found')
    error.name = matches.length > 1 ? 'ACCOUNT_AMBIGUOUS' : 'ACCOUNT_NOT_FOUND'
    throw error
  }
  const account = matches[0]!
  return { account, identifierType: 'name' as any, matchedValue: identifier, source: account.source || 'both' }
}

async function commercialIds(identifiers: string[]): Promise<string[]> {
  if (!identifiers.length) return []
  return resolveToCommercialAccountIds(identifiers)
}

function dateRange(args: { start_date?: string; end_date?: string; period?: string }) {
  return validateDateParams({
    startDate: args.start_date,
    endDate: args.end_date,
    period: args.period as RelativePeriod | undefined
  })
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

  read({
    name: 'ghost.accounts.search', title: 'Search GHOST accounts',
    description: 'Search enriched GHOST AWS account metadata by name, alias, ID, email, request ID, project, department, or line of business.',
    inputSchema: z.object({ query: z.string().min(1), ...paginationSchema }),
    handler: async args => {
      const matches = await searchAccountsUnified(args.query)
      const limit = normalizeLimit(args.limit)
      return toolSuccess(matches.slice(0, limit), `Found ${matches.length} matching account(s).`, 'Organizations and GHOST account metadata', {
        warnings: matches.length > limit ? [`Only the first ${limit} matches are included.`] : undefined
      })
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
      return toolSuccess(accounts.slice(0, limit), `Listed ${Math.min(accounts.length, limit)} of ${accounts.length} account(s).`, 'Organizations and GHOST account metadata', {
        warnings: accounts.length > limit ? ['Narrow the filters or use a dataset export for the full result.'] : undefined
      })
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
    inputSchema: costQuerySchema,
    handler: async args => {
      const range = dateRange(args)
      const ids = await commercialIds(args.account_identifiers)
      if (args.account_identifiers.length && !ids.length) return toolError('ACCOUNT_NOT_FOUND', 'No account identifiers could be resolved.')
      if (args.mode === 'proforma' && args.environment !== 'commercial') return toolError('INVALID_COST_MODE', 'Proforma costs are available only in Commercial.')
      const target = args.mode === 'proforma' ? process.env.AWS_PROFORMA_ACCOUNT_ID || '253821132832' : args.environment === 'commercial' ? process.env.AWS_MASTER_ACCOUNT_ID || '205950196477' : undefined
      const response = await getCostAndUsage({
        startDate: range.startDate, endDate: range.endDate, granularity: args.granularity,
        metrics: ['UnblendedCost'], filter: buildCostFilter({ accountIds: ids.length ? ids : undefined }),
        groupBy: args.group_by === 'NONE' ? undefined : [{ type: 'DIMENSION', key: args.group_by }]
      }, args.environment, target)
      return toolSuccess(response.dataset, `Cost query returned ${response.dataset.reconciliation.authoritativeTotal.toFixed(2)} USD.`, 'AWS Cost Explorer')
    }
  })

  read({
    name: 'ghost.costs.dashboard', title: 'Get cost dashboard', description: 'Return dashboard cost totals plus budget health, end-of-month and year-end projections, account estimates, and methodology. Defaults to proforma chargeback costs.',
    inputSchema: costQuerySchema.omit({ group_by: true, granularity: true }),
    handler: async args => {
      const range = dateRange(args)
      const ids = await commercialIds(args.account_identifiers)
      if (args.account_identifiers.length && !ids.length) return toolError('ACCOUNT_NOT_FOUND', 'No account identifiers could be resolved.')
      if (args.mode === 'proforma' && args.environment !== 'commercial') return toolError('INVALID_COST_MODE', 'Proforma costs are available only in Commercial.')
      const target = args.mode === 'proforma' ? process.env.AWS_PROFORMA_ACCOUNT_ID || '253821132832' : args.environment === 'commercial' ? process.env.AWS_MASTER_ACCOUNT_ID || '205950196477' : undefined
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
        warnings: projectionReason ? [projectionReason] : undefined
      })
    }
  })

  read({
    name: 'ghost.costs.forecast', title: 'Forecast AWS costs', description: 'Return cost forecasts for an optional account scope. Defaults to proforma chargeback forecasts.',
    inputSchema: z.object({ start_date: z.string(), end_date: z.string(), mode: z.enum(['billable', 'proforma']).default('proforma'), environment: costEnvironmentSchema, account_identifiers: accountIdentifiersSchema, granularity: z.enum(['DAILY', 'MONTHLY']).default('DAILY') }),
    handler: async args => {
      const ids = await commercialIds(args.account_identifiers)
      if (args.mode === 'proforma' && args.environment !== 'commercial') return toolError('INVALID_COST_MODE', 'Proforma forecasts are available only in Commercial.')
      const filter = buildCostFilter({ accountIds: ids.length ? ids : undefined })
      const result = args.mode === 'proforma'
        ? await getProformaForecast(args.start_date, args.end_date, 'UNBLENDED_COST', args.granularity, filter)
        : await getCostForecast(args.start_date, args.end_date, 'UNBLENDED_COST', args.granularity, filter, args.environment, process.env.AWS_MASTER_ACCOUNT_ID || '205950196477')
      return toolSuccess(result, 'Cost forecast loaded.', 'AWS Cost Explorer')
    }
  })

  read({
    name: 'ghost.costs.resources', title: 'Get resource-level costs', description: 'Return billable resource-level Cost Explorer data for a required account and date range. Billing Conductor does not provide resource-level proforma allocation.',
    inputSchema: z.object({ identifier: z.string(), start_date: z.string(), end_date: z.string(), environment: costEnvironmentSchema, granularity: z.enum(['DAILY', 'MONTHLY']).default('DAILY') }),
    handler: async args => {
      const ids = await commercialIds([args.identifier])
      if (!ids[0]) return toolError('ACCOUNT_NOT_FOUND', 'Account could not be resolved.')
      const result = await getCostAndUsageWithResources({ startDate: args.start_date, endDate: args.end_date, granularity: args.granularity, metrics: ['UnblendedCost'], filter: buildCostFilter({ accountIds: ids })! }, args.environment)
      return toolSuccess(result, 'Resource-level costs loaded.', 'AWS Cost Explorer')
    }
  })

  read({
    name: 'ghost.costs.tags', title: 'Discover cost tags', description: 'List billable Cost Explorer allocation tag keys or values for a date range. Billing Conductor does not provide native tag-level proforma allocation.',
    inputSchema: z.object({ start_date: z.string(), end_date: z.string(), tag_key: z.string().optional(), environment: costEnvironmentSchema }),
    handler: async args => toolSuccess(await getCostAllocationTags({ Start: args.start_date, End: args.end_date }, args.tag_key, undefined, args.environment), 'Cost tags loaded.', 'AWS Cost Explorer')
  })

  read({
    name: 'ghost.costs.budget_vs_actual', title: 'Compare budget and actual cost', description: 'Compare account actuals with GHOST account budgets for a date range. Defaults to proforma chargeback actuals.',
    inputSchema: costQuerySchema.omit({ group_by: true, granularity: true }),
    handler: async args => {
      const range = dateRange(args)
      const ids = await commercialIds(args.account_identifiers)
      const response = await getCostAndUsage({
        startDate: range.startDate, endDate: range.endDate, granularity: 'MONTHLY', metrics: ['UnblendedCost'],
        filter: buildCostFilter({ accountIds: ids.length ? ids : undefined }),
        groupBy: [{ type: 'DIMENSION', key: 'LINKED_ACCOUNT' }]
      }, args.environment, args.mode === 'proforma'
        ? process.env.AWS_PROFORMA_ACCOUNT_ID || '253821132832'
        : args.environment === 'commercial' ? process.env.AWS_MASTER_ACCOUNT_ID || '205950196477' : undefined)
      const actuals = new Map<string, number>()
      for (const period of response.resultsByTime) {
        for (const group of period.Groups || []) {
          const id = group.Keys?.[0]
          if (id) actuals.set(id, (actuals.get(id) || 0) + Number(group.Metrics?.UnblendedCost?.Amount || 0))
        }
      }
      const accounts = (await getAllAccountsUnified(true))
        .filter(account => !ids.length || ids.includes(account.accountId || ''))
        .map(account => {
          const accountId = account.accountId || account.awsStandardAccountID || ''
          const budget = getPeriodBudget({
            pepBudget2026Monthly: account.pepBudget2026Monthly,
            estimatedMonthlyCharge: account.estimatedMonthlyCharge
          }, range.startDate, range.endDate)
          const actual = actuals.get(accountId) || 0
          return { accountId, accountName: accountDisplayName(account), actual, budget: budget.periodBudget, variance: budget.periodBudget === null ? null : actual - budget.periodBudget, budgetSource: budget.source }
        })
      return toolSuccess({ accounts, totalActual: response.dataset.reconciliation.authoritativeTotal }, 'Budget-versus-actual data loaded.', 'AWS Cost Explorer and GHOST account budgets')
    }
  })

  read({
    name: 'ghost.forecasts.get', title: 'Get cost forecast', description: 'Return a cost forecast for the requested account scope and future date range. Defaults to proforma chargeback forecasts.',
    inputSchema: z.object({ start_date: z.string(), end_date: z.string(), mode: z.enum(['billable', 'proforma']).default('proforma'), environment: costEnvironmentSchema, account_identifiers: accountIdentifiersSchema, granularity: z.enum(['DAILY', 'MONTHLY']).default('MONTHLY') }),
    handler: async args => {
      const ids = await commercialIds(args.account_identifiers)
      if (args.mode === 'proforma' && args.environment !== 'commercial') return toolError('INVALID_COST_MODE', 'Proforma forecasts are available only in Commercial.')
      const filter = buildCostFilter({ accountIds: ids.length ? ids : undefined })
      const result = args.mode === 'proforma'
        ? await getProformaForecast(args.start_date, args.end_date, 'UNBLENDED_COST', args.granularity, filter)
        : await getCostForecast(args.start_date, args.end_date, 'UNBLENDED_COST', args.granularity, filter, args.environment, process.env.AWS_MASTER_ACCOUNT_ID || '205950196477')
      return toolSuccess(result, 'Forecast loaded.', 'AWS Cost Explorer')
    }
  })

  read({
    name: 'ghost.alerts.list', title: 'List budget alerts', description: 'List budget alerts by account, month, or alert type with a bounded result size.',
    inputSchema: z.object({ account_id: z.string().optional(), month: z.string().regex(/^\d{4}-\d{2}$/).optional(), alert_type: z.enum(['FORECAST', 'ACTUAL']).optional(), limit: z.number().int().min(1).max(100).default(25) }),
    handler: async args => {
      const options = { limit: args.limit, sortOrder: 'desc' as const }
      const result = args.month ? await getAlertsByMonth(args.month, options) : args.alert_type ? await getAlertsByType(args.alert_type, options) : args.account_id ? await getAlertsByAccount(args.account_id, options) : await getAllAlerts(options)
      return toolSuccess(result, `Loaded ${result.count} budget alert(s).`, 'GHOST budget alerts')
    }
  })

  read({
    name: 'ghost.users.search', title: 'Search users', description: 'Search Entra users who have access to GHOST-managed AWS accounts.',
    inputSchema: z.object({ query: z.string().min(1), limit: z.number().int().min(1).max(100).default(25) }),
    handler: async args => {
      const event = await createMcpDelegatedGraphEvent(principal)
      const result = await queryEntraUsers(event, [], { userSearch: args.query }, { mode: 'preview', limit: args.limit })
      return toolSuccess(result, `Found ${result.records.length} user access record(s).`, 'Microsoft Graph')
    }
  })

  read({
    name: 'ghost.access.for_account', title: 'Get account access', description: 'List effective IAM Identity Center user/group assignments for one GHOST account using management-account APIs.',
    inputSchema: z.object({ identifier: z.string(), environment: z.enum(['commercial', 'govcloud', 'both']).default('both'), limit: z.number().int().min(1).max(100).default(50) }),
    handler: async args => {
      const { account } = await resolveAccount(args.identifier)
      const commercialId = account.accountId || account.awsStandardAccountID
      const govCloudId = account.govCloudAccountId || account.awsGovCloudAccountID
      const targets = [] as Array<{ environment: 'commercial' | 'govcloud'; accountId: string }>
      if (args.environment !== 'govcloud' && commercialId) targets.push({ environment: 'commercial', accountId: commercialId })
      if (args.environment !== 'commercial' && govCloudId) targets.push({ environment: 'govcloud', accountId: govCloudId })
      if (!targets.length) return toolError('ACCOUNT_ENVIRONMENT_MISSING', 'The account has no identifier for the requested IDC environment.')
      const result = await getMcpIdentityCenterAccountAccess(targets, args.limit)
      return toolSuccess(result, `Loaded ${result.records.length} effective IDC assignment(s).`, 'AWS IAM Identity Center Admin')
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
      z.object({ target_type: z.literal('current_user'), environment: z.enum(['commercial', 'govcloud', 'both']).default('both') }),
      z.object({ target_type: z.literal('user'), user: z.string().min(1), environment: z.enum(['commercial', 'govcloud', 'both']).default('both') }),
      z.object({ target_type: z.literal('account'), account_identifier: z.string().min(1), environment: z.enum(['commercial', 'govcloud', 'both']).default('both'), limit: z.number().int().min(1).max(250).default(100) })
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
        const effective = await getMcpIdentityCenterAccountAccess(targets, args.limit)
        return toolSuccess({ account: { name: accountDisplayName(account), commercialAccountId: account.accountId || account.awsStandardAccountID, govCloudAccountId: account.govCloudAccountId || account.awsGovCloudAccountID }, effective, directoryMetadata: { authoritative: false, available: false, reason: 'Account access is derived from IDC assignments; directory groups are user-specific.' } }, 'Explained effective IDC access for the account.', 'AWS IAM Identity Center Admin and Identity Store')
      }
      const userName = args.target_type === 'current_user' ? principal.email : (args.user.includes('@') ? args.user : `${args.user}@${process.env.ENTRA_DEFAULT_DOMAIN || 'gd-ms.com'}`)
      const assignments = await explainMcpIdentityCenterUserAccess(userName, [...environments])
      const directoryGroups = args.target_type === 'current_user' ? principal.groups : []
      return toolSuccess({ user: userName, assignments, directoryMetadata: { authoritative: false, groups: directoryGroups, available: args.target_type === 'current_user', difference: 'IDC assignments are effective AWS access. Entra groups are directory metadata and may not map to an IDC assignment.' } }, 'Explained direct and group-derived IDC access.', 'AWS IAM Identity Center Admin and Identity Store')
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
    name: 'ghost.support.search', title: 'Search GHOST support knowledge',
    description: 'Compatibility alias for ghost.docs.search. Use ghost.docs.search as the first lookup for internal catalogs, policy, process, and team concepts.',
    inputSchema: z.object({
      query: z.string().min(2).max(2000),
      max_results: z.number().int().min(1).max(10).default(5),
      cursor: z.string().optional()
    }),
    handler: documentationSearch
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
    inputSchema: z.object({ account_identifiers: accountIdentifiersSchema, resource_types: z.array(z.string()).max(20).default([]), regions: z.array(z.string()).max(20).default([]), resource_id: z.string().optional(), resource_name: z.string().optional(), limit: z.number().int().min(1).max(100).default(25) }),
    handler: async args => {
      const ids = await commercialIds(args.account_identifiers)
      const result = await queryConfigResources(ids, { resourceTypes: args.resource_types, regions: args.regions, resourceId: args.resource_id, resourceName: args.resource_name }, { mode: 'preview', limit: args.limit })
      return toolSuccess(result, `Loaded ${result.records.length} AWS resource(s).`, 'AWS Config')
    }
  })

  read({
    name: 'ghost.instances.get', title: 'Get an EC2 instance', description: 'Find one EC2 instance by exact instance ID in AWS Config and optional account scope.',
    inputSchema: z.object({ instance_id: z.string().regex(/^i-[0-9a-f]{8,17}$/), account_identifiers: accountIdentifiersSchema }),
    handler: async args => {
      const result = await queryConfigResources(await commercialIds(args.account_identifiers), { resourceTypes: ['AWS::EC2::Instance'], resourceId: args.instance_id }, { mode: 'preview', limit: 10 })
      return result.records.length ? toolSuccess(result.records, `Found ${result.records.length} instance record(s).`, 'AWS Config') : toolError('INSTANCE_NOT_FOUND', 'Instance was not found in the Config aggregator.')
    }
  })

  read({
    name: 'ghost.instances.utilization', title: 'Get EC2 utilization analysis', description: 'Return the latest persisted GHOST utilization summary and bounded instance classifications for an account.',
    inputSchema: z.object({ account_id: z.string(), environment: operationalEnvironmentSchema, classification: z.string().optional(), limit: z.number().int().min(1).max(100).default(25) }),
    handler: async args => {
      const latest = await getLatestAnalysis(args.account_id, args.environment)
      if (!latest) return toolError('UTILIZATION_NOT_FOUND', 'No completed utilization analysis is available for this account.')
      const classifications = await getInstanceClassifications(latest.jobId, { classification: args.classification, limit: args.limit })
      return toolSuccess({ latest, classifications }, 'Utilization analysis loaded.', 'GHOST utilization analysis')
    }
  })

  read({
    name: 'ghost.security.summary', title: 'Get security summary', description: 'Return a 90-day Security Hub and Inspector posture summary, including vulnerability findings and Security Hub control results. This is distinct from AWS Config rule compliance and SSM patch compliance.',
    inputSchema: z.object({ account_id: z.string().optional() }),
    handler: async args => {
      const account = args.account_id ? (await resolveAccount(args.account_id)).account : undefined
      const result = args.account_id
        ? await buildAccountSecurityViaAthena(args.account_id, accountDisplayName(account))
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
      const domains = await collectCompliance(operationalId, args.environment, account.accountId || account.awsStandardAccountID)
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
    inputSchema: z.object({ account_identifiers: accountIdentifiersSchema, severities: z.array(z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFORMATIONAL'])).default([]), statuses: z.array(z.enum(['NEW', 'NOTIFIED', 'RESOLVED', 'SUPPRESSED'])).default([]), lookback_days: z.number().int().min(1).max(90).default(30), limit: z.number().int().min(1).max(100).default(25) }),
    handler: async args => {
      const result = await querySecurityHubFindings(await commercialIds(args.account_identifiers), { severities: args.severities, statuses: args.statuses, lookbackDays: args.lookback_days }, { mode: 'preview', limit: args.limit })
      return toolSuccess(result, `Loaded ${result.records.length} security finding(s).`, 'AWS Security Hub')
    }
  })

  read({
    name: 'ghost.audit.cloudtrail', title: 'Query CloudTrail activity', description: 'Query bounded CloudTrail activity for selected accounts, users, services, events, or errors.',
    inputSchema: z.object({ account_identifiers: accountIdentifiersSchema, event_names: z.array(z.string()).max(20).default([]), event_sources: z.array(z.string()).max(20).default([]), user_identities: z.array(z.string()).max(20).default([]), errors_only: z.boolean().default(false), write_events_only: z.boolean().default(false), lookback_days: z.number().int().min(1).max(90).default(7), limit: z.number().int().min(1).max(100).default(25) }),
    handler: async args => {
      const result = await queryCloudTrailEvents(await commercialIds(args.account_identifiers), { eventNames: args.event_names, eventSources: args.event_sources, userIdentities: args.user_identities, errorsOnly: args.errors_only, writeEventsOnly: args.write_events_only, lookbackDays: args.lookback_days }, { mode: 'preview', limit: args.limit })
      return toolSuccess(result, `Loaded ${result.records.length} CloudTrail event(s).`, 'AWS CloudTrail')
    }
  })

  read({
    name: 'ghost.support.patch_compliance', title: 'Get patch compliance', description: 'Get SSM patch compliance for an account or a specific EC2 instance. This measures managed-instance patch state only, not Security Hub or AWS Config control compliance.',
    inputSchema: z.object({ account_id: z.string(), instance_id: z.string().optional(), environment: operationalEnvironmentSchema, region: z.string().optional() }),
    handler: async args => toolSuccess(args.instance_id ? await getInstancePatchStatus(args.instance_id, args.account_id, args.environment, args.region) : await getAccountPatchCompliance(args.account_id, args.environment, args.region), 'Patch compliance loaded.', 'AWS Systems Manager')
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
    handler: async args => toolSuccess(analyzeBucketPolicy(args.bucket_name, args.policy as any, args.bucket_account_id), 'Bucket policy analysis complete.', 'GHOST policy analyzer')
  })

  read({
    name: 'ghost.pipelines.overview', title: 'Get pipeline overview', description: 'Return organization-wide GitLab/Terraform pipeline summary and recent timeline.',
    inputSchema: z.object({ days: z.number().int().min(1).max(90).default(30), limit: z.number().int().min(1).max(100).default(25) }),
    handler: async args => toolSuccess({ summary: await getOrganizationSummary(args.days, 'govcloud'), timeline: await getOrganizationTimeline(args.days, args.limit, 'govcloud') }, 'Pipeline overview loaded.', 'Athena pipeline telemetry')
  })

  read({
    name: 'ghost.pipelines.for_account', title: 'Get account pipelines', description: 'Return recent pipeline runs touching one AWS account.',
    inputSchema: z.object({ account_id: z.string(), days: z.number().int().min(1).max(90).default(30), limit: z.number().int().min(1).max(100).default(25) }),
    handler: async args => toolSuccess(await getPipelineRunsForAccount(args.account_id, args.days, 'govcloud', args.limit), 'Account pipeline runs loaded.', 'Athena pipeline telemetry')
  })

  read({
    name: 'ghost.pipelines.get_run', title: 'Get pipeline run', description: 'Return a pipeline run with account plans, resource changes, and errors.',
    inputSchema: z.object({ pipeline_id: z.string().regex(/^\d+$/, 'Pipeline ID must contain only digits') }),
    handler: async args => toolSuccess(await getPipelineByIdWithDetails(args.pipeline_id, 'govcloud'), 'Pipeline details loaded.', 'Athena pipeline telemetry')
  })

  read({
    name: 'ghost.pipelines.search_resources', title: 'Search pipeline resources', description: 'Search planned or applied Terraform resources across account pipelines.',
    inputSchema: z.object({ query: z.string().min(1), account_id: z.string().optional(), days: z.number().int().min(1).max(90).default(30) }),
    handler: async args => toolSuccess(await searchResourceAcrossAccounts(args.query, args.days, args.account_id, 'govcloud'), 'Pipeline resource search complete.', 'Athena pipeline telemetry')
  })

  read({
    name: 'ghost.ai.usage', title: 'Get organization AI usage', description: 'Return Bedrock and AWS AI adoption, invocation, token, latency, and cost metrics.',
    inputSchema: z.object({ period: z.string().default('last30days'), environment: z.enum(['all', 'commercial', 'govcloud']).default('all'), account_identifiers: accountIdentifiersSchema, group_by: z.enum(['enclave', 'account', 'environment', 'provider', 'service', 'project', 'model', 'region', 'day']).default('enclave'), cost_basis: z.enum(['billable', 'proforma']).default('proforma') }),
    handler: async args => toolSuccess(await queryAIUsage({ period: args.period, environment: args.environment, accountIds: await commercialIds(args.account_identifiers), groupBy: args.group_by, costBasis: args.cost_basis }), 'AI usage metrics loaded.', 'GHOST AI usage facts')
  })

  ai({
    name: 'ghost.ai.insight', title: 'Generate a GHOST insight', description: 'Generate a bounded AWS account, cost, resource, or security insight from supplied GHOST context.',
    inputSchema: z.object({ question: z.string().min(1).max(4000), context: z.record(z.string(), z.unknown()).default({}) }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    handler: async args => {
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
      const response = await invokeBedrock({ prompt: `Problem: ${args.problem}\nAccount: ${args.account_id || 'not specified'}\nEnvironment: ${args.environment}\nService: ${args.service || 'not specified'}\nReturn a prioritized diagnostic plan and do not claim that any action was executed.`, model: 'claude-sonnet', maxTokens: 1800, temperature: 0.3 })
      if (!response.success) return toolError(response.error?.code || 'AI_ERROR', response.error?.message || 'Troubleshooting generation failed')
      return toolSuccess({ plan: response.content, model: response.model }, 'Troubleshooting plan generated.', 'AWS Bedrock')
    }
  })

  ai({
    name: 'ghost.ai.chat', title: 'Chat with the GHOST agent', description: 'Ask the existing GHOST Strands agent an AWS question after using direct GHOST tools. For internal catalogs, standards, processes, architecture, or team concepts, call ghost.docs.search first. The downstream agent must not be configured with this GHOST MCP server.',
    inputSchema: z.object({ message: z.string().min(1).max(10000), account_identifier: z.string().optional(), session_id: z.string().optional(), timezone: z.string().optional(), prefer_govcloud: z.boolean().default(true) }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    handler: async args => toolSuccess(await sendStrandsQuery(args.message, { accountIdentifier: args.account_identifier, sessionId: args.session_id, timezone: args.timezone, preferGovcloud: args.prefer_govcloud }), 'GHOST agent response received.', 'GHOST Strands agent')
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
    name: 'ghost.evidence.create', title: 'Create evidence bundle',
    description: 'Explicitly rerun authoritative account-health queries and create a private 90-day JSON and Markdown evidence bundle. It never captures credentials or delegated tokens.',
    inputSchema: z.object({ account_identifier: z.string().min(1), title: z.string().min(1).max(160), selected_domains: z.array(z.enum(EVIDENCE_DOMAINS)).min(1), lookback_days: z.number().int().min(1).max(90).default(30), environment: operationalEnvironmentSchema }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    getAuditTargetIds: args => [args.account_identifier],
    handler: async args => {
      const { account } = await resolveAccount(args.account_identifier)
      const bundle = await createEvidenceBundle({ ownerSubject: principal.subject, accountIdentifier: args.account_identifier, title: args.title, selectedDomains: args.selected_domains, lookbackDays: args.lookback_days, account, environment: args.environment })
      return toolSuccess(bundle, 'Created a private evidence bundle with a 90-day retention period.', 'GHOST private evidence storage')
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
    name: 'ghost.preferences.update', title: 'Update my preferences', description: 'Update the authenticated user’s timezone, favorites, or other GHOST preferences.',
    inputSchema: z.object({ timezone: z.string().optional(), preferences: z.record(z.string(), z.unknown()).optional() }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    handler: async args => toolSuccess(await updateUserPreferences(principal.email, args), 'Preferences updated.', 'GHOST user preferences')
  })

  collaborate({
    name: 'ghost.chat_threads.list', title: 'List my chat threads', description: 'List the authenticated user’s GHOST chat threads.',
    inputSchema: z.object({ search: z.string().optional(), pinned: z.boolean().optional(), archived: z.boolean().optional(), limit: z.number().int().min(1).max(100).default(25) }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    handler: async args => toolSuccess(await getUserThreads(principal.email, { searchQuery: args.search, isPinned: args.pinned, isArchived: args.archived, limit: args.limit }), 'Chat threads loaded.', 'GHOST chat storage')
  })

  collaborate({
    name: 'ghost.chat_threads.get', title: 'Get my chat thread', description: 'Get one authenticated-user-owned GHOST chat thread.',
    inputSchema: z.object({ thread_id: z.string().uuid() }), annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    handler: async args => {
      const thread = await getThreadById(args.thread_id, principal.email)
      return thread ? toolSuccess(thread, 'Chat thread loaded.', 'GHOST chat storage') : toolError('THREAD_NOT_FOUND', 'Thread not found.')
    }
  })

  collaborate({
    name: 'ghost.chat_threads.create', title: 'Create a chat thread', description: 'Create a user-owned GHOST chat thread.',
    inputSchema: z.object({ title: z.string().max(120).optional(), initial_message: z.string().max(10000).optional(), idempotency_key: idempotencyKeySchema() }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    handler: async args => {
      const result = await runIdempotent(principal, 'ghost.chat_threads.create', args.idempotency_key, async () => {
        const thread = await createThread(principal.email, { title: args.title })
        return args.initial_message
          ? await addMessageToThread(thread.threadId, principal.email, { role: 'user', content: args.initial_message })
          : thread
      })
      return toolSuccess(result.value, result.replayed ? 'Existing chat thread returned for this idempotency key.' : 'Chat thread created.', 'GHOST chat storage')
    }
  })

  collaborate({
    name: 'ghost.chat_threads.update', title: 'Update a chat thread', description: 'Rename, pin, archive, or describe a user-owned GHOST chat thread.',
    inputSchema: z.object({ thread_id: z.string().uuid(), title: z.string().max(120).optional(), description: z.string().max(1000).optional(), pinned: z.boolean().optional(), archived: z.boolean().optional() }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    handler: async args => {
      const thread = await updateThread(args.thread_id, principal.email, { title: args.title, description: args.description, isPinned: args.pinned, isArchived: args.archived })
      return thread ? toolSuccess(thread, 'Chat thread updated.', 'GHOST chat storage') : toolError('THREAD_NOT_FOUND', 'Thread not found.')
    }
  })

  collaborate({
    name: 'ghost.chat_threads.add_message', title: 'Add a chat message', description: 'Append a user message to a user-owned GHOST chat thread.',
    inputSchema: z.object({ thread_id: z.string().uuid(), content: z.string().min(1).max(10000), idempotency_key: idempotencyKeySchema() }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    handler: async args => {
      const result = await runIdempotent(principal, 'ghost.chat_threads.add_message', args.idempotency_key, () =>
        addMessageToThread(args.thread_id, principal.email, { role: 'user', content: args.content }))
      const thread = result.value
      return thread ? toolSuccess(thread, 'Message added.', 'GHOST chat storage') : toolError('THREAD_NOT_FOUND', 'Thread not found.')
    }
  })

  const confirmationSchema = z.object({ confirm: z.boolean() })
  collaborate({
    name: 'ghost.chat_threads.delete', title: 'Delete a chat thread', description: 'Permanently delete a user-owned GHOST chat thread after explicit MCP elicitation confirmation.',
    inputSchema: z.object({ thread_id: z.string().uuid() }),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    handler: async (args, context: ServerContext) => {
      const confirmed = acceptedContent(context.mcpReq.inputResponses, 'confirm_delete', confirmationSchema)
      const state = context.mcpReq.requestState<{ tool: string; targetId: string }>()
      if (!confirmed?.confirm || state?.tool !== 'ghost.chat_threads.delete' || state.targetId !== args.thread_id) {
        return inputRequired({
          inputRequests: {
            confirm_delete: inputRequired.elicit({
              message: `Permanently delete GHOST chat thread ${args.thread_id}?`,
              requestedSchema: confirmationSchema
            })
          },
          requestState: await confirmationCodec.mint({ tool: 'ghost.chat_threads.delete', targetId: args.thread_id }, context)
        })
      }
      return await deleteThread(args.thread_id, principal.email)
        ? toolSuccess({ deleted: true, threadId: args.thread_id }, 'Chat thread deleted.', 'GHOST chat storage')
        : toolError('THREAD_NOT_FOUND', 'Thread not found.')
    }
  })

  collaborate({
    name: 'ghost.reports.list', title: 'List my reports and exports', description: 'List the authenticated user’s scheduled reports and recent asynchronous dataset exports.',
    inputSchema: z.object({ status: z.string().optional(), limit: z.number().int().min(1).max(100).default(25) }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    handler: async args => {
      const [reports, exports] = await Promise.all([listUserReports(principal.email, args.status, args.limit), listDatasetExportJobs(principal.email)])
      return toolSuccess({ reports: reports.reports, exports: exports.slice(0, args.limit) }, 'Reports and exports loaded.', 'GHOST report storage')
    }
  })

  collaborate({
    name: 'ghost.reports.start_export', title: 'Start a dataset export', description: 'Queue a user-owned Config, Security Hub, CloudTrail, or Entra dataset export.',
    inputSchema: z.object({ report_config: z.record(z.string(), z.unknown()), idempotency_key: idempotencyKeySchema() }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    handler: async args => {
      const config = args.report_config as unknown as DatasetReportConfig
      const errors = getDatasetReportConfigErrors(config)
      if (errors.length) return toolError('INVALID_REPORT_CONFIG', errors.join('; '))
      const result = await runIdempotent(principal, 'ghost.reports.start_export', args.idempotency_key, () => createDatasetExportJob(principal.email, config))
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
    name: 'ghost.reports.download_url', title: 'Get export download URL', description: 'Create a five-minute download URL for a completed authenticated-user-owned export.',
    inputSchema: z.object({ job_id: z.string().uuid() }), annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    handler: async args => {
      const job = await getDatasetExportJob(args.job_id, principal.email)
      if (!job?.s3Key || job.status !== 'complete') return toolError('EXPORT_NOT_READY', 'Export is not complete or was not found.')
      return toolSuccess({ url: await getPresignedDownloadUrl({ key: job.s3Key, expiresInSeconds: 300 }), expiresInSeconds: 300 }, 'Download URL created.', 'GHOST S3 report storage')
    }
  })

  collaborate({
    name: 'ghost.reports.run', title: 'Run my report', description: 'Run an existing authenticated-user-owned dataset report immediately.',
    inputSchema: z.object({ report_id: z.string().min(1), idempotency_key: idempotencyKeySchema() }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    handler: async args => {
      const report = await getReport(args.report_id)
      if (!report || report.createdBy !== principal.email) return toolError('REPORT_NOT_FOUND', 'Report not found.')
      const replay = await runIdempotent(principal, 'ghost.reports.run', args.idempotency_key, () => executeScheduledReport(report))
      const result = replay.value
      return result.success ? toolSuccess(result, 'Report execution completed.', 'GHOST report scheduler') : toolError('REPORT_RUN_FAILED', result.error || 'Report execution failed')
    }
  })
}
