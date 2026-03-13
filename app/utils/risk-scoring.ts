export interface RiskResult {
  riskScore: number
  riskLevel: string
  riskColor: string
}

/**
 * Calculate a normalized risk score from overage values relative to the max across a set of accounts.
 * Uses 70% weight on percentage overage and 30% weight on absolute dollar impact.
 */
export function calculateRiskScore(
  normalizedPercent: number,
  normalizedAmount: number
): number {
  return (normalizedPercent * 0.7) + (normalizedAmount * 0.3)
}

/**
 * Map a risk score (0-100) to a risk level and color.
 * Accounts with no overage can be explicitly marked as "Good" via the noOverage flag.
 */
export function getRiskLevel(score: number, noOverage = false): RiskResult {
  if (noOverage) {
    return { riskScore: score, riskLevel: 'Good', riskColor: 'green' }
  }
  if (score >= 80) {
    return { riskScore: score, riskLevel: 'Critical', riskColor: 'red' }
  }
  if (score >= 60) {
    return { riskScore: score, riskLevel: 'High', riskColor: 'orange' }
  }
  if (score >= 40) {
    return { riskScore: score, riskLevel: 'Medium', riskColor: 'yellow' }
  }
  if (score >= 20) {
    return { riskScore: score, riskLevel: 'Low', riskColor: 'blue' }
  }
  return { riskScore: score, riskLevel: 'Good', riskColor: 'green' }
}

/**
 * Compute normalized risk scores for an array of items.
 * Mutates each item by assigning riskScore, riskLevel, and riskColor.
 *
 * @param items - Array of items to score
 * @param getOveragePercent - Accessor for the overage percentage value
 * @param getOverageAmount - Accessor for the overage dollar amount
 * @param isNoOverage - Optional predicate to mark items as having no overage (returns "Good")
 */
export function assignRiskScores<T>(
  items: T[],
  getOveragePercent: (item: T) => number,
  getOverageAmount: (item: T) => number,
  assign: (item: T, result: RiskResult) => void,
  isNoOverage?: (item: T) => boolean
): void {
  if (items.length === 0) return

  const maxPercent = Math.max(...items.map(getOveragePercent), 1)
  const maxAmount = Math.max(...items.map(getOverageAmount), 1)

  items.forEach(item => {
    const normalizedPercent = (getOveragePercent(item) / maxPercent) * 100
    const normalizedAmount = (getOverageAmount(item) / maxAmount) * 100
    const score = calculateRiskScore(normalizedPercent, normalizedAmount)
    const noOverage = isNoOverage ? isNoOverage(item) : false
    const result = getRiskLevel(score, noOverage)
    assign(item, result)
  })
}
