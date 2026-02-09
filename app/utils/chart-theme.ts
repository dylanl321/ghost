/**
 * Shared chart color palette and theme utilities for ECharts.
 *
 * Components can gradually migrate to import colors and helpers from here
 * instead of inlining the same hex arrays in every chart builder.
 */

// ---------------------------------------------------------------------------
// Color palettes
// ---------------------------------------------------------------------------

/** Standard 10-color palette used across ChartsRenderer and OrganizationalCharts. */
export const CHART_COLORS = [
  '#3b82f6', // Blue
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#ef4444', // Red
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#14b8a6', // Teal
  '#f97316', // Orange
  '#06b6d4', // Cyan
  '#84cc16', // Lime
] as const

/** Alternate palette for department trend comparison charts. */
export const DEPT_CHART_COLORS = [
  '#22d3ee', // Cyan-400
  '#f472b6', // Pink-400
  '#a78bfa', // Violet-400
  '#34d399', // Emerald-400
  '#fbbf24', // Amber-400
  '#fb7185', // Rose-400
  '#60a5fa', // Blue-400
  '#4ade80', // Green-400
  '#f59e0b', // Amber-500
  '#ef4444', // Red-500
] as const

// ---------------------------------------------------------------------------
// Theme tokens – common ECharts styling values for axes, grids, tooltips
// ---------------------------------------------------------------------------

export const CHART_THEME = {
  axisLine: '#374151',
  axisLabel: '#6b7280',
  splitLine: '#1f2937',
  textColor: '#9ca3af',
  tooltipBg: 'rgba(17, 24, 39, 0.95)',
  tooltipBorder: '#374151',
  tooltipText: '#e5e7eb',
} as const

// ---------------------------------------------------------------------------
// Semantic color constants – consistent meaning across all charts
// ---------------------------------------------------------------------------

/** Semantic colors for chart data series with consistent meaning across all charts. */
export const SEMANTIC_COLORS = {
  primary: '#3b82f6',    // blue - actual/current spend
  forecast: '#10b981',   // green - forecast/projected
  warning: '#f59e0b',    // amber - budget/caution
  danger: '#ef4444',     // red - over-budget/error
  secondary: '#6b7280',  // gray - previous period/baseline
  accent: '#8b5cf6',     // violet - regression/highlight
  annotation: '#fbbf24', // yellow - current-day markers
  border: '#111827',     // dark - chart element borders
  white: '#ffffff',      // white - label text on dark backgrounds
} as const

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/**
 * Return the color at `index` from the given palette, wrapping around if
 * the index exceeds the palette length.
 *
 * @param index  - Series index (0-based)
 * @param palette - Color array to pick from (defaults to `CHART_COLORS`)
 */
export function getSeriesColor(index: number, palette: readonly string[] | string[] = CHART_COLORS): string {
  return palette[index % palette.length]
}

/**
 * Map a budget-utilization percentage to a semantic color.
 *
 * - red    → over 100 %
 * - orange → 90 – 100 %
 * - blue   → 50 – 90 %
 * - green  → under 50 %
 */
export function getUtilizationColor(value: number): string {
  if (value > 100) return '#ef4444' // red
  if (value > 90) return '#f59e0b' // orange / amber
  if (value > 50) return '#3b82f6' // blue
  return '#10b981' // green / emerald
}

/**
 * Map a cost-growth-rate percentage to a semantic color.
 *
 * - red    → above 50 %
 * - orange → 20 – 50 %
 * - blue   → 0 – 20 %  (positive but moderate)
 * - green  → −20 – 0 %  (small decline)
 * - gray   → below −20 % (large decline)
 */
export function getGrowthColor(value: number): string {
  if (value > 50) return '#ef4444' // red
  if (value > 20) return '#f59e0b' // orange / amber
  if (value > 0) return '#3b82f6' // blue
  if (value > -20) return '#10b981' // green / emerald
  return '#6b7280' // gray
}

// ---------------------------------------------------------------------------
// Base chart options factory
// ---------------------------------------------------------------------------

/**
 * Return a base ECharts option object with the standard dark-theme styling
 * (transparent background, dark tooltip, standard grid spacing).
 *
 * Spread or merge this into chart-specific options:
 * ```ts
 * const opts = { ...createBaseChartOptions(), series: [...] }
 * ```
 */
export function createBaseChartOptions() {
  return {
    backgroundColor: 'transparent',
    textStyle: { color: CHART_THEME.textColor },
    tooltip: {
      backgroundColor: CHART_THEME.tooltipBg,
      borderColor: CHART_THEME.tooltipBorder,
      textStyle: { color: CHART_THEME.tooltipText },
      appendToBody: true,
      position(point: number[], _params: unknown, _dom: unknown, _rect: unknown, size: { viewSize: number[]; contentSize: number[] }) {
        const x = point[0]
        const y = point[1]
        const viewWidth = size.viewSize[0]
        const boxWidth = size.contentSize[0]
        const boxHeight = size.contentSize[1]

        let posX = x
        let posY = y - boxHeight - 10

        // Keep tooltip within viewport bounds
        if (posX + boxWidth > viewWidth) {
          posX = viewWidth - boxWidth - 10
        }
        if (posY < 10) {
          posY = y + 10
        }
        if (posX < 10) {
          posX = 10
        }

        return [posX, posY]
      },
      extraCssText: 'z-index: 9999;',
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      top: '10%',
      containLabel: true,
    },
  }
}
