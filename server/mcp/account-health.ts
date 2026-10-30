import { getCostAndUsage } from '../utils/cost-explorer'
import { getPeriodBudget } from '../../shared/utils/budget-utils'
import { getAccountPlansForAccount, getPipelineRunsForAccount, getPlannedVsAppliedSummary, getRecurringErrors } from '../utils/athena-pipeline-queries'
import { collectCompliance, type GhostDomainStatus } from './compliance'

function statusFromCost(actual: number, budget: number | null): GhostDomainStatus {
  if (budget === null || budget <= 0) return 'unknown'
  if (actual > budget) return 'critical'
  if (actual >= budget * 0.9) return 'warning'
  return 'healthy'
}

export async function buildAccountHealth(account: any, environment: 'commercial' | 'govcloud' = 'govcloud', options: { lookbackDays?: number } = {}) {
  const operationalId = environment === 'govcloud' ? account.govCloudAccountId || account.awsGovCloudAccountID : account.accountId || account.awsStandardAccountID
  if (!operationalId) throw new Error(`Account has no ${environment} identifier.`)
  const commercialId = account.accountId || account.awsStandardAccountID
  const now = new Date()
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const endDate = today.toISOString().slice(0, 10)
  const start = options.lookbackDays
    ? new Date(today.getTime() - options.lookbackDays * 86_400_000)
    : new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))
  const startDate = start.toISOString().slice(0, 10)
  const pipelineAccountId = account.govCloudAccountId || account.awsGovCloudAccountID
  const pipelineDays = options.lookbackDays || 30
  const [compliance, costResult, runs, plans, recurringErrors, applied] = await Promise.allSettled([
    collectCompliance(operationalId, environment, commercialId, 'summary', options.lookbackDays || 90),
    commercialId ? getCostAndUsage({ startDate, endDate, granularity: 'MONTHLY', metrics: ['UnblendedCost'], filter: { Dimensions: { Key: 'LINKED_ACCOUNT', Values: [commercialId] } } }, 'commercial', process.env.AWS_PROFORMA_ACCOUNT_ID || '253821132832') : Promise.reject(new Error('Commercial account ID unavailable for proforma cost.')),
    pipelineAccountId ? getPipelineRunsForAccount(pipelineAccountId, pipelineDays, 'govcloud', 100) : Promise.reject(new Error('GovCloud account ID unavailable for pipeline telemetry.')),
    pipelineAccountId ? getAccountPlansForAccount(pipelineAccountId, pipelineDays, 'govcloud', 500) : Promise.reject(new Error('GovCloud account ID unavailable for pipeline telemetry.')),
    pipelineAccountId ? getRecurringErrors(pipelineAccountId, pipelineDays, 'govcloud') : Promise.reject(new Error('GovCloud account ID unavailable for pipeline telemetry.')),
    pipelineAccountId ? getPlannedVsAppliedSummary(pipelineAccountId, pipelineDays, 'govcloud') : Promise.reject(new Error('GovCloud account ID unavailable for pipeline telemetry.'))
  ])
  const domainFailure = (source: string, reason: unknown) => ({ status: 'unknown' as GhostDomainStatus, evidence: null, source, queriedAt: new Date().toISOString(), remediation: String(reason) })
  const domains = compliance.status === 'fulfilled' ? {
    vulnerabilityPosture: { ...compliance.value.vulnerability, window: { type: 'snapshot', observedAt: compliance.value.vulnerability.observedAt } },
    securityHubControls: { ...compliance.value.securityHubControls, window: { type: 'lookback', days: options.lookbackDays || 90, startDate, endDate } },
    configCompliance: { ...compliance.value.config, window: { type: 'snapshot', observedAt: compliance.value.config.observedAt } },
    patchCompliance: { ...compliance.value.patch, window: { type: 'snapshot', observedAt: compliance.value.patch.observedAt } }
  } : {
    vulnerabilityPosture: domainFailure('AWS Inspector', compliance.reason), securityHubControls: domainFailure('AWS Security Hub', compliance.reason), configCompliance: domainFailure('AWS Config', compliance.reason), patchCompliance: domainFailure('AWS Systems Manager', compliance.reason)
  }
  const budget = getPeriodBudget(account, startDate, endDate)
  const actual = costResult.status === 'fulfilled' ? costResult.value.dataset.reconciliation.authoritativeTotal : 0
  const ownershipMissing = { primary: !account.primaryAccountAdminUsername, delegate: !account.delegateAccountAdminUsername, costManager: !account.costManagerUsername }
  const latestRun = runs.status === 'fulfilled' ? runs.value[0] : undefined
  const pipelineEvidence = plans.status === 'fulfilled' && recurringErrors.status === 'fulfilled' && applied.status === 'fulfilled'
    ? { latestRun, planCount: plans.value.length, recurringErrors: recurringErrors.value.length, unappliedChanges: applied.value.totalPending }
    : null
  return {
    account: { name: account.name || account.projectName, commercialAccountId: commercialId, govCloudAccountId: account.govCloudAccountId || account.awsGovCloudAccountID },
    environment,
    domains: {
      ...domains,
      proformaBudgetVariance: costResult.status === 'fulfilled' ? { status: statusFromCost(actual, budget.periodBudget), source: 'AWS Billing Conductor and GHOST budgets', queriedAt: new Date().toISOString(), window: { type: 'range', startDate, endDate }, evidence: { actual, budget: budget.periodBudget, variance: budget.periodBudget === null ? null : actual - budget.periodBudget, budgetSource: budget.source }, remediation: budget.periodBudget === null ? 'Configure an account budget before evaluating variance.' : undefined } : domainFailure('AWS Billing Conductor', costResult.reason),
      ownershipMetadata: { status: ownershipMissing.primary ? 'critical' : ownershipMissing.delegate || ownershipMissing.costManager ? 'warning' : 'healthy', source: 'GHOST account metadata', queriedAt: new Date().toISOString(), window: { type: 'snapshot' }, evidence: ownershipMissing, remediation: 'Populate the missing ownership assignment fields.' },
      pipelineHealth: pipelineEvidence ? { status: latestRun?.status === 'failure' || latestRun?.status === 'partial_failure' ? 'critical' : pipelineEvidence.unappliedChanges || pipelineEvidence.recurringErrors ? 'warning' : latestRun ? 'healthy' : 'unknown', source: 'Athena pipeline telemetry', queriedAt: new Date().toISOString(), window: { type: 'lookback', days: pipelineDays, startDate, endDate }, evidence: pipelineEvidence, remediation: pipelineEvidence.unappliedChanges ? 'Review unapplied pipeline changes and recurring errors.' : undefined } : domainFailure('Athena pipeline telemetry', [plans, recurringErrors, applied].find(result => result.status === 'rejected')?.reason)
    }
  }
}
