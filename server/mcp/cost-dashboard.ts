export type ProjectionAvailability = 'available' | 'unavailable' | 'not_applicable'

export interface McpCostDashboardAccountInput {
  accountId: string
  accountName: string
  periodSpend: number
  currentMonthSpend?: number
  completedMonthsSpend?: number
  periodBudget: number | null
  paceToDateBudget: number | null
  budgetSource: 'pep-monthly' | 'estimated-monthly' | 'unavailable'
  annualBudget: number
}

export interface McpCostDashboardService {
  service: string
  spend: number
}

export interface BuildMcpCostDashboardInput {
  mode: 'billable' | 'proforma'
  environment: 'commercial' | 'govcloud'
  period: { startDate: string; endDate: string; description?: string }
  accountIdentifiers: string[]
  resolvedAccountIds: string[]
  accounts: McpCostDashboardAccountInput[]
  services: McpCostDashboardService[]
  previousMonthMtd: number | null
  previousMonthFull: number | null
  projectionAvailability: ProjectionAvailability
  projectionReason?: string
  currentMonthRemainderForecast?: number
  futureMonthsForecast?: number
  dayOfMonth: number
}

function sum(values: Array<number | null | undefined>): number {
  return values.reduce<number>((total, value) => total + (Number.isFinite(value) ? Number(value) : 0), 0)
}

function percentage(value: number, total: number | null): number | null {
  return total && total > 0 ? (value / total) * 100 : null
}

function budgetHealth(utilization: number | null): 'on_track' | 'near_budget' | 'over_budget' | 'unavailable' {
  if (utilization === null) return 'unavailable'
  if (utilization > 100) return 'over_budget'
  if (utilization > 80) return 'near_budget'
  return 'on_track'
}

export function buildMcpCostDashboard(input: BuildMcpCostDashboardInput) {
  const periodSpend = sum(input.accounts.map(account => account.periodSpend))
  const periodBudget = sum(input.accounts.map(account => account.periodBudget))
  const paceToDateBudget = sum(input.accounts.map(account => account.paceToDateBudget))
  const hasPeriodBudget = input.accounts.some(account => account.periodBudget !== null)
  const hasPaceBudget = input.accounts.some(account => account.paceToDateBudget !== null)
  const currentMonthSpend = sum(input.accounts.map(account => account.currentMonthSpend))
  const completedMonthsSpend = sum(input.accounts.map(account => account.completedMonthsSpend))
  const annualBudget = sum(input.accounts.map(account => account.annualBudget))
  const remainderForecast = input.currentMonthRemainderForecast ?? null
  const futureForecast = input.futureMonthsForecast ?? null
  const projectionsAvailable = input.projectionAvailability === 'available' && remainderForecast !== null && futureForecast !== null
  const endOfMonthProjection = projectionsAvailable ? currentMonthSpend + remainderForecast : null
  const yearEndProjection = projectionsAvailable
    ? completedMonthsSpend + currentMonthSpend + remainderForecast + futureForecast
    : null

  const accounts = input.accounts
    .map(account => {
      const currentSpend = account.currentMonthSpend ?? 0
      const share = currentMonthSpend > 0 ? currentSpend / currentMonthSpend : null
      const currentMonthRemainderForecast = projectionsAvailable && share !== null ? remainderForecast * share : null
      const futureMonthsForecast = projectionsAvailable && share !== null ? futureForecast * share : null
      const projectedMonthEnd = currentMonthRemainderForecast === null ? null : currentSpend + currentMonthRemainderForecast
      const projectedYearEnd = projectedMonthEnd === null || futureMonthsForecast === null
        ? null
        : (account.completedMonthsSpend || 0) + projectedMonthEnd + futureMonthsForecast
      const utilization = percentage(account.periodSpend, account.periodBudget)
      const paceUtilization = percentage(account.periodSpend, account.paceToDateBudget)

      return {
        accountId: account.accountId,
        accountName: account.accountName,
        periodSpend: account.periodSpend,
        currentMonthSpend: currentSpend,
        completedMonthsSpend: account.completedMonthsSpend ?? 0,
        periodBudget: account.periodBudget,
        paceToDateBudget: account.paceToDateBudget,
        budgetSource: account.budgetSource,
        utilizationPercent: utilization,
        paceUtilizationPercent: paceUtilization,
        varianceToBudget: account.periodBudget === null ? null : account.periodSpend - account.periodBudget,
        varianceToPaceBudget: account.paceToDateBudget === null ? null : account.periodSpend - account.paceToDateBudget,
        dailyBurnRate: input.dayOfMonth > 0 ? currentSpend / input.dayOfMonth : null,
        annualBudget: account.annualBudget || null,
        forecastAllocation: {
          method: 'proportional_to_current_month_spend' as const,
          currentMonthSpendShare: share,
          currentMonthRemainderForecast,
          projectedMonthEnd,
          futureMonthsForecast,
          projectedYearEnd,
          yearEndVarianceToAnnualBudget: projectedYearEnd === null || !account.annualBudget
            ? null
            : projectedYearEnd - account.annualBudget
        }
      }
    })
    .sort((left, right) => right.periodSpend - left.periodSpend)

  const currentMonthUtilization = percentage(currentMonthSpend, hasPeriodBudget ? periodBudget : null)
  return {
    scope: {
      mode: input.mode,
      environment: input.environment,
      period: input.period,
      requestedAccountIdentifiers: input.accountIdentifiers,
      resolvedCommercialAccountIds: input.resolvedAccountIds,
      accountCount: input.accounts.length
    },
    summary: {
      periodSpend,
      periodBudget: hasPeriodBudget ? periodBudget : null,
      paceToDateBudget: hasPaceBudget ? paceToDateBudget : null,
      currentMonthSpend,
      dailyBurnRate: input.dayOfMonth > 0 ? currentMonthSpend / input.dayOfMonth : null,
      currentMonthUtilizationPercent: currentMonthUtilization,
      currentMonthBudgetHealth: budgetHealth(currentMonthUtilization),
      previousMonthMtd: input.previousMonthMtd,
      previousMonthFull: input.previousMonthFull,
      percentChangeFromPreviousMonthMtd: input.previousMonthMtd === null || input.previousMonthMtd === 0
        ? null
        : ((currentMonthSpend - input.previousMonthMtd) / input.previousMonthMtd) * 100
    },
    projections: {
      availability: input.projectionAvailability,
      reason: input.projectionReason,
      endOfMonth: {
        currentMonthActual: currentMonthSpend,
        remainingForecast: remainderForecast,
        projectedTotal: endOfMonthProjection
      },
      yearEnd: {
        completedMonthsActual: completedMonthsSpend,
        currentMonthActual: currentMonthSpend,
        currentMonthRemainderForecast: remainderForecast,
        futureMonthsForecast: futureForecast,
        projectedTotal: yearEndProjection,
        annualBudget: annualBudget || null,
        varianceToAnnualBudget: yearEndProjection === null || !annualBudget ? null : yearEndProjection - annualBudget
      }
    },
    methodology: {
      periodSpend: 'Observed AWS Cost Explorer spend for the requested period and account scope.',
      endOfMonthProjection: 'Current month actual spend plus the AWS Cost Explorer forecast for the remaining days of the month.',
      yearEndProjection: 'Completed-month actuals plus current month actuals, the current-month forecast remainder, and AWS Cost Explorer forecasts for remaining calendar months.',
      accountForecastAllocation: 'Aggregate forecast values are allocated by each account’s current-month spend share; these account-level projections are estimates, not direct AWS per-account forecasts.'
    },
    accounts,
    services: [...input.services].sort((left, right) => right.spend - left.spend)
  }
}
