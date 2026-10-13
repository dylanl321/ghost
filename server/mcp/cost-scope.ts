import { validateDateParams, type RelativePeriod } from '../utils/date-helpers'
import { McpInputError, resolveOperationalScope } from './tool-input'

export type McpCostEnvironment = 'commercial' | 'govcloud'
export type McpCostMode = 'billable' | 'proforma'

export interface ResolvedCostScope {
  environment: McpCostEnvironment
  mode: McpCostMode
  organizationWide: boolean
  linkedAccountIds: string[]
  metadataCommercialAccountIds: string[]
  payerAccountId: string
  accounts: Awaited<ReturnType<typeof resolveOperationalScope>>['accounts']
}

export async function resolveCostScope(input: {
  identifiers?: unknown
  environment: McpCostEnvironment
  mode: McpCostMode
  requireAccount?: boolean
}): Promise<ResolvedCostScope> {
  if (input.mode === 'proforma' && input.environment !== 'commercial') {
    throw new McpInputError('INVALID_COST_MODE', 'Proforma costs are available only in Commercial.')
  }
  const scope = await resolveOperationalScope(input.identifiers, input.environment, { requireAccount: input.requireAccount })
  return buildResolvedCostScope(scope, input.environment, input.mode)
}

export function buildResolvedCostScope(
  scope: Awaited<ReturnType<typeof resolveOperationalScope>>,
  environment: McpCostEnvironment,
  mode: McpCostMode
): ResolvedCostScope {
  if (mode === 'proforma' && environment !== 'commercial') {
    throw new McpInputError('INVALID_COST_MODE', 'Proforma costs are available only in Commercial.')
  }
  const payerAccountId = mode === 'proforma'
    ? process.env.AWS_PROFORMA_ACCOUNT_ID || '253821132832'
    : environment === 'commercial'
      ? process.env.AWS_MASTER_ACCOUNT_ID || process.env.AWS_COMMERCIAL_ORGANIZATIONS_ACCOUNT_ID || '205950196477'
      : process.env.AWS_GOVCLOUD_MASTER_ACCOUNT_ID || process.env.AWS_GOVCLOUD_ORGANIZATIONS_ACCOUNT_ID || ''
  if (!payerAccountId) throw new McpInputError('COST_PAYER_NOT_CONFIGURED', `No ${environment} payer account is configured.`)
  return {
    environment,
    mode,
    organizationWide: scope.organizationWide,
    linkedAccountIds: scope.operationalAccountIds,
    metadataCommercialAccountIds: scope.commercialAccountIds,
    payerAccountId,
    accounts: scope.accounts
  }
}

export function normalizeCostDateRange(input: {
  start_date?: string
  end_date?: string
  period?: RelativePeriod
  maximumDays?: number
}) {
  const range = validateDateParams({ startDate: input.start_date, endDate: input.end_date, period: input.period })
  const days = (Date.parse(`${range.endDate}T00:00:00Z`) - Date.parse(`${range.startDate}T00:00:00Z`)) / 86_400_000
  if (input.maximumDays && days > input.maximumDays) {
    throw new McpInputError('COST_RANGE_TOO_LARGE', `This cost query supports at most ${input.maximumDays} days.`, {
      maximumDays: input.maximumDays,
      requestedDays: days
    })
  }
  return range
}

export function normalizeCostForecastRange(input: { start_date: string; end_date: string; maximumDays?: number }, now = new Date()) {
  const range = normalizeCostDateRange(input)
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString().slice(0, 10)
  if (range.startDate < today) throw new McpInputError('INVALID_FORECAST_RANGE', 'Forecast start_date cannot be before today.', { today })
  return range
}

export function costScopeMetadata(scope: ResolvedCostScope) {
  return {
    environment: scope.environment,
    mode: scope.mode,
    organizationWide: scope.organizationWide,
    resolvedLinkedAccountIds: scope.linkedAccountIds,
    metadataCommercialAccountIds: scope.metadataCommercialAccountIds,
    payerAccountId: scope.payerAccountId,
    accounts: scope.accounts
  }
}
