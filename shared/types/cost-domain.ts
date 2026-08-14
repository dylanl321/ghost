export type CostSource = 'billable' | 'proforma'

export type CostMetric = 'UnblendedCost'

export interface CostAmount {
  amount: number
  unit: string
}

export interface CostGroup {
  keys: string[]
  metrics: Record<string, CostAmount>
}

export interface CostPeriod {
  start: string
  end: string
  total: Record<string, CostAmount>
  groups: CostGroup[]
  estimated: boolean
}

export interface Reconciliation {
  authoritativeTotal: number
  groupedTotal: number
  delta: number
  reconciled: boolean
}

export interface CostDataset {
  source: CostSource
  billingDomain: CostSource
  accountId: string
  metric: CostMetric
  granularity: 'DAILY' | 'MONTHLY' | 'HOURLY'
  startDate: string
  endDate: string
  dataThroughDate: string | null
  estimated: boolean
  empty: boolean
  periods: CostPeriod[]
  reconciliation: Reconciliation
}

export interface PeriodBudgetMetrics {
  periodBudget: number | null
  paceToDateBudget: number | null
  actualSpend: number
  projectedSpend: number | null
  variance: number | null
  variancePercent: number | null
  healthBasis: 'aws-forecast' | 'pace' | 'unavailable'
  budgetSource: 'pep-monthly' | 'estimated-monthly' | 'unavailable'
}

export interface CostDashboardAccount extends PeriodBudgetMetrics {
  accountId: string
  accountName?: string
  actualSpend: number
}

export interface CostDashboardResponse {
  mode: CostSource
  actuals: CostDataset
  accounts: CostDashboardAccount[]
  services: Array<{ service: string; cost: number }>
  comparisons: {
    currentMtd: number
    previousMonthMtd: number | null
    previousMonthFull: number | null
    percentChange: number | null
  }
  budget: PeriodBudgetMetrics & { accountsWithBudget: number }
  forecast: null
  warnings: string[]
}
