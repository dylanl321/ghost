/**
 * Cost Validation Utilities
 *
 * Validates API responses against direct AWS Cost Explorer queries
 * Used by the admin panel validation feature
 */

import { getCostAndUsage, getProformaCosts } from './cost-explorer'
import { getRelativeDateRange, type RelativePeriod } from './date-helpers'
import type { CostExplorerParams } from '../types'

const TOLERANCE = 1.0 // $1.00 tolerance for comparisons

export interface ValidationTest {
  name: string
  passed: boolean
  message: string
  details: {
    awsValue: number
    apiValue: number
    difference: number
    tolerance: number
  }
}

export interface AccountComparison {
  accountId: string
  accountName: string
  awsBillable: number
  apiBillable: number
  awsProforma: number
  apiProforma: number
  billableDifference: number
  proformaDifference: number
  billableMatch: boolean
  proformaMatch: boolean
  notes: string
}

export interface CostValidationResult {
  timestamp: string
  dateRange: {
    startDate: string
    endDate: string
    description: string
    period?: string
  }
  environment: 'commercial' | 'govcloud'
  tests: ValidationTest[]
  accountComparisons: AccountComparison[]
  summary: {
    totalTests: number
    passed: number
    failed: number
    overallStatus: 'PASS' | 'FAIL'
  }
  metadata: {
    masterAccountId: string
    proformaAccountId: string
    totalAccounts: number
  }
}

/**
 * Helper to check if two values match within tolerance
 */
function isWithinTolerance(val1: number, val2: number, tolerance: number = TOLERANCE): boolean {
  return Math.abs(val1 - val2) <= tolerance
}

/**
 * Format currency for display
 */
function formatCurrency(value: number): string {
  return `$${value.toFixed(2)}`
}

/**
 * Validate billable API against AWS
 * Compares direct AWS query with enhanced cost data (same as API)
 */
export async function validateBillableApi(
  startDate: string,
  endDate: string,
  environment: 'commercial' | 'govcloud'
): Promise<ValidationTest> {
  // Get raw AWS data
  const awsResponse = await getCostAndUsage({
    startDate,
    endDate,
    granularity: 'MONTHLY',
    metrics: ['UnblendedCost', 'UsageQuantity'],
    groupBy: [{
      type: 'DIMENSION',
      key: 'LINKED_ACCOUNT'
    }]
  }, environment)

  const awsTotal = parseFloat(awsResponse.total?.UnblendedCost?.Amount || '0')

  // Get enhanced API data (same as what the API would return)
  const { enhanceCostData } = await import('./cost-explorer')
  const apiData = await enhanceCostData(awsResponse, false, 'LINKED_ACCOUNT')
  const apiTotal = apiData.summary.totalCost

  const difference = Math.abs(awsTotal - apiTotal)
  const passed = isWithinTolerance(awsTotal, apiTotal)

  return {
    name: 'Billable API Accuracy',
    passed,
    message: passed
      ? `✓ API matches AWS within ${formatCurrency(TOLERANCE)}: AWS=${formatCurrency(awsTotal)}, API=${formatCurrency(apiTotal)}`
      : `✗ API does not match AWS: AWS=${formatCurrency(awsTotal)}, API=${formatCurrency(apiTotal)}, Difference=${formatCurrency(difference)}`,
    details: {
      awsValue: awsTotal,
      apiValue: apiTotal,
      difference,
      tolerance: TOLERANCE
    }
  }
}

/**
 * Validate proforma API against AWS
 * Compares direct AWS query with enhanced cost data (same as API)
 */
export async function validateProformaApi(
  startDate: string,
  endDate: string,
  environment: 'commercial' | 'govcloud',
  masterAccountId: string,
  proformaAccountId: string
): Promise<ValidationTest[]> {
  // Get raw AWS proforma data
  const awsProformaData = await getProformaCosts({
    startDate,
    endDate,
    granularity: 'MONTHLY',
    metrics: ['UnblendedCost', 'UsageQuantity'],
    groupBy: [{
      type: 'DIMENSION',
      key: 'LINKED_ACCOUNT'
    }]
  }, proformaAccountId, masterAccountId)

  const awsBillableTotal = awsProformaData.billable.total
  const awsProformaTotal = awsProformaData.proforma.total
  const awsUnallocated = awsProformaData.masterAccount.unallocatedCost

  // Get enhanced API data (same as what the API would return)
  const { enhanceCostData } = await import('./cost-explorer')
  const billableEnhanced = await enhanceCostData(awsProformaData.billable.costs, false, 'LINKED_ACCOUNT')
  const proformaEnhanced = await enhanceCostData(awsProformaData.proforma.costs, false, 'LINKED_ACCOUNT')

  const apiBillableTotal = billableEnhanced.summary.totalCost
  const apiProformaTotal = proformaEnhanced.summary.totalCost
  const apiUnallocated = awsProformaData.masterAccount.unallocatedCost

  const billableDiff = Math.abs(awsBillableTotal - apiBillableTotal)
  const proformaDiff = Math.abs(awsProformaTotal - apiProformaTotal)
  const unallocatedDiff = Math.abs(awsUnallocated - apiUnallocated)

  const billablePassed = isWithinTolerance(awsBillableTotal, apiBillableTotal)
  const proformaPassed = isWithinTolerance(awsProformaTotal, apiProformaTotal)
  const unallocatedPassed = isWithinTolerance(awsUnallocated, apiUnallocated)

  return [
    {
      name: 'Proforma API - Billable Total',
      passed: billablePassed,
      message: billablePassed
        ? `✓ Billable matches: AWS=${formatCurrency(awsBillableTotal)}, API=${formatCurrency(apiBillableTotal)}`
        : `✗ Billable mismatch: AWS=${formatCurrency(awsBillableTotal)}, API=${formatCurrency(apiBillableTotal)}, Difference=${formatCurrency(billableDiff)}`,
      details: {
        awsValue: awsBillableTotal,
        apiValue: apiBillableTotal,
        difference: billableDiff,
        tolerance: TOLERANCE
      }
    },
    {
      name: 'Proforma API - Proforma Total',
      passed: proformaPassed,
      message: proformaPassed
        ? `✓ Proforma matches: AWS=${formatCurrency(awsProformaTotal)}, API=${formatCurrency(apiProformaTotal)}`
        : `✗ Proforma mismatch: AWS=${formatCurrency(awsProformaTotal)}, API=${formatCurrency(apiProformaTotal)}, Difference=${formatCurrency(proformaDiff)}`,
      details: {
        awsValue: awsProformaTotal,
        apiValue: apiProformaTotal,
        difference: proformaDiff,
        tolerance: TOLERANCE
      }
    },
    {
      name: 'Proforma API - Unallocated Cost',
      passed: unallocatedPassed,
      message: unallocatedPassed
        ? `✓ Unallocated matches: AWS=${formatCurrency(awsUnallocated)}, API=${formatCurrency(apiUnallocated)}`
        : `✗ Unallocated mismatch: AWS=${formatCurrency(awsUnallocated)}, API=${formatCurrency(apiUnallocated)}, Difference=${formatCurrency(unallocatedDiff)}`,
      details: {
        awsValue: awsUnallocated,
        apiValue: apiUnallocated,
        difference: unallocatedDiff,
        tolerance: TOLERANCE
      }
    }
  ]
}

/**
 * Generate account-level comparison data
 */
export async function generateAccountComparisons(
  startDate: string,
  endDate: string,
  environment: 'commercial' | 'govcloud',
  masterAccountId: string,
  proformaAccountId: string,
  includeProforma: boolean = true
): Promise<AccountComparison[]> {
  // Get AWS data
  const costParams: CostExplorerParams = {
    startDate,
    endDate,
    granularity: 'MONTHLY',
    metrics: ['UnblendedCost', 'UsageQuantity'],
    groupBy: [{
      type: 'DIMENSION',
      key: 'LINKED_ACCOUNT'
    }]
  }

  let awsBillableData
  let awsProformaData
  let billableEnhanced
  let proformaEnhanced

  const { enhanceCostData } = await import('./cost-explorer')

  if (includeProforma) {
    awsProformaData = await getProformaCosts(costParams, proformaAccountId, masterAccountId)
    awsBillableData = awsProformaData.billable.costs

    // Get enhanced data (same as API)
    billableEnhanced = await enhanceCostData(awsBillableData, false, 'LINKED_ACCOUNT')
    proformaEnhanced = await enhanceCostData(awsProformaData.proforma.costs, false, 'LINKED_ACCOUNT')
  } else {
    awsBillableData = await getCostAndUsage(costParams, environment)
    billableEnhanced = await enhanceCostData(awsBillableData, false, 'LINKED_ACCOUNT')
  }

  // Build comparison map
  const comparisons: AccountComparison[] = []
  const accountMap = new Map<string, AccountComparison>()

  // Process AWS billable data
  awsBillableData.resultsByTime?.forEach((result: any) => {
    result.Groups?.forEach((group: any) => {
      const accountId = group.Keys?.[0]
      if (accountId) {
        const cost = parseFloat(group.Metrics?.UnblendedCost?.Amount || '0')
        if (!accountMap.has(accountId)) {
          accountMap.set(accountId, {
            accountId,
            accountName: 'Unknown',
            awsBillable: cost,
            apiBillable: 0,
            awsProforma: 0,
            apiProforma: 0,
            billableDifference: 0,
            proformaDifference: 0,
            billableMatch: false,
            proformaMatch: false,
            notes: ''
          })
        } else {
          const existing = accountMap.get(accountId)!
          existing.awsBillable += cost
        }
      }
    })
  })

  // Process AWS proforma data if available
  if (includeProforma && awsProformaData) {
    awsProformaData.proforma.costs.resultsByTime?.forEach((result: any) => {
      result.Groups?.forEach((group: any) => {
        const accountId = group.Keys?.[0]
        if (accountId) {
          const cost = parseFloat(group.Metrics?.UnblendedCost?.Amount || '0')
          const existing = accountMap.get(accountId)
          if (existing) {
            existing.awsProforma += cost
          } else {
            accountMap.set(accountId, {
              accountId,
              accountName: 'Unknown',
              awsBillable: 0,
              apiBillable: 0,
              awsProforma: cost,
              apiProforma: 0,
              billableDifference: 0,
              proformaDifference: 0,
              billableMatch: false,
              proformaMatch: false,
              notes: ''
            })
          }
        }
      })
    })
  }

  // Process API billable data (from enhanced cost data)
  billableEnhanced.accounts?.forEach((account: any) => {
    const accountId = account.accountId
    const existing = accountMap.get(accountId)
    if (existing) {
      existing.apiBillable = account.totalCost
      existing.accountName = account.accountName || 'Unknown'
    } else {
      accountMap.set(accountId, {
        accountId,
        accountName: account.accountName || 'Unknown',
        awsBillable: 0,
        apiBillable: account.totalCost,
        awsProforma: 0,
        apiProforma: 0,
        billableDifference: 0,
        proformaDifference: 0,
        billableMatch: false,
        proformaMatch: false,
        notes: ''
      })
    }
  })

  // Process API proforma data if available (from enhanced cost data)
  if (includeProforma && proformaEnhanced) {
    proformaEnhanced.accounts?.forEach((account: any) => {
      const accountId = account.accountId
      const existing = accountMap.get(accountId)
      if (existing) {
        existing.apiProforma = account.totalCost
      } else {
        accountMap.set(accountId, {
          accountId,
          accountName: account.accountName || 'Unknown',
          awsBillable: 0,
          apiBillable: 0,
          awsProforma: 0,
          apiProforma: account.totalCost,
          billableDifference: 0,
          proformaDifference: 0,
          billableMatch: false,
          proformaMatch: false,
          notes: ''
        })
      }
    })
  }

  // Calculate differences and matches
  accountMap.forEach((account, accountId) => {
    account.billableDifference = account.apiBillable - account.awsBillable
    account.proformaDifference = account.apiProforma - account.awsProforma
    account.billableMatch = isWithinTolerance(account.awsBillable, account.apiBillable)
    account.proformaMatch = includeProforma
      ? isWithinTolerance(account.awsProforma, account.apiProforma)
      : true

    // Add notes for mismatches
    const notes: string[] = []
    if (!account.billableMatch) {
      notes.push('Billable mismatch')
    }
    if (includeProforma && !account.proformaMatch) {
      notes.push('Proforma mismatch')
    }
    if (accountId === masterAccountId && !includeProforma) {
      notes.push('Master account')
    }
    if (accountId === proformaAccountId) {
      notes.push('Proforma account')
    }
    account.notes = notes.join('; ')

    comparisons.push(account)
  })

  // Sort by billable cost descending
  comparisons.sort((a, b) => b.awsBillable - a.awsBillable)

  return comparisons
}

/**
 * Run complete validation suite
 */
export async function runValidation(
  period: RelativePeriod,
  environment: 'commercial' | 'govcloud',
  includeProforma: boolean,
  masterAccountId: string = '205950196477',
  proformaAccountId: string = '253821132832'
): Promise<CostValidationResult> {
  const { startDate, endDate, description } = getRelativeDateRange(period)
  const tests: ValidationTest[] = []

  // Test 1: Billable API
  const billableTest = await validateBillableApi(startDate, endDate, environment)
  tests.push(billableTest)

  // Test 2-4: Proforma API (if enabled)
  if (includeProforma) {
    const proformaTests = await validateProformaApi(
      startDate,
      endDate,
      environment,
      masterAccountId,
      proformaAccountId
    )
    tests.push(...proformaTests)
  }

  // Generate account comparisons
  const accountComparisons = await generateAccountComparisons(
    startDate,
    endDate,
    environment,
    masterAccountId,
    proformaAccountId,
    includeProforma
  )

  // Calculate summary
  const passed = tests.filter(t => t.passed).length
  const failed = tests.filter(t => !t.passed).length

  return {
    timestamp: new Date().toISOString(),
    dateRange: {
      startDate,
      endDate,
      description,
      period
    },
    environment,
    tests,
    accountComparisons,
    summary: {
      totalTests: tests.length,
      passed,
      failed,
      overallStatus: failed === 0 ? 'PASS' : 'FAIL'
    },
    metadata: {
      masterAccountId,
      proformaAccountId,
      totalAccounts: accountComparisons.length
    }
  }
}

/**
 * Generate CSV report from validation results
 */
export function generateCsvReport(result: CostValidationResult): string {
  const lines: string[] = []

  // Header
  lines.push('Account ID,Account Name,AWS Billable,API Billable,AWS Proforma,API Proforma,Billable Difference,Proforma Difference,Billable Match,Proforma Match,Notes')

  // Account rows
  result.accountComparisons.forEach(account => {
    lines.push([
      account.accountId,
      `"${account.accountName}"`,
      account.awsBillable.toFixed(2),
      account.apiBillable.toFixed(2),
      account.awsProforma.toFixed(2),
      account.apiProforma.toFixed(2),
      account.billableDifference.toFixed(2),
      account.proformaDifference.toFixed(2),
      account.billableMatch ? 'YES' : 'NO',
      account.proformaMatch ? 'YES' : 'NO',
      `"${account.notes}"`
    ].join(','))
  })

  // Summary section
  lines.push('')
  lines.push('=== SUMMARY ===')
  lines.push('')
  lines.push('Metric,Value')
  lines.push(`Total Tests,${result.summary.totalTests}`)
  lines.push(`Tests Passed,${result.summary.passed}`)
  lines.push(`Tests Failed,${result.summary.failed}`)
  lines.push(`Overall Status,${result.summary.overallStatus}`)

  // Metadata section
  lines.push('')
  lines.push('=== METADATA ===')
  lines.push('')
  lines.push('Field,Value')
  lines.push(`Date Range,"${result.dateRange.startDate} to ${result.dateRange.endDate}"`)
  lines.push(`Period,"${result.dateRange.period || 'Custom'}"`)
  lines.push(`Environment,"${result.environment}"`)
  lines.push(`Generated At,"${result.timestamp}"`)
  lines.push(`Master Account ID,${result.metadata.masterAccountId}`)
  lines.push(`Proforma Account ID,${result.metadata.proformaAccountId}`)
  lines.push(`Total Accounts,${result.metadata.totalAccounts}`)

  return lines.join('\n')
}
