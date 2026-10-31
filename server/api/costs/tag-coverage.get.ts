/**
 * GET /api/costs/tag-coverage
 * Calculate tag coverage (tagged vs untagged costs) per account for a given tag key
 */

import { defineEventHandler, getQuery } from 'h3'
import { getCostAndUsage, getProformaCosts } from '../../utils/cost-explorer'
import { sendSuccess, parseQueryParams, validateEnvironment, errors, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { parseAndValidateAccountFilters, getAccountIdsFromCriteria } from '../../utils/account-filters'
import { getAccountScopeCacheKey } from '../../utils/cache-keys'
import { costCache, CacheTags } from '../../utils/cache-manager'
import { validateDateParams, type RelativePeriod } from '../../utils/date-helpers'
import { logger } from '../../utils/logger'
import { getAllAccountsUnified } from '../../utils/accounts-consolidated'
import { buildTagCoverageData, extractProformaAccountPeriodTotals, extractProformaAccountTotals, shapeTagCoverageData } from '../../utils/cost-tag-analysis'

// Register OpenAPI documentation
registerEndpoint('/api/costs/tag-coverage', 'GET', {
  summary: 'Get tag coverage analysis',
  description: 'Calculate tagged vs untagged cost coverage per account for a specific tag key',
  tags: ['Costs'],
  parameters: [
    { $ref: '#/components/parameters/Environment' },
    {
      name: 'tagKey',
      in: 'query',
      required: true,
      schema: { type: 'string' },
      description: 'The tag key to analyze coverage for (e.g. "Environment", "Project")'
    },
    {
      name: 'startDate',
      in: 'query',
      required: false,
      schema: { type: 'string', format: 'date' },
      description: 'Inclusive start date (YYYY-MM-DD). Must be paired with endDate.'
    },
    {
      name: 'endDate',
      in: 'query',
      required: false,
      schema: { type: 'string', format: 'date' },
      description: 'Exclusive end date (YYYY-MM-DD). Must be paired with startDate.'
    },
    {
      name: 'period',
      in: 'query',
      required: false,
      schema: {
        type: 'string',
        enum: ['last7days', 'last30days', 'last90days', 'thisMonth', 'lastMonth', 'thisQuarter', 'lastQuarter', 'thisYear', 'lastYear', 'ytd', 'last12months']
      },
      description: 'Relative date period; defaults to last90days when no dates are supplied. Cannot be used with startDate/endDate.'
    },
    {
      name: 'accountIds',
      in: 'query',
      required: false,
      schema: { type: 'string' },
      description: 'Comma-separated list of account identifiers to filter'
    },
    {
      name: 'linesOfBusiness',
      in: 'query',
      required: false,
      schema: { type: 'string' },
      description: 'Comma-separated list of lines of business to filter accounts'
    },
    {
      name: 'departments',
      in: 'query',
      required: false,
      schema: { type: 'string' },
      description: 'Comma-separated list of department numbers to filter accounts'
    },
    {
      name: 'includeValues',
      in: 'query',
      required: false,
      schema: { type: 'boolean', default: false },
      description: 'Include tag-value totals'
    },
    {
      name: 'includeAccounts',
      in: 'query',
      required: false,
      schema: { type: 'boolean', default: true },
      description: 'Include per-account contributions for returned tag values'
    },
    {
      name: 'valueGroupKey',
      in: 'query',
      required: false,
      schema: { type: 'string' },
      description: 'Return one normalized tag value from values[].groupKey. Requires includeValues=true. Coverage and scope totals remain for the entire tag key.'
    },
    {
      name: 'proforma',
      in: 'query',
      required: false,
      schema: { type: 'boolean', default: false },
      description: 'Include account-and-month weighted proforma estimates (commercial only). Estimates are not suitable for chargeback; inspect proformaEstimation.available before using them.'
    }
  ],
  responses: {
    200: {
      description: 'Tag coverage data per account',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  tagKey: { type: 'string' },
                  costMetric: { type: 'string', enum: ['UnblendedCost'] },
                  accounts: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        accountId: { type: 'string' },
                        accountName: { type: 'string' },
                        taggedCost: { type: 'number' },
                        untaggedCost: { type: 'number' },
                        positiveTaggedCost: { type: 'number' },
                        positiveUntaggedCost: { type: 'number' },
                        coveragePercent: { type: 'number', description: 'Percentage of positive charges that are tagged.' },
                        estimatedProformaTaggedCost: { type: 'number' },
                        estimatedProformaUntaggedCost: { type: 'number' }
                      }
                    }
                  },
                  totalTaggedCost: { type: 'number' },
                  totalUntaggedCost: { type: 'number' },
                  signedTotalCost: { type: 'number', description: 'Total tagged and untagged costs, including credits.' },
                  positiveTaggedCost: { type: 'number' },
                  positiveUntaggedCost: { type: 'number' },
                  overallCoverage: { type: 'number', description: 'Percentage of positive charges that are tagged.' },
                  estimatedProformaTaggedCost: { type: 'number' },
                  estimatedProformaUntaggedCost: { type: 'number' },
                  values: {
                    type: 'array',
                    description: 'Included when includeValues=true',
                    items: {
                      type: 'object',
                      properties: {
                        groupKey: { type: 'string' },
                        tagValue: { type: 'string' },
                        displayName: { type: 'string' },
                        isUntagged: { type: 'boolean' },
                        isPerson: { type: 'boolean' },
                        creatorType: { type: 'string', enum: ['email', 'iam-user', 'automation', 'service', 'root', 'untagged'] },
                        rawValues: { type: 'array', items: { type: 'string' } },
                        billableCost: { type: 'number' },
                        estimatedProformaCost: { type: 'number' },
                        accountCount: { type: 'integer', description: 'Contributing account count when includeAccounts=false.' },
                        accounts: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              accountId: { type: 'string' },
                              accountName: { type: 'string' },
                              billableCost: { type: 'number' },
                              estimatedProformaCost: { type: 'number' },
                              rawValues: { type: 'array', items: { type: 'string' } }
                            }
                          }
                        }
                      }
                    }
                  },
                  proformaEstimation: {
                    type: 'object',
                    properties: {
                      requested: { type: 'boolean' },
                      available: { type: 'boolean' },
                      method: { type: 'string' },
                      unavailableAccountIds: { type: 'array', items: { type: 'string' } }
                    }
                  }
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

export default defineEventHandler(handleAsync(async (event) => {
  const startTime = Date.now()
  const query = getQuery(event)
  const { environment } = parseQueryParams(event)

  if (!validateEnvironment(environment)) {
    return errors.badRequest(event, 'environment must be commercial or govcloud')
  }

  // tagKey is required
  const tagKey = query.tagKey
  if (typeof tagKey !== 'string' || !tagKey.trim()) {
    return errors.badRequest(event, 'tagKey must be a non-empty string')
  }
  for (const name of ['includeValues', 'includeAccounts', 'proforma'] as const) {
    const value = query[name]
    if (value !== undefined && ![true, false, 'true', 'false'].includes(value as string | boolean)) {
      return errors.badRequest(event, `${name} must be true or false`)
    }
  }
  if (query.valueGroupKey !== undefined && (typeof query.valueGroupKey !== 'string' || !query.valueGroupKey)) {
    return errors.badRequest(event, 'valueGroupKey must be a non-empty string')
  }

  // Validate date parameters — default to last 90 days if none provided
  let dateRange: { startDate: string; endDate: string; description?: string }
  try {
    const hasAnyDateParam = query.startDate || query.endDate || query.period
    dateRange = validateDateParams({
      startDate: query.startDate as string,
      endDate: query.endDate as string,
      period: (hasAnyDateParam ? query.period : 'last90days') as RelativePeriod
    })
  } catch (error) {
    return errors.badRequest(event, (error as Error).message)
  }

  const { startDate, endDate } = dateRange
  // UnblendedCost, the Cost Explorer console default and the metric every other
  // cost view and drill-down uses, so a tag value totals the same everywhere.
  const costMetric = 'UnblendedCost' as const
  const includeValues = query.includeValues === 'true' || query.includeValues === true
  const includeAccounts = query.includeAccounts !== 'false' && query.includeAccounts !== false
  const valueGroupKey = typeof query.valueGroupKey === 'string' ? query.valueGroupKey : undefined
  const proforma = query.proforma === 'true' || query.proforma === true
  const proformaAccountId = (query.proformaAccountId as string) || process.env.AWS_PROFORMA_ACCOUNT_ID || '253821132832'
  const masterAccountId = (query.masterAccountId as string) || process.env.AWS_MASTER_ACCOUNT_ID || '205950196477'

  if (valueGroupKey && !includeValues) {
    return errors.badRequest(event, 'valueGroupKey requires includeValues=true')
  }
  if (proforma && environment !== 'commercial') {
    return errors.badRequest(event, 'Proforma data analysis is only available for commercial environment')
  }
  if (proforma && (!/^\d{12}$/.test(proformaAccountId) || !/^\d{12}$/.test(masterAccountId))) {
    return errors.badRequest(event, 'Proforma and master account IDs must be 12 digits')
  }
  if (proforma && proformaAccountId === masterAccountId) {
    return errors.badRequest(event, 'Proforma and master account IDs cannot be the same')
  }

  // Parse and validate account filters
  const { criteria: accountFilters, errors: filterErrors } = parseAndValidateAccountFilters(query)
  if (filterErrors.length > 0) {
    return errors.badRequest(event, `Invalid account filters: ${filterErrors.join('; ')}`)
  }

  const filteredAccountIds = (accountFilters.accountIds || accountFilters.linesOfBusiness || accountFilters.departments)
    ? await getAccountIdsFromCriteria(accountFilters)
    : undefined

  if (filteredAccountIds !== undefined && filteredAccountIds.length === 0) {
    return errors.notFound(event, 'No accounts found matching the specified filters')
  }

  const accountFilter = filteredAccountIds && filteredAccountIds.length > 0
    ? { Dimensions: { Key: 'LINKED_ACCOUNT', Values: filteredAccountIds, MatchOptions: ['EQUALS'] } }
    : undefined

  const cacheKey = `costs:tag-coverage:${JSON.stringify({
    tagKey,
    costMetric,
    startDate,
    endDate,
    environment,
    includeValues,
    proforma,
    proformaAccountId: proforma ? proformaAccountId : null,
    masterAccountId: proforma ? masterAccountId : null,
    accountScope: getAccountScopeCacheKey(filteredAccountIds)
  })}`

  // Read before getOrSet: afterwards the entry always exists.
  const cacheHit = costCache.isFresh(cacheKey)
  const result = await costCache.getOrSet(
    cacheKey,
    async () => {
      logger.info(`Cache miss: Fetching tag coverage for tag key "${tagKey}"...`)

      // Single query with 2 GroupBy dimensions: LINKED_ACCOUNT + TAG
      // AWS returns ALL costs — untagged resources appear with empty-string tag value
      const taggedDataPromise = getCostAndUsage({
        startDate,
        endDate,
        granularity: 'MONTHLY',
        metrics: [costMetric],
        groupBy: [
          { type: 'DIMENSION', key: 'LINKED_ACCOUNT' },
          { type: 'TAG', key: tagKey }
        ],
        filter: accountFilter
      }, environment)

      const proformaDataPromise = proforma
        ? getProformaCosts({
            startDate,
            endDate,
            granularity: 'MONTHLY',
            metrics: [costMetric],
            groupBy: [{ type: 'DIMENSION', key: 'LINKED_ACCOUNT' }],
            filter: accountFilter
          }, proformaAccountId, masterAccountId, costMetric)
        : Promise.resolve(null)

      const [taggedResult, proformaResult] = await Promise.allSettled([
        taggedDataPromise,
        proformaDataPromise
      ] as const)

      if (taggedResult.status === 'rejected') throw taggedResult.reason
      if (proformaResult.status === 'rejected') {
        logger.warn(`Could not calculate proforma estimates for tag "${tagKey}"; returning billable data`, proformaResult.reason)
      }

      // Resolve account names
      const accountNameMap = new Map<string, string>()
      try {
        const allAccounts = await getAllAccountsUnified(true)
        for (const acc of allAccounts) {
          if (!acc.name) continue
          if (acc.accountId) accountNameMap.set(acc.accountId, acc.name)
          if (acc.awsStandardAccountID) accountNameMap.set(acc.awsStandardAccountID, acc.name)
        }
      } catch (err) {
        logger.warn('Could not resolve account names for tag coverage:', err)
      }

      const proformaAccountTotals = proformaResult.status === 'fulfilled' && proformaResult.value
        ? extractProformaAccountTotals(proformaResult.value)
        : undefined
      const proformaAccountPeriodTotals = proformaResult.status === 'fulfilled' && proformaResult.value
        ? extractProformaAccountPeriodTotals(proformaResult.value)
        : undefined

      return buildTagCoverageData(tagKey, taggedResult.value.resultsByTime || [], {
        includeValues,
        accountNames: accountNameMap,
        costMetric,
        proformaRequested: proforma,
        proformaAccountTotals,
        proformaAccountPeriodTotals
      })
    },
    {
      ttl: 1800, // 30 minutes — coverage data is relatively stable
      tags: [CacheTags.COSTS, environment, 'tag-coverage']
    }
  )

  const cacheInfo = costCache.getEntryInfo(cacheKey)
  const cacheStats = costCache.getStats()

  return sendSuccess(event, shapeTagCoverageData(result, { includeAccounts, valueGroupKey }), {
    cache: {
      hit: cacheHit,
      age: cacheInfo?.age || null,
      ttl: cacheInfo?.ttl || null,
      hitRate: `${cacheStats.hitRate.toFixed(1)}%`
    },
    performance: { responseTimeMs: Date.now() - startTime },
    dateRange: { startDate, endDate, description: dateRange.description || null }
  })
}))
