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
import { getCostAllocationTags, getCostAndUsage, getCostAndUsageWithResources, getCostForecast } from '../../utils/cost-explorer'
import { validateDateParams, type RelativePeriod } from '../../utils/date-helpers'
import { getAlertsByAccount, getAlertsByMonth, getAlertsByType, getAllAlerts } from '../../utils/budget-alerts'
import { createEntraServiceEvent } from '../../utils/entra/service-session'
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
import { getPeriodBudget } from '../../../shared/utils/budget-utils'
import type { DatasetReportConfig } from '../../../shared/types/dataset-reports'
import type { GhostMcpPrincipal } from '../types'
import { beginMcpIdentityCenterAuthorization, issueMcpIdentityCenterCredentials } from '../idc-credentials'
import { renderGhostOutput } from '../output-format'
import { searchSupportKnowledgeBase } from '../support-knowledge'
import { getMcpUserAccountAccess, requireMcpAccountRole } from '../user-access'
import { normalizeLimit, toolError, toolRenderedOutput, toolSuccess } from '../results'
import { runIdempotent } from '../idempotency'
import { registerGhostTool } from './register'

const environmentSchema = z.enum(['commercial', 'govcloud']).default('commercial')
const accountIdentifiersSchema = z.array(z.string().min(1)).max(100).default([])
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

function idempotencyKeySchema() {
  return z.string().min(8).max(128).describe('Stable caller-generated key used to prevent accidental duplicate writes')
}

export function registerCatalogTools(
  server: McpServer,
  principal: GhostMcpPrincipal,
  confirmationCodec: RequestStateCodec<{ tool: string; targetId: string }>
): void {
  const read = (definition: Omit<Parameters<typeof registerGhostTool>[2], 'scope' | 'annotations'>) => registerGhostTool(server, principal, {
    ...definition,
    scope: 'ghost.read',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  })
  const collaborate = (definition: Omit<Parameters<typeof registerGhostTool>[2], 'scope'>) => registerGhostTool(server, principal, {
    ...definition,
    scope: 'ghost.collaborate'
  })
  const ai = (definition: Omit<Parameters<typeof registerGhostTool>[2], 'scope'>) => registerGhostTool(server, principal, {
    ...definition,
    scope: 'ghost.ai.invoke'
  })
  const credentials = (definition: Omit<Parameters<typeof registerGhostTool>[2], 'scope'>) => registerGhostTool(server, principal, {
    ...definition,
    scope: 'ghost.credentials.issue'
  })

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
    description: 'List the authenticated MCP user\'s AWS accounts, Entra role groups, and Commercial/GovCloud access.',
    inputSchema: z.object({}),
    handler: async () => {
      const access = await getMcpUserAccountAccess(principal)
      return toolSuccess(access, `Loaded ${access.accounts.length} account(s) assigned to the authenticated user.`, 'Microsoft Graph and GHOST account metadata', {
        warnings: access.warning ? [access.warning] : undefined
      })
    }
  })

  read({
    name: 'ghost.organization.overview', title: 'Get organization overview', description: 'Return AWS Organizations metadata and GHOST account statistics for Commercial or GovCloud.',
    inputSchema: z.object({ environment: environmentSchema }),
    handler: async args => toolSuccess({ organization: await getOrganizationInfo(args.environment), accounts: await getAccountStatistics() }, 'Organization overview loaded.', 'AWS Organizations')
  })

  read({
    name: 'ghost.organization.structure', title: 'Get organization structure', description: 'Return the cached AWS Organizations OU and account hierarchy.',
    inputSchema: z.object({ environment: environmentSchema }),
    handler: async args => toolSuccess(await getOrganizationalUnitTree(args.environment), 'Organization structure loaded.', 'AWS Organizations')
  })

  read({
    name: 'ghost.organization.governance', title: 'Get account governance', description: 'Return service control policies attached to a resolved account.',
    inputSchema: z.object({ identifier: z.string().min(1), environment: environmentSchema }),
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
    environment: environmentSchema,
    mode: z.enum(['billable', 'proforma']).default('billable'),
    account_identifiers: accountIdentifiersSchema,
    group_by: z.enum(['SERVICE', 'LINKED_ACCOUNT', 'REGION', 'NONE']).default('SERVICE'),
    granularity: z.enum(['DAILY', 'MONTHLY']).default('MONTHLY')
  })

  read({
    name: 'ghost.costs.query', title: 'Query AWS costs', description: 'Query GHOST canonical billable or proforma costs for a date range, account scope, and grouping.',
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
    name: 'ghost.costs.dashboard', title: 'Get cost dashboard', description: 'Return account and service cost totals for dashboard-style analysis.',
    inputSchema: costQuerySchema.omit({ group_by: true, granularity: true }),
    handler: async args => {
      const range = dateRange(args)
      const ids = await commercialIds(args.account_identifiers)
      const target = args.mode === 'proforma' ? process.env.AWS_PROFORMA_ACCOUNT_ID || '253821132832' : args.environment === 'commercial' ? process.env.AWS_MASTER_ACCOUNT_ID || '205950196477' : undefined
      const base = { startDate: range.startDate, endDate: range.endDate, granularity: 'MONTHLY' as const, metrics: ['UnblendedCost'], filter: buildCostFilter({ accountIds: ids.length ? ids : undefined }) }
      const [accounts, services] = await Promise.all([
        getCostAndUsage({ ...base, groupBy: [{ type: 'DIMENSION', key: 'LINKED_ACCOUNT' }] }, args.environment, target),
        getCostAndUsage({ ...base, groupBy: [{ type: 'DIMENSION', key: 'SERVICE' }] }, args.environment, target)
      ])
      return toolSuccess({ accounts: accounts.dataset, services: services.dataset }, 'Cost dashboard data loaded.', 'AWS Cost Explorer')
    }
  })

  read({
    name: 'ghost.costs.forecast', title: 'Forecast AWS costs', description: 'Return AWS Cost Explorer forecast values for an optional account scope.',
    inputSchema: z.object({ start_date: z.string(), end_date: z.string(), environment: environmentSchema, account_identifiers: accountIdentifiersSchema, granularity: z.enum(['DAILY', 'MONTHLY']).default('DAILY') }),
    handler: async args => {
      const ids = await commercialIds(args.account_identifiers)
      const result = await getCostForecast(args.start_date, args.end_date, 'UNBLENDED_COST', args.granularity, buildCostFilter({ accountIds: ids.length ? ids : undefined }), args.environment)
      return toolSuccess(result, 'Cost forecast loaded.', 'AWS Cost Explorer')
    }
  })

  read({
    name: 'ghost.costs.resources', title: 'Get resource-level costs', description: 'Return resource-level Cost Explorer data for a required account and date range.',
    inputSchema: z.object({ identifier: z.string(), start_date: z.string(), end_date: z.string(), environment: environmentSchema, granularity: z.enum(['DAILY', 'MONTHLY']).default('DAILY') }),
    handler: async args => {
      const ids = await commercialIds([args.identifier])
      if (!ids[0]) return toolError('ACCOUNT_NOT_FOUND', 'Account could not be resolved.')
      const result = await getCostAndUsageWithResources({ startDate: args.start_date, endDate: args.end_date, granularity: args.granularity, metrics: ['UnblendedCost'], filter: buildCostFilter({ accountIds: ids })! }, args.environment)
      return toolSuccess(result, 'Resource-level costs loaded.', 'AWS Cost Explorer')
    }
  })

  read({
    name: 'ghost.costs.tags', title: 'Discover cost tags', description: 'List cost-allocation tag keys or values for a date range.',
    inputSchema: z.object({ start_date: z.string(), end_date: z.string(), tag_key: z.string().optional(), environment: environmentSchema }),
    handler: async args => toolSuccess(await getCostAllocationTags({ Start: args.start_date, End: args.end_date }, args.tag_key, undefined, args.environment), 'Cost tags loaded.', 'AWS Cost Explorer')
  })

  read({
    name: 'ghost.costs.budget_vs_actual', title: 'Compare budget and actual cost', description: 'Compare canonical account actuals with GHOST account budgets for a date range.',
    inputSchema: costQuerySchema.omit({ group_by: true, granularity: true, mode: true }),
    handler: async args => {
      const range = dateRange(args)
      const ids = await commercialIds(args.account_identifiers)
      const response = await getCostAndUsage({
        startDate: range.startDate, endDate: range.endDate, granularity: 'MONTHLY', metrics: ['UnblendedCost'],
        filter: buildCostFilter({ accountIds: ids.length ? ids : undefined }),
        groupBy: [{ type: 'DIMENSION', key: 'LINKED_ACCOUNT' }]
      }, args.environment, args.environment === 'commercial' ? process.env.AWS_MASTER_ACCOUNT_ID || '205950196477' : undefined)
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
    name: 'ghost.forecasts.get', title: 'Get cost forecast', description: 'Return an AWS Cost Explorer forecast for the requested account scope and future date range.',
    inputSchema: z.object({ start_date: z.string(), end_date: z.string(), environment: environmentSchema, account_identifiers: accountIdentifiersSchema, granularity: z.enum(['DAILY', 'MONTHLY']).default('MONTHLY') }),
    handler: async args => {
      const ids = await commercialIds(args.account_identifiers)
      return toolSuccess(await getCostForecast(args.start_date, args.end_date, 'UNBLENDED_COST', args.granularity, buildCostFilter({ accountIds: ids.length ? ids : undefined }), args.environment), 'Forecast loaded.', 'AWS Cost Explorer')
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
      const event = await createEntraServiceEvent()
      const result = await queryEntraUsers(event, [], { userSearch: args.query }, { mode: 'preview', limit: args.limit })
      return toolSuccess(result, `Found ${result.records.length} user access record(s).`, 'Microsoft Graph')
    }
  })

  read({
    name: 'ghost.access.for_account', title: 'Get account access', description: 'List Entra users and AWS authorization roles mapped to one account.',
    inputSchema: z.object({ identifier: z.string(), limit: z.number().int().min(1).max(100).default(50) }),
    handler: async args => {
      const { account } = await resolveAccount(args.identifier)
      const id = account.accountId || account.awsStandardAccountID
      const result = await queryEntraUsers(await createEntraServiceEvent(), [id], {}, { mode: 'preview', limit: args.limit })
      return toolSuccess(result, `Loaded ${result.records.length} access mapping(s).`, 'Microsoft Graph')
    }
  })

  read({
    name: 'ghost.access.for_user', title: 'Get user access', description: 'List account and role mappings for one Entra user.',
    inputSchema: z.object({ user: z.string().min(1), limit: z.number().int().min(1).max(100).default(50) }),
    handler: async args => {
      const result = await queryEntraUsers(await createEntraServiceEvent(), [], { userSearch: args.user }, { mode: 'preview', limit: args.limit })
      return toolSuccess(result, `Loaded ${result.records.length} access mapping(s).`, 'Microsoft Graph')
    }
  })

  read({
    name: 'ghost.support.search', title: 'Search GHOST support knowledge',
    description: 'Retrieve cited support documentation from the isgddocs Bedrock Knowledge Base.',
    inputSchema: z.object({
      query: z.string().min(2).max(2000),
      max_results: z.number().int().min(1).max(10).default(5),
      cursor: z.string().optional()
    }),
    handler: async args => {
      const result = await searchSupportKnowledgeBase(args.query, args.max_results, args.cursor)
      return toolSuccess(result, `Retrieved ${result.results.length} support result(s).`, 'Amazon Bedrock Knowledge Bases', {
        nextCursor: result.nextToken
      })
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

  const credentialConfirmationSchema = z.object({ confirm: z.boolean() })
  credentials({
    name: 'ghost.credentials.start', title: 'Start AWS Identity Center authorization',
    description: 'Begin an AWS Identity Center device authorization for user-owned, short-lived account credentials.',
    inputSchema: z.object({ environment: z.enum(['commercial', 'govcloud']).default('commercial') }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    handler: async args => toolSuccess(
      await beginMcpIdentityCenterAuthorization(principal, args.environment),
      'Open the verification URL, complete AWS Identity Center sign-in, then request the selected role credentials.',
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
      environment: z.enum(['commercial', 'govcloud']).default('commercial')
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    getAuditTargetIds: args => [args.account_id],
    handler: async (args, context: ServerContext) => {
      const authorized = await requireMcpAccountRole(principal, args.account_id, args.role_name, args.environment)
      const confirmed = acceptedContent(context.mcpReq.inputResponses, 'confirm_credential_issue', credentialConfirmationSchema)
      const state = context.mcpReq.requestState<{ tool: string; targetId: string }>()
      const targetId = `${args.environment}:${authorized.resolvedAccountId}:${args.role_name}`
      if (!confirmed?.confirm || state?.tool !== 'ghost.credentials.issue' || state.targetId !== targetId) {
        return inputRequired({
          inputRequests: {
            confirm_credential_issue: inputRequired.elicit({
              message: `Issue short-lived ${args.environment} credentials for ${authorized.account.accountName} (${authorized.resolvedAccountId}) as ${args.role_name}?`,
              requestedSchema: credentialConfirmationSchema
            })
          },
          requestState: await confirmationCodec.mint({ tool: 'ghost.credentials.issue', targetId }, context)
        })
      }
      const credential = await issueMcpIdentityCenterCredentials(principal, args.session_id, authorized.resolvedAccountId, args.role_name)
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
    name: 'ghost.resources.search', title: 'Search AWS resources', description: 'Search AWS Config aggregate inventory across GHOST accounts with resource, region, compliance, and tag filters.',
    inputSchema: z.object({ account_identifiers: accountIdentifiersSchema, resource_types: z.array(z.string()).max(20).default([]), regions: z.array(z.string()).max(20).default([]), resource_id: z.string().optional(), resource_name: z.string().optional(), limit: z.number().int().min(1).max(100).default(25) }),
    handler: async args => {
      const ids = await commercialIds(args.account_identifiers)
      const result = await queryConfigResources(ids, { resourceTypes: args.resource_types, regions: args.regions, resourceId: args.resource_id, resourceName: args.resource_name }, { mode: 'preview', limit: args.limit })
      return toolSuccess(result, `Loaded ${result.records.length} AWS resource(s).`, 'AWS Config')
    }
  })

  read({
    name: 'ghost.instances.get', title: 'Get an EC2 instance', description: 'Find an EC2 instance in AWS Config by instance ID and optional account scope.',
    inputSchema: z.object({ instance_id: z.string().regex(/^i-[0-9a-f]{8,17}$/), account_identifiers: accountIdentifiersSchema }),
    handler: async args => {
      const result = await queryConfigResources(await commercialIds(args.account_identifiers), { resourceTypes: ['AWS::EC2::Instance'], resourceId: args.instance_id }, { mode: 'preview', limit: 10 })
      return result.records.length ? toolSuccess(result.records, `Found ${result.records.length} instance record(s).`, 'AWS Config') : toolError('INSTANCE_NOT_FOUND', 'Instance was not found in the Config aggregator.')
    }
  })

  read({
    name: 'ghost.instances.utilization', title: 'Get EC2 utilization analysis', description: 'Return the latest persisted GHOST utilization summary and bounded instance classifications for an account.',
    inputSchema: z.object({ account_id: z.string(), environment: environmentSchema, classification: z.string().optional(), limit: z.number().int().min(1).max(100).default(25) }),
    handler: async args => {
      const latest = await getLatestAnalysis(args.account_id, args.environment)
      if (!latest) return toolError('UTILIZATION_NOT_FOUND', 'No completed utilization analysis is available for this account.')
      const classifications = await getInstanceClassifications(latest.jobId, { classification: args.classification, limit: args.limit })
      return toolSuccess({ latest, classifications }, 'Utilization analysis loaded.', 'GHOST utilization analysis')
    }
  })

  read({
    name: 'ghost.security.summary', title: 'Get security summary', description: 'Return organization or account-level GHOST security posture computed from Security Hub data.',
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
    name: 'ghost.security.findings', title: 'Query security findings', description: 'Query bounded Security Hub findings across selected accounts.',
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
    name: 'ghost.support.patch_compliance', title: 'Get patch compliance', description: 'Get SSM patch compliance for an account or a specific EC2 instance.',
    inputSchema: z.object({ account_id: z.string(), instance_id: z.string().optional(), environment: environmentSchema, region: z.string().optional() }),
    handler: async args => toolSuccess(args.instance_id ? await getInstancePatchStatus(args.instance_id, args.account_id, args.environment, args.region) : await getAccountPatchCompliance(args.account_id, args.environment, args.region), 'Patch compliance loaded.', 'AWS Systems Manager')
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
    inputSchema: z.object({ pipeline_id: z.string().min(1) }),
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
    inputSchema: z.object({ problem: z.string().min(1).max(2000), account_id: z.string().optional(), environment: environmentSchema, service: z.string().optional() }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    handler: async args => {
      const response = await invokeBedrock({ prompt: `Problem: ${args.problem}\nAccount: ${args.account_id || 'not specified'}\nEnvironment: ${args.environment}\nService: ${args.service || 'not specified'}\nReturn a prioritized diagnostic plan and do not claim that any action was executed.`, model: 'claude-sonnet', maxTokens: 1800, temperature: 0.3 })
      if (!response.success) return toolError(response.error?.code || 'AI_ERROR', response.error?.message || 'Troubleshooting generation failed')
      return toolSuccess({ plan: response.content, model: response.model }, 'Troubleshooting plan generated.', 'AWS Bedrock')
    }
  })

  ai({
    name: 'ghost.ai.chat', title: 'Chat with the GHOST agent', description: 'Ask the existing GHOST Strands agent an AWS question. The downstream agent must not be configured with this GHOST MCP server.',
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
