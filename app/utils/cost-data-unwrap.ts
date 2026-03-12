import type { NormalizedDataset, AwsResultsByTime } from '~/types/costs'

/**
 * Utilities for unwrapping nested AWS cost data from API responses.
 *
 * The API can return data in several wrapper shapes depending on the endpoint
 * and whether the response goes through a caching layer. These helpers
 * normalise the various nesting levels (`.data`, `.proforma`, `.rawData`, etc.)
 * so each chart extractor doesn't have to repeat the same boilerplate.
 */

// ---------------------------------------------------------------------------
// Core unwrap – strips the `.data` wrapper that some API responses include
// ---------------------------------------------------------------------------

/**
 * Unwrap an API response field from a dataset.
 *
 * Many API responses arrive wrapped in `{ data: { … } }`. This helper
 * returns the inner payload regardless of whether the wrapper is present.
 *
 * @param dataset  The normalised dataset
 * @param field    Which dataset field to read (e.g. 'summary', 'analysis', 'services', 'forecast')
 * @returns        The unwrapped data object, or `null` if the field is missing
 */
export function unwrapCostData(
  dataset: NormalizedDataset,
  field: 'summary' | 'analysis' | 'services' | 'forecast' | 'historical' | 'extendedForecast' | 'ytdSummary' | 'lastMonthSummary' | 'orgWideHistorical' | 'currentMonthOrgWide' | 'yearEndForecast' | 'lastMonthServices',
): any {
  const raw = (dataset as any)[field]
  if (!raw) return null
  return raw?.data ?? raw
}

// ---------------------------------------------------------------------------
// resultsByTime extraction
// ---------------------------------------------------------------------------

/**
 * Resolve the `resultsByTime` array from a dataset field, handling:
 *  - proforma mode  →  `actualData.proforma.rawData.resultsByTime`
 *  - proforma mode  →  `actualData.proforma.resultsByTime` (services endpoint)
 *  - billable mode  →  `actualData.rawData.resultsByTime`
 *  - direct         →  `actualData.resultsByTime`
 *
 * @param dataset   The normalised dataset
 * @param field     Which dataset field to extract from ('summary', 'services', etc.)
 * @returns         A flat `any[]` – never `undefined`
 */
export function getResultsByTime(
  dataset: NormalizedDataset,
  field: 'summary' | 'services' | 'historical' | 'forecast' | 'extendedForecast' | 'orgWideHistorical' | 'yearEndForecast' | 'lastMonthServices',
): AwsResultsByTime[] {
  const actualData = unwrapCostData(dataset, field)
  if (!actualData) return []

  const isProforma = dataset.mode === 'proforma'

  if (isProforma) {
    // Canonical path — server endpoints now normalize proforma.resultsByTime directly
    if (actualData?.proforma?.resultsByTime) {
      return actualData.proforma.resultsByTime
    }
    // Legacy: remove once all endpoints normalize proforma nesting
    if (actualData?.proforma?.rawData?.resultsByTime) {
      return actualData.proforma.rawData.resultsByTime
    }
  }

  // Standard billable paths
  if (actualData?.rawData?.resultsByTime) {
    return actualData.rawData.resultsByTime
  }
  if (actualData?.resultsByTime) {
    return actualData.resultsByTime
  }

  return []
}

// ---------------------------------------------------------------------------
// Analysis helpers
// ---------------------------------------------------------------------------

/**
 * Extract the per-account budget-analysis array from the analysis dataset
 * field.  This is the most common way chart extractors consume analysis data.
 *
 * @param dataset  The normalised dataset
 * @returns        `budgetAnalysis.byAccount` array, or `[]`
 */
export function getAccountsFromAnalysis(dataset: NormalizedDataset): any[] {
  const actualData = unwrapCostData(dataset, 'analysis')
  if (!actualData) return []
  return actualData?.budgetAnalysis?.byAccount ?? []
}

/**
 * Extract the analysis summary object (contains `totalBudget`, `totalActual`, etc.).
 *
 * @param dataset  The normalised dataset
 * @returns        The summary sub-object or `null`
 */
export function getAnalysisSummary(dataset: NormalizedDataset): any {
  const actualData = unwrapCostData(dataset, 'analysis')
  if (!actualData) return null
  return actualData?.summary ?? actualData?.budgetAnalysis?.summary ?? null
}

// ---------------------------------------------------------------------------
// Mode-aware unwrap – resolves billable/proforma wrapper
// ---------------------------------------------------------------------------

/**
 * Unwrap a raw API payload that may contain `{ billable, proforma }` keys,
 * selecting the branch that matches `mode`.
 *
 * Fallback order: `raw[mode]` → `raw.billable` → `raw` itself.
 *
 * @param raw   The raw (possibly `.data`-wrapped) payload
 * @param mode  `'billable'` or `'proforma'`
 */
export function unwrapByMode(raw: any, mode: string): any {
  const unwrapped = raw?.data ?? raw
  if (!unwrapped) return null
  if (unwrapped.billable || unwrapped.proforma) {
    return unwrapped[mode] || unwrapped.billable || unwrapped
  }
  return unwrapped
}

// ---------------------------------------------------------------------------
// Account-to-group mapping
// ---------------------------------------------------------------------------

/**
 * Build a `Map<accountId, groupLabel>` from an accounts array.
 *
 * Every known ID variant (`accountId`, `awsStandardAccountID`,
 * `awsCommercialAccountID`, `awsGovCloudAccountID`) is mapped so that
 * lookups work regardless of which ID shape a cost bucket uses.
 *
 * @param accounts       The accounts list (from `dataset.accountsList`)
 * @param groupField     Primary field to read the group label from (e.g. `'linesOfBusiness'`)
 * @param fallbackField  Optional secondary field (e.g. `'lineOfBusiness'`)
 */
export function buildAccountToGroupMap(
  accounts: any[],
  groupField: string,
  fallbackField?: string,
): Map<string, string> {
  const map = new Map<string, string>()
  for (const acc of accounts) {
    const group = acc[groupField] || (fallbackField ? acc[fallbackField] : null) || 'Unknown'
    const ids = [
      acc.accountId,
      acc.awsStandardAccountID,
      acc.awsCommercialAccountID,
      acc.awsGovCloudAccountID,
    ].filter(Boolean)
    for (const id of ids) map.set(id as string, group)
  }
  return map
}

// ---------------------------------------------------------------------------
// Forecast total extraction
// ---------------------------------------------------------------------------

/**
 * Pull the numeric "total forecast" value from the various nesting shapes
 * returned by the AWS forecast endpoints.
 *
 * Handles `{ forecast: { total: { Amount } } }` (object) as well as
 * `{ forecast: { total: 12345 } }` (plain number / stringified number).
 */
export function extractForecastTotal(forecastData: any): number {
  const total = forecastData?.forecast?.total
  if (!total) return 0
  if (total.Amount) return parseFloat(total.Amount)
  if (typeof total === 'number') return total
  return parseFloat(String(total)) || 0
}
