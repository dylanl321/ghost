import { GetAnomaliesCommand, type Anomaly, type AnomalyDateInterval } from '@aws-sdk/client-cost-explorer'
import { getCostExplorerClient } from '../lib/aws-client-factory'
import { getAllAccountsUnified } from './accounts-consolidated'

export interface CostAnomalyRecord {
  anomalyId: string
  accountId?: string
  accountName?: string
  service?: string
  region?: string
  startDate: string
  endDate?: string
  actualSpend: number
  expectedSpend: number
  impact: number
  impactPercentage: number
  status: 'ONGOING' | 'RESOLVED'
  rootCauses: Array<{ service?: string; region?: string; usageType?: string; linkedAccount?: string }>
}

export function parseCostAnomaly(anomaly: Anomaly, accountNameMap: Map<string, string>): CostAnomalyRecord {
  const actualSpend = Number(anomaly.Impact?.TotalActualSpend || 0)
  const expectedSpend = Number(anomaly.Impact?.TotalExpectedSpend || 0)
  const impact = Number(anomaly.Impact?.TotalImpact || 0)
  const rootCauses = (anomaly.RootCauses || []).map(cause => ({
    service: cause.Service,
    region: cause.Region,
    usageType: cause.UsageType,
    linkedAccount: cause.LinkedAccount
  }))
  const accountId = rootCauses.find(cause => cause.linkedAccount)?.linkedAccount
  return {
    anomalyId: anomaly.AnomalyId || '',
    accountId,
    accountName: accountId ? accountNameMap.get(accountId) : undefined,
    service: rootCauses.find(cause => cause.service)?.service,
    region: rootCauses.find(cause => cause.region)?.region,
    startDate: anomaly.AnomalyStartDate || '',
    endDate: anomaly.AnomalyEndDate,
    actualSpend,
    expectedSpend,
    impact: Math.abs(impact),
    impactPercentage: expectedSpend > 0 ? Math.round(((actualSpend - expectedSpend) / expectedSpend) * 10_000) / 100 : 0,
    status: anomaly.AnomalyEndDate ? 'RESOLVED' : 'ONGOING',
    rootCauses
  }
}

export async function queryCostAnomalies(input: {
  environment: 'commercial' | 'govcloud'
  accountId?: string
  daysBack?: number
  limit?: number
  cursor?: string
  now?: Date
}) {
  const daysBack = Math.max(1, Math.min(input.daysBack || 30, 90))
  const limit = Math.max(1, Math.min(input.limit || 50, 100))
  const end = input.now || new Date()
  const start = new Date(end.getTime() - daysBack * 86_400_000)
  const dateInterval: AnomalyDateInterval = { StartDate: start.toISOString().slice(0, 10), EndDate: end.toISOString().slice(0, 10) }
  const payerAccountId = input.environment === 'commercial'
    ? process.env.AWS_MASTER_ACCOUNT_ID || process.env.AWS_COMMERCIAL_ORGANIZATIONS_ACCOUNT_ID
    : process.env.AWS_GOVCLOUD_MASTER_ACCOUNT_ID || process.env.AWS_GOVCLOUD_ORGANIZATIONS_ACCOUNT_ID
  const client = await getCostExplorerClient(input.environment, undefined, payerAccountId)
  const accounts = await getAllAccountsUnified(false)
  const names = new Map<string, string>()
  for (const account of accounts) {
    const name = account.name || account.projectName || account.accountName || account.accountId || 'Unknown account'
    for (const id of [account.accountId, account.awsStandardAccountID, account.govCloudAccountId, account.awsGovCloudAccountID]) if (id) names.set(id, name)
  }

  const anomalies: CostAnomalyRecord[] = []
  let nextToken = input.cursor
  let pages = 0
  do {
    const response = await client.send(new GetAnomaliesCommand({ DateInterval: dateInterval, MaxResults: Math.min(100, limit), NextPageToken: nextToken }))
    const records = (response.Anomalies || []).map(anomaly => parseCostAnomaly(anomaly, names))
      .filter(anomaly => !input.accountId || anomaly.accountId === input.accountId || anomaly.rootCauses.some(cause => cause.linkedAccount === input.accountId))
    anomalies.push(...records.slice(0, limit - anomalies.length))
    nextToken = response.NextPageToken
    pages++
  } while (nextToken && anomalies.length < limit && pages < 10)

  anomalies.sort((left, right) => right.impact - left.impact || left.anomalyId.localeCompare(right.anomalyId))
  const serviceImpacts = new Map<string, number>()
  for (const anomaly of anomalies) if (anomaly.service) serviceImpacts.set(anomaly.service, (serviceImpacts.get(anomaly.service) || 0) + anomaly.impact)
  const mostImpactedService = [...serviceImpacts].sort((left, right) => right[1] - left[1])[0]?.[0]
  const summary = {
    totalAnomalies: anomalies.length,
    returnedAnomalies: anomalies.length,
    ongoingAnomalies: anomalies.filter(anomaly => anomaly.status === 'ONGOING').length,
    resolvedAnomalies: anomalies.filter(anomaly => anomaly.status === 'RESOLVED').length,
    totalImpact: Math.round(anomalies.reduce((sum, anomaly) => sum + anomaly.impact, 0) * 100) / 100,
    highestImpact: anomalies[0]?.impact || 0,
    mostImpactedService
  }
  const recommendations: string[] = []
  if (summary.ongoingAnomalies) recommendations.push(`${summary.ongoingAnomalies} anomaly(ies) are ongoing and should be investigated.`)
  if (summary.totalImpact > 1000) recommendations.push(`Returned anomaly impact exceeds $1,000.`)
  if (mostImpactedService) recommendations.push(`${mostImpactedService} has the highest returned anomaly impact.`)
  if (!anomalies.length) recommendations.push('No matching anomalies were returned for the observed window.')
  return {
    accountId: input.accountId,
    environment: input.environment,
    observedWindow: { start: dateInterval.StartDate!, end: dateInterval.EndDate!, daysBack },
    timeRange: { start: dateInterval.StartDate!, end: dateInterval.EndDate! },
    summary,
    anomalies,
    recommendations,
    confidence: { source: 'AWS Cost Anomaly Detection', exhaustive: !nextToken, pagesScanned: pages },
    nextCursor: nextToken
  }
}
