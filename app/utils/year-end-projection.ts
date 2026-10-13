export function accountMatchesScope(account: any, scope: Set<string>): boolean {
  if (scope.size === 0) return true
  return [
    account?.accountId,
    account?.awsStandardAccountID,
    account?.awsCommercialAccountID,
    account?.awsGovCloudAccountID
  ].some(id => id && scope.has(id))
}

export function resolveCurrentMonthProjection(options: {
  displayedCurrentSpend?: number
  timeframe: string
  currentMonthData: any
  mode: string
  accountScope: Set<string>
  remainderForecast: number
}): { actual: number, remainder: number, projectedTotal: number } {
  const { displayedCurrentSpend, timeframe, currentMonthData, mode, accountScope } = options
  // The displayed spend is only a current-month actual in the This Month view.
  // For YTD (or any other timeframe), derive the actual from the dedicated monthly summary.
  const useDisplayedSpend = timeframe === 'thisMonth' && Number.isFinite(displayedCurrentSpend)
  let actual = useDisplayedSpend ? displayedCurrentSpend! : 0

  if (!useDisplayedSpend) {
    const modeData = mode === 'proforma' && currentMonthData?.proforma
      ? currentMonthData.proforma
      : currentMonthData
    const accounts = Array.isArray(modeData?.accounts) ? modeData.accounts : []
    actual = accounts
      .filter((account: any) => accountMatchesScope(account, accountScope))
      .reduce((sum: number, account: any) => sum + Number(account.totalCost || 0), 0)
  }

  const remainder = Math.max(0, Number(options.remainderForecast) || 0)
  return { actual, remainder, projectedTotal: actual + remainder }
}

export function getCurrentMonthForecastRemainder(projectedTotal: number, actual: number): number {
  return Math.max(0, projectedTotal - actual)
}
