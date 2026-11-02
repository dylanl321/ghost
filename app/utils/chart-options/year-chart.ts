import type { YearSummary } from '~/utils/year-end-summary'
import { formatCompactCurrency } from '#shared/utils/cost-dashboard'

/**
 * ECharts options for the costs page's year chart (the refreshed Year-End Projection).
 * Keeps the established colors: blue actuals, green AWS projection, a dashed amber
 * (GDMS) or violet (PEP) budget line and a green 80% band; restyles everything else
 * to sit inside the page: recessive axes, thin bars, a Today marker, ▲ on months
 * over budget, and a "budget gap" view of the same months.
 */

export const YEAR_CHART_COLORS = {
  actual: '#3b82f6',
  forecast: '#10b981',
  band: 'rgba(16, 185, 129, 0.14)',
  budgetGdms: '#f59e0b',
  budgetPep: '#a855f7',
  over: '#ef4444',
  under: '#10b981'
} as const

export const budgetColor = (summary: YearSummary) =>
  summary.budgetLabel === 'PEP budget' ? YEAR_CHART_COLORS.budgetPep : YEAR_CHART_COLORS.budgetGdms

interface ThemeTokens {
  axis: string
  label: string
  split: string
  surface: string
  tooltipBg: string
  tooltipText: string
  muted: string
}

const theme = (dark: boolean): ThemeTokens => dark
  ? { axis: '#334155', label: '#94a3b8', split: '#1e293b', surface: '#0f172a', tooltipBg: 'rgba(2, 6, 23, 0.96)', tooltipText: '#e2e8f0', muted: '#94a3b8' }
  : { axis: '#cbd5e1', label: '#64748b', split: '#eef2f6', surface: '#ffffff', tooltipBg: 'rgba(15, 23, 42, 0.96)', tooltipText: '#f1f5f9', muted: '#94a3b8' }

const money = formatCompactCurrency
const signed = (v: number) => (v > 0 ? '+' : '') + money(v)

const row = (color: string, label: string, value: string, shape: 'dot' | 'line' = 'dot') =>
  `<div style="display:flex;justify-content:space-between;gap:16px;align-items:center">` +
  `<span style="display:inline-flex;align-items:center;gap:6px">` +
  (shape === 'dot'
    ? `<span style="width:8px;height:8px;border-radius:2px;background:${color}"></span>`
    : `<span style="width:12px;border-top:2px dashed ${color}"></span>`) +
  `${label}</span><b style="font-variant-numeric:tabular-nums">${value}</b></div>`

function tooltipFor(summary: YearSummary, i: number): string {
  const m = summary.months[i]!
  const title = `${m.label} ${summary.year}${m.kind === 'current' ? ' · in progress' : m.kind === 'forecast' ? ' · forecast' : ''}`
  let html = `<div style="font-weight:600;margin-bottom:6px">${title}</div>`
  if (m.actual !== null) html += row(YEAR_CHART_COLORS.actual, m.kind === 'current' ? 'Actual so far' : 'Actual', money(m.actual))
  if (m.kind === 'current' && m.total !== null) html += row(YEAR_CHART_COLORS.forecast, 'Projected month end', money(m.total))
  if (m.kind === 'forecast' && m.total !== null) html += row(YEAR_CHART_COLORS.forecast, 'AWS projection', money(m.total))
  if (m.lower !== null && m.upper !== null) html += row(YEAR_CHART_COLORS.band, '80% range', `${money(m.lower)}–${money(m.upper)}`)
  if (summary.hasBudget) {
    html += row(budgetColor(summary), summary.budgetLabel, money(m.budget), 'line')
    if (m.gap !== null) {
      html += `<div style="margin-top:6px;padding-top:6px;border-top:1px solid rgba(148,163,184,.25);display:flex;justify-content:space-between;gap:16px">` +
        `<span>${m.gap > 0 ? 'Over budget' : 'Under budget'}</span>` +
        `<b style="color:${m.gap > 0 ? '#fca5a5' : '#6ee7b7'};font-variant-numeric:tabular-nums">${signed(m.gap)}</b></div>`
    }
  }
  if (m.kind === 'empty') html += `<div style="color:#94a3b8">No data for this month</div>`
  return html
}

function base(summary: YearSummary, dark: boolean) {
  const t = theme(dark)
  return {
    backgroundColor: 'transparent',
    animationDuration: 400,
    textStyle: { fontFamily: 'inherit' },
    grid: { left: 4, right: 12, top: 28, bottom: 4, containLabel: true },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow', shadowStyle: { color: dark ? 'rgba(148,163,184,.08)' : 'rgba(15,23,42,.04)' } },
      backgroundColor: t.tooltipBg,
      borderWidth: 0,
      padding: [10, 12],
      textStyle: { color: t.tooltipText, fontSize: 12 },
      extraCssText: 'border-radius:8px;box-shadow:0 8px 24px rgba(15,23,42,.25);min-width:220px',
      formatter: (params: any) => `<div style="font-size:12px;line-height:1.55">${tooltipFor(summary, Array.isArray(params) ? params[0].dataIndex : params.dataIndex)}</div>`
    },
    xAxis: {
      type: 'category',
      data: summary.months.map(m => m.label),
      axisLine: { lineStyle: { color: t.axis } },
      axisTick: { show: false },
      axisLabel: {
        color: t.label,
        fontSize: 12,
        margin: 10,
        formatter: (label: string, i: number) => i === summary.currentIndex ? `{cur|${label}}` : label,
        rich: { cur: { color: dark ? '#f8fafc' : '#0f172a', fontWeight: 700, fontSize: 12 } }
      }
    },
    yAxis: {
      type: 'value',
      splitNumber: 4,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: t.label, fontSize: 11, formatter: (v: number) => money(v) },
      splitLine: { lineStyle: { color: t.split } }
    },
    t
  }
}

const todayLine = (summary: YearSummary, t: ThemeTokens) => summary.currentIndex >= 0
  ? {
      silent: true,
      symbol: 'none',
      lineStyle: { color: t.muted, type: 'dashed', width: 1 },
      label: { formatter: 'Today', position: 'end', color: t.label, fontSize: 11 },
      data: [{ xAxis: summary.currentIndex }]
    }
  : undefined

/** Monthly bars: actual + AWS projection stacked, 80% band, budget line, ▲ on months over budget */
export function buildYearMonthlyOptions(summary: YearSummary, dark: boolean) {
  const { t, ...opts } = base(summary, dark)
  const radius = [4, 4, 0, 0]
  const series: any[] = []

  if (summary.hasConfidence) {
    series.push({
      name: 'Range low', type: 'line', stack: 'band', symbol: 'none', silent: true, z: 0,
      lineStyle: { opacity: 0 }, step: 'middle',
      data: summary.months.map(m => m.lower)
    }, {
      name: '80% range', type: 'line', stack: 'band', symbol: 'none', silent: true, z: 0,
      lineStyle: { opacity: 0 }, step: 'middle', areaStyle: { color: YEAR_CHART_COLORS.band },
      data: summary.months.map(m => (m.lower !== null && m.upper !== null ? m.upper - m.lower : null))
    })
  }

  series.push({
    name: 'Actual', type: 'bar', stack: 'total', barWidth: '52%', z: 2,
    itemStyle: { color: YEAR_CHART_COLORS.actual },
    data: summary.months.map(m => ({
      value: m.actual,
      // Round the top only when nothing is stacked above it
      itemStyle: { borderRadius: m.forecastPart ? 0 : radius }
    })),
    markLine: todayLine(summary, t)
  }, {
    name: 'AWS projection', type: 'bar', stack: 'total', barWidth: '52%', z: 2,
    itemStyle: { color: YEAR_CHART_COLORS.forecast, opacity: 0.85, borderRadius: radius },
    data: summary.months.map(m => m.forecastPart)
  })

  if (summary.hasBudget) {
    series.push({
      name: summary.budgetLabel, type: 'line', step: 'middle', symbol: 'none', z: 4,
      lineStyle: { color: budgetColor(summary), width: 2, type: 'dashed' },
      itemStyle: { color: budgetColor(summary) },
      data: summary.months.map(m => m.budget)
    }, {
      name: 'Over budget', type: 'scatter', symbol: 'triangle', symbolSize: 9, z: 5, silent: true,
      itemStyle: { color: YEAR_CHART_COLORS.over, borderColor: t.surface, borderWidth: 1.5 },
      symbolOffset: [0, -10],
      data: summary.months.map(m => (m.gap !== null && m.gap > 0 && m.total !== null ? Math.max(m.total, m.upper ?? 0) : null))
    })
  }

  return { ...opts, series }
}

/** Budget gap: each month's expected total minus its budget, forecast months drawn lighter with a dashed edge */
export function buildYearGapOptions(summary: YearSummary, dark: boolean) {
  const { t, ...opts } = base(summary, dark)
  const data = summary.months.map(m => {
    if (m.gap === null) return { value: null }
    const color = m.gap > 0 ? YEAR_CHART_COLORS.over : YEAR_CHART_COLORS.under
    const projected = m.kind === 'forecast' || m.kind === 'current'
    return {
      value: m.gap,
      itemStyle: {
        color,
        opacity: projected ? 0.45 : 1,
        borderColor: projected ? color : 'transparent',
        borderWidth: projected ? 1.5 : 0,
        borderType: 'dashed',
        borderRadius: m.gap > 0 ? [4, 4, 0, 0] : [0, 0, 4, 4]
      },
      label: { position: m.gap > 0 ? 'top' : 'bottom' }
    }
  })
  return {
    ...opts,
    yAxis: { ...opts.yAxis, axisLabel: { ...opts.yAxis.axisLabel, formatter: (v: number) => signed(v) } },
    series: [{
      name: 'Budget gap', type: 'bar', barWidth: '52%', z: 2, data,
      label: { show: true, color: t.label, fontSize: 11, fontWeight: 600, formatter: (p: any) => (p.value === null ? '' : signed(p.value)) },
      markLine: {
        silent: true,
        symbol: 'none',
        data: [
          { yAxis: 0, lineStyle: { color: t.axis, type: 'solid', width: 1.5 }, label: { show: false } },
          ...(summary.currentIndex >= 0
            ? [{ xAxis: summary.currentIndex, lineStyle: { color: t.muted, type: 'dashed' as const, width: 1 }, label: { formatter: 'Today', position: 'end' as const, color: t.label, fontSize: 11 } }]
            : [])
        ]
      }
    }]
  }
}
