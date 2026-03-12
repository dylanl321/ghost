import { formatCurrency } from '~/utils/formatters'

/**
 * Lightweight tooltip formatting helpers for ECharts chart builders.
 *
 * These extract the most common patterns (Array.isArray normalization,
 * currency lines, color dots) so each chart builder doesn't re-implement them.
 * Tooltip formats that are highly domain-specific (e.g. weekend annotations
 * in line-trend) should stay in their chart builder.
 */

/** Normalize ECharts tooltip params which may be a single item or an array. */
export function normalizeParams(params: any): { item: any; all: any[] } {
  if (Array.isArray(params)) {
    return { item: params[0], all: params }
  }
  return { item: params, all: [params] }
}

/** Bold header div for a tooltip. */
export function tooltipHeader(label: string): string {
  return `<div style="font-weight:600;margin-bottom:4px">${label}</div>`
}

/** Single formatted line with an optional color dot. */
export function tooltipLine(
  label: string,
  value: string,
  options?: { color?: string; bold?: boolean },
): string {
  const dot = options?.color
    ? `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${options.color};margin-right:6px"></span>`
    : ''
  const val = options?.bold ? `<b>${value}</b>` : value
  return `<div style="display:flex;align-items:center;gap:4px">${dot}${label}: ${val}</div>`
}

/** Currency-formatted tooltip line. */
export function tooltipCurrencyLine(
  label: string,
  amount: number | string,
  options?: { color?: string; showCents?: boolean },
): string {
  const formatted = formatCurrency(
    typeof amount === 'string' ? parseFloat(amount) : amount,
    { showCents: options?.showCents ?? false },
  )
  return tooltipLine(label, formatted, { color: options?.color })
}

/**
 * Common multi-series tooltip: date header + each series as a currency line.
 * Works for trend charts where every series represents a dollar amount.
 */
export function multiSeriesTooltip(params: any): string {
  const { item, all } = normalizeParams(params)
  let html = tooltipHeader(item.name || item.axisValue || '')
  for (const p of all) {
    if (p.value == null) continue
    html += tooltipCurrencyLine(p.seriesName, p.value, { color: p.color })
  }
  return html
}

/** Wrap an array of HTML line strings into a tooltip container. */
export function wrapTooltip(lines: string[]): string {
  return lines.join('')
}
