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

export interface FormatTimeAgoOptions {
  /** Returned when the value is missing or not a valid date (default: '') */
  empty?: string
}

/**
 * Canonical relative-time formatting ("just now", "5m ago", "3h ago", "2d ago", "in 4h").
 * Anything a week or more away falls back to a short date such as "Mar 4" (with the year
 * when it is not the current year).
 */
export function formatTimeAgo(
  value: string | number | Date | null | undefined,
  options: FormatTimeAgoOptions = {}
): string {
  const empty = options.empty ?? ''
  if (value === null || value === undefined || value === '') return empty

  const date = value instanceof Date ? value : new Date(value)
  if (isNaN(date.getTime())) return empty

  const now = new Date()
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000)
  const abs = Math.abs(seconds)

  if (abs < 60) return 'just now'
  if (abs < 604800) {
    const amount = abs < 3600 ? `${Math.floor(abs / 60)}m` : abs < 86400 ? `${Math.floor(abs / 3600)}h` : `${Math.floor(abs / 86400)}d`
    return seconds < 0 ? `in ${amount}` : `${amount} ago`
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
  })
}
