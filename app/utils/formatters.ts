export interface FormatCurrencyOptions {
  /** Use K/M abbreviations (default: true for values >= 1000) */
  compact?: boolean
  /** Show decimal places (default: true) */
  showCents?: boolean
  /** Currency prefix (default: '$') */
  prefix?: string
  /** Use 'K'/'M' vs 'k'/'m' (default: false = lowercase) */
  uppercase?: boolean
}

/**
 * Canonical currency formatting utility.
 *
 * Supports two call signatures for backward compatibility:
 *   formatCurrency(1234)                          // compact with options
 *   formatCurrency(1234, { uppercase: true })     // compact with options
 *   formatCurrency(1234, 2)                       // legacy Intl format (decimalPlaces)
 */
export function formatCurrency(
  value: number | string | undefined,
  optionsOrDecimalPlaces?: FormatCurrencyOptions | number
): string {
  // Legacy signature: formatCurrency(value, decimalPlaces: number)
  // Used by components that relied on the old Intl.NumberFormat version
  if (typeof optionsOrDecimalPlaces === 'number') {
    const numValue = typeof value === 'number' ? value : parseFloat(String(value ?? 0))
    if (isNaN(numValue)) return '$0.00'
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: optionsOrDecimalPlaces,
      maximumFractionDigits: optionsOrDecimalPlaces
    }).format(numValue)
  }

  // New options-based signature
  const opts: FormatCurrencyOptions = optionsOrDecimalPlaces ?? {}
  const {
    compact = true,
    showCents = true,
    prefix = '$',
    uppercase = false
  } = opts

  const numValue = typeof value === 'number' ? value : parseFloat(String(value ?? 0))
  if (isNaN(numValue)) return `${prefix}0.00`

  const k = uppercase ? 'K' : 'k'
  const m = uppercase ? 'M' : 'm'
  const absValue = Math.abs(numValue)
  const sign = numValue < 0 ? '-' : ''

  if (compact && absValue >= 1_000_000) {
    return `${sign}${prefix}${(absValue / 1_000_000).toFixed(2)}${m}`
  }
  if (compact && absValue >= 1_000) {
    return `${sign}${prefix}${(absValue / 1_000).toFixed(2)}${k}`
  }

  if (showCents) {
    return `${sign}${prefix}${absValue.toFixed(2)}`
  }

  return `${sign}${prefix}${Math.round(absValue)}`
}

/**
 * Format a number as a percentage string (e.g. "45.23%").
 */
export function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`
}

export function formatNumber(value: number, decimalPlaces: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces
  }).format(value)
}
