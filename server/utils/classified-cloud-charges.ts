/**
 * Classified Cloud Charges for DE158
 *
 * Monthly actuals for the classified cloud environment, which is not accessible
 * via Cost Explorer or Billing Conductor. Values are supplied directly by Finance
 * and must be updated each month.
 *
 * Keys use CE invoicing month format: YYYY-MM-01 (e.g. "2026-01-01" = January 2026 invoice).
 * No monthly plan is tracked — Finance does not provide a budget for this environment.
 */
export const CLASSIFIED_CLOUD_CHARGES_2026: Record<string, number> = {
  '2026-01-01': 5666.52,  // January 2026 — Secret Cloud
  '2026-02-01': 5857.82,  // February 2026 — Secret Cloud
  '2026-03-01': 5323.06,  // March 2026 — Secret Cloud
  '2026-04-01': 5696.12,  // April 2026 — Secret Cloud
  '2026-05-01': 5429.77,  // May 2026 — Secret Cloud
  '2026-06-01': 5589.59,  // June 2026 — Secret Cloud
  '2026-07-01': 5429.56,  // July 2026 — Secret Cloud
}
