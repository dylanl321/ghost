/**
 * GET /api/support/cost-anomalies
 * Retrieve cost anomalies from AWS Cost Explorer
 */

import { defineEventHandler, getQuery } from 'h3'
import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { getCostExplorerClient } from '../../lib/aws-client-factory'
import { lookupAccountUnified, getAllAccountsUnified } from '../../utils/accounts-consolidated'
import { logger } from '../../utils/logger'
import { registerEndpoint } from '../../plugins/swagger'
import type { AWSEnvironmentType } from '../../types'
import {
  GetAnomaliesCommand,
  type Anomaly,
  type AnomalyDateInterval
} from '@aws-sdk/client-cost-explorer'

interface CostAnomaly {
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
  rootCauses: Array<{
    service?: string
    region?: string
    usageType?: string
    linkedAccount?: string
  }>
}

interface CostAnomaliesResponse {
  accountId?: string
  environment: AWSEnvironmentType
  timeRange: {
    start: string
    end: string
  }
  summary: {
    totalAnomalies: number
    ongoingAnomalies: number
    resolvedAnomalies: number
    totalImpact: number
    highestImpact: number
    mostImpactedService?: string
  }
  anomalies: CostAnomaly[]
  recommendations: string[]
}

registerEndpoint('/api/support/cost-anomalies', 'GET', {
  summary: 'Get cost anomalies',
  description: 'Retrieve cost anomalies detected by AWS Cost Explorer Anomaly Detection',
  tags: ['Support Tools', 'Costs'],
  parameters: [
    {
      name: 'accountId',
      in: 'query',
      required: false,
      schema: { type: 'string' },
      description: 'Filter by specific account ID'
    },
    {
      name: 'environment',
      in: 'query',
      required: false,
      schema: { type: 'string', enum: ['commercial', 'govcloud'] },
      description: 'AWS environment (default: commercial - anomaly detection is primarily in commercial)'
    },
    {
      name: 'daysBack',
      in: 'query',
      required: false,
      schema: { type: 'integer', minimum: 1, maximum: 90 },
      description: 'Number of days to look back (default: 30)'
    },
    {
      name: 'limit',
      in: 'query',
      required: false,
      schema: { type: 'integer', minimum: 1, maximum: 100 },
      description: 'Maximum anomalies to return (default: 50)'
    }
  ],
  responses: {
    200: {
      description: 'Cost anomalies',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  summary: { type: 'object' },
                  anomalies: { type: 'array' },
                  recommendations: { type: 'array', items: { type: 'string' } }
                }
              }
            }
          }
        }
      }
    },
    400: { $ref: '#/components/schemas/Error' },
    500: { $ref: '#/components/schemas/Error' }
  }
})

/**
 * Parse anomaly data from AWS response
 */
function parseAnomaly(anomaly: Anomaly, accountNameMap: Map<string, string>): CostAnomaly {
  const actualSpend = parseFloat(anomaly.Impact?.TotalActualSpend || '0')
  const expectedSpend = parseFloat(anomaly.Impact?.TotalExpectedSpend || '0')
  const impact = parseFloat(anomaly.Impact?.TotalImpact || '0')
  const impactPercentage = expectedSpend > 0 ? ((actualSpend - expectedSpend) / expectedSpend) * 100 : 0

  // Extract root cause information
  const rootCauses = (anomaly.RootCauses || []).map(rc => ({
    service: rc.Service,
    region: rc.Region,
    usageType: rc.UsageType,
    linkedAccount: rc.LinkedAccount
  }))

  // Try to get account info from root causes
  const linkedAccount = rootCauses.find(rc => rc.linkedAccount)?.linkedAccount
  const service = rootCauses.find(rc => rc.service)?.service
  const region = rootCauses.find(rc => rc.region)?.region

  return {
    anomalyId: anomaly.AnomalyId || '',
    accountId: linkedAccount,
    accountName: linkedAccount ? accountNameMap.get(linkedAccount) : undefined,
    service,
    region,
    startDate: anomaly.AnomalyStartDate || '',
    endDate: anomaly.AnomalyEndDate,
    actualSpend,
    expectedSpend,
    impact: Math.abs(impact),
    impactPercentage: Math.round(impactPercentage * 100) / 100,
    status: anomaly.AnomalyEndDate ? 'RESOLVED' : 'ONGOING',
    rootCauses
  }
}

export default defineEventHandler(handleAsync(async (event) => {
  const queryParams = getQuery(event)
  const accountId = queryParams.accountId as string | undefined
  const environment = (queryParams.environment as AWSEnvironmentType) || 'commercial'
  const daysBack = Math.min(parseInt(queryParams.daysBack as string) || 30, 90)
  const limit = Math.min(parseInt(queryParams.limit as string) || 50, 100)

  // Validate environment
  if (environment !== 'commercial' && environment !== 'govcloud') {
    return errors.badRequest(event, 'Environment must be "commercial" or "govcloud"')
  }

  logger.info(`[Cost Anomalies] Account: ${accountId || 'all'}, Days: ${daysBack}, Environment: ${environment}`)

  try {
    // Build date range
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - daysBack)

    const dateInterval: AnomalyDateInterval = {
      StartDate: startDate.toISOString().split('T')[0],
      EndDate: endDate.toISOString().split('T')[0]
    }

    // Get Cost Explorer client (from org account for commercial)
    const orgAccountId = process.env.AWS_COMMERCIAL_ORGANIZATIONS_ACCOUNT_ID
    const client = await getCostExplorerClient(environment, undefined, orgAccountId)

    // Get anomalies
    const command = new GetAnomaliesCommand({
      DateInterval: dateInterval,
      MaxResults: limit
    })

    const response = await client.send(command)
    const rawAnomalies = response.Anomalies || []

    // Get account names for mapping
    const accounts = await getAllAccountsUnified(false)
    const accountNameMap = new Map(
      accounts.map(acc => [acc.accountId, acc.name || acc.projectName || acc.accountId])
    )

    // Parse and optionally filter anomalies
    let anomalies = rawAnomalies.map(a => parseAnomaly(a, accountNameMap))

    // Filter by account if specified
    if (accountId) {
      anomalies = anomalies.filter(a =>
        a.accountId === accountId ||
        a.rootCauses.some(rc => rc.linkedAccount === accountId)
      )
    }

    // Sort by impact (highest first)
    anomalies.sort((a, b) => b.impact - a.impact)

    // Calculate summary
    const summary = {
      totalAnomalies: anomalies.length,
      ongoingAnomalies: anomalies.filter(a => a.status === 'ONGOING').length,
      resolvedAnomalies: anomalies.filter(a => a.status === 'RESOLVED').length,
      totalImpact: Math.round(anomalies.reduce((sum, a) => sum + a.impact, 0) * 100) / 100,
      highestImpact: anomalies.length > 0 ? anomalies[0].impact : 0,
      mostImpactedService: undefined as string | undefined
    }

    // Find most impacted service
    const serviceImpacts = new Map<string, number>()
    for (const anomaly of anomalies) {
      if (anomaly.service) {
        serviceImpacts.set(
          anomaly.service,
          (serviceImpacts.get(anomaly.service) || 0) + anomaly.impact
        )
      }
    }

    if (serviceImpacts.size > 0) {
      let maxImpact = 0
      for (const [service, impact] of serviceImpacts) {
        if (impact > maxImpact) {
          maxImpact = impact
          summary.mostImpactedService = service
        }
      }
    }

    // Generate recommendations
    const recommendations: string[] = []

    if (summary.ongoingAnomalies > 0) {
      recommendations.push(`${summary.ongoingAnomalies} anomaly(ies) are currently ongoing - investigate immediately`)
    }

    if (summary.totalImpact > 1000) {
      recommendations.push(`Total anomaly impact is $${summary.totalImpact.toFixed(2)} - review affected accounts`)
    }

    if (summary.mostImpactedService) {
      recommendations.push(`${summary.mostImpactedService} has the highest anomaly impact - check for unusual usage`)
    }

    const highImpactAnomalies = anomalies.filter(a => a.impact > 100)
    if (highImpactAnomalies.length > 0) {
      recommendations.push(`${highImpactAnomalies.length} anomaly(ies) have impact over $100 - prioritize investigation`)
    }

    // Account-specific recommendations
    const accountsWithAnomalies = new Set(anomalies.filter(a => a.accountId).map(a => a.accountId))
    if (accountsWithAnomalies.size > 3) {
      recommendations.push(`Anomalies detected across ${accountsWithAnomalies.size} accounts - review organization-wide spending`)
    }

    if (anomalies.length === 0) {
      recommendations.push('No cost anomalies detected in the specified time range')
    }

    const responseData: CostAnomaliesResponse = {
      accountId,
      environment,
      timeRange: {
        start: dateInterval.StartDate!,
        end: dateInterval.EndDate!
      },
      summary,
      anomalies,
      recommendations
    }

    logger.info(`[Cost Anomalies] Found ${summary.totalAnomalies} anomalies with total impact $${summary.totalImpact}`)

    return sendSuccess(event, responseData)

  } catch (error: any) {
    logger.error('[Cost Anomalies] Error:', error)

    // Handle specific errors
    if (error.name === 'LimitExceededException') {
      return errors.serverError(event, 'API rate limit exceeded. Please try again later.')
    }

    if (error.name === 'AccessDeniedException') {
      return errors.serverError(event, 'Access denied to Cost Explorer Anomaly Detection', {
        hint: 'Ensure the IAM role has ce:GetAnomalies permission'
      })
    }

    return errors.serverError(event, error.message || 'Failed to get cost anomalies')
  }
}))
