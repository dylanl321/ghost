<template>
  <section
    class="flex min-w-0 flex-col gap-5 rounded-xl border border-gray-200 bg-white p-5 md:p-6 dark:border-gray-800 dark:bg-gray-900"
    aria-labelledby="year-chart-heading"
    data-tour="costs-hero-chart"
  >
    <!-- Headline and controls -->
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div class="min-w-0 flex-[1_1_480px]">
        <p class="m-0 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          {{ summary ? `${summary.year} · ${summary.isNextYear ? 'AWS forecast' : 'Actuals and forecast'}` : 'Year-end projection' }}
        </p>
        <h2 id="year-chart-heading" class="m-0 mt-1.5 max-w-3xl text-xl font-semibold leading-snug text-gray-900 dark:text-white">
          <template v-if="headline">
            {{ headline.lead }}<span v-if="headline.emphasis" :class="headline.over ? 'text-red-600 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'">{{ headline.emphasis }}</span>{{ headline.tail }}
          </template>
          <template v-else>Year-end projection</template>
        </h2>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <div class="inline-flex gap-0.5 rounded-lg bg-gray-100 p-0.5 dark:bg-gray-800" role="group" aria-label="Chart view">
          <button
            v-for="option in viewOptions"
            :key="option.value"
            type="button"
            class="h-7 rounded-md px-3 text-xs font-medium transition-colors"
            :class="view === option.value ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-950 dark:text-white' : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'"
            :aria-pressed="view === option.value"
            :disabled="option.value === 'gap' && !summary?.hasBudget"
            @click="view = option.value"
          >
            {{ option.label }}
          </button>
        </div>
        <div class="inline-flex gap-0.5 rounded-lg bg-gray-100 p-0.5 dark:bg-gray-800" role="group" aria-label="Year">
          <button
            v-for="option in yearOptions"
            :key="option.value"
            type="button"
            class="h-7 rounded-md px-3 text-xs font-medium tabular-nums transition-colors"
            :class="yearView === option.value ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-950 dark:text-white' : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'"
            :aria-pressed="yearView === option.value"
            @click="yearView = option.value"
          >
            {{ option.label }}
          </button>
        </div>
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          :icon="showTable ? 'i-heroicons-chart-bar' : 'i-heroicons-table-cells'"
          :aria-label="showTable ? 'Show as chart' : 'Show as table'"
          :title="showTable ? 'Show as chart' : 'Show as table'"
          @click="showTable = !showTable"
        />
      </div>
    </div>

    <!-- Year figures -->
    <dl v-if="summary" class="m-0 grid grid-cols-2 gap-x-8 gap-y-4 sm:flex sm:flex-wrap sm:gap-x-12">
      <div v-for="stat in stats" :key="stat.label" class="flex min-w-0 flex-col gap-0.5">
        <dt class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{{ stat.label }}</dt>
        <dd class="m-0 text-2xl font-extrabold leading-tight tabular-nums" :class="stat.tone === 'over' ? 'text-red-600 dark:text-red-400' : stat.tone === 'under' ? 'text-emerald-700 dark:text-emerald-400' : 'text-gray-900 dark:text-white'">{{ stat.value }}</dd>
        <dd class="m-0 text-xs text-gray-500 dark:text-gray-400">{{ stat.sub }}</dd>
      </div>
    </dl>

    <!-- Legend (HTML, so it reads with the page's type) -->
    <div v-if="summary && !showTable" class="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-gray-600 dark:text-gray-300">
      <template v-if="view === 'monthly'">
        <span v-if="!summary.isNextYear" class="inline-flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded-sm" :style="{ background: colors.actual }" />Actual</span>
        <span class="inline-flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded-sm" :style="{ background: colors.forecast }" />AWS projection</span>
        <span v-if="summary.hasConfidence" class="inline-flex items-center gap-1.5"><span class="h-2.5 w-3.5 rounded-sm border border-emerald-400/50" :style="{ background: colors.band }" />80% range</span>
        <span v-if="summary.hasBudget" class="inline-flex items-center gap-1.5"><span class="w-4 border-t-2 border-dashed" :style="{ borderColor: budgetLineColor }" />{{ budgetLabelCap }}</span>
        <span v-if="summary.overMonths > 0" class="inline-flex items-center gap-1.5"><span class="text-[10px] leading-none" :style="{ color: colors.over }" aria-hidden="true">▲</span>Over budget</span>
      </template>
      <template v-else>
        <span class="inline-flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded-sm" :style="{ background: colors.over }" />Over budget</span>
        <span class="inline-flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded-sm" :style="{ background: colors.under }" />Under budget</span>
        <span class="inline-flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded-sm border border-dashed border-gray-400 bg-gray-300/40" />Projected months</span>
      </template>
    </div>

    <!-- Chart, table or state -->
    <div v-if="!dataset" class="flex h-72 items-center justify-center md:h-80" aria-busy="true">
      <UIcon name="i-heroicons-arrow-path" class="h-6 w-6 animate-spin text-gray-400" />
    </div>
    <div v-else-if="!summary" class="flex h-40 items-center justify-center text-sm text-gray-500 dark:text-gray-400">
      No cost or forecast data for this year yet.
    </div>
    <div v-else-if="showTable" class="max-h-80 overflow-auto rounded-lg border border-gray-200 dark:border-gray-800">
      <table class="w-full border-collapse text-sm tabular-nums">
        <thead class="sticky top-0 bg-gray-50 dark:bg-gray-950">
          <tr class="text-left text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400">
            <th class="px-3 py-2 font-semibold">Month</th>
            <th class="px-3 py-2 text-right font-semibold">Actual</th>
            <th class="px-3 py-2 text-right font-semibold">Expected total</th>
            <th class="px-3 py-2 text-right font-semibold">80% range</th>
            <th class="px-3 py-2 text-right font-semibold">Budget</th>
            <th class="px-3 py-2 text-right font-semibold">Gap</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="m in summary.months" :key="m.label" class="border-t border-gray-100 dark:border-gray-800">
            <td class="px-3 py-1.5 text-gray-900 dark:text-white">{{ m.label }}<span v-if="m.kind === 'current'" class="ml-1.5 text-xs text-gray-500">in progress</span></td>
            <td class="px-3 py-1.5 text-right">{{ m.actual !== null ? money(m.actual) : '—' }}</td>
            <td class="px-3 py-1.5 text-right">{{ m.total !== null ? money(m.total) : '—' }}</td>
            <td class="px-3 py-1.5 text-right">{{ m.lower !== null && m.upper !== null ? `${money(m.lower)}–${money(m.upper)}` : '—' }}</td>
            <td class="px-3 py-1.5 text-right">{{ summary.hasBudget ? money(m.budget) : '—' }}</td>
            <td class="px-3 py-1.5 text-right font-semibold" :class="m.gap === null ? '' : m.gap > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'">{{ m.gap !== null ? signed(m.gap) : '—' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-else class="h-72 md:h-80" role="img" :aria-label="ariaLabel">
      <VChart v-if="options" :option="options" autoresize class="h-full w-full" />
    </div>

    <p v-if="summary?.budgetNote" class="m-0 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300">
      <UIcon name="i-heroicons-information-circle" class="mt-px h-4 w-4 shrink-0" />{{ summary.budgetNote }}
    </p>
  </section>
</template>

<script setup lang="ts">
import VChart from 'vue-echarts'
import { use as echartsUse } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, LineChart, ScatterChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, MarkLineComponent } from 'echarts/components'
import type { ChartDefinition } from '~/composables/useChartRegistry'
import type { NormalizedDataset } from '~/types/costs'
import { summarizeYear, type YearChartData } from '~/utils/year-end-summary'
import { buildYearMonthlyOptions, buildYearGapOptions, budgetColor, YEAR_CHART_COLORS } from '~/utils/chart-options/year-chart'
import { formatCompactCurrency } from '#shared/utils/cost-dashboard'

echartsUse([CanvasRenderer, BarChart, LineChart, ScatterChart, GridComponent, TooltipComponent, MarkLineComponent])

const props = defineProps<{
  /** The registry's `yearEndForecast` definition; its extractor shapes the data */
  chart: ChartDefinition
  dataset: NormalizedDataset | null
  /** Who the numbers cover, e.g. "all 24 accounts", "Mission Systems" */
  scopeLabel: string
}>()

const colors = YEAR_CHART_COLORS
const money = formatCompactCurrency
const signed = (v: number) => (v > 0 ? '+' : '') + money(v)

const view = ref<'monthly' | 'gap'>('monthly')
const yearView = ref<'current' | 'next'>('current')
const showTable = ref(false)

const thisYear = new Date().getFullYear()
const viewOptions = [
  { value: 'monthly' as const, label: 'Monthly' },
  { value: 'gap' as const, label: 'Budget gap' }
]
const yearOptions = [
  { value: 'current' as const, label: String(thisYear) },
  { value: 'next' as const, label: String(thisYear + 1) }
]

const extracted = computed(() => {
  if (!props.dataset) return null
  try {
    return props.chart.extractor(props.dataset) as { currentYear?: YearChartData, nextYear?: YearChartData } | null
  } catch {
    return null
  }
})

const summary = computed(() => {
  const isNext = yearView.value === 'next'
  const data = isNext ? extracted.value?.nextYear : extracted.value?.currentYear
  if (!data?.months?.length || !data.series?.length) return null
  const s = summarizeYear(data, isNext)
  return s.projectedTotal > 0 || s.actualToDate > 0 ? s : null
})

// No budget means no gap to show
watch(summary, (s) => {
  if (s && !s.hasBudget && view.value === 'gap') view.value = 'monthly'
})

const budgetLineColor = computed(() => (summary.value ? budgetColor(summary.value) : colors.budgetGdms))
const budgetLabelCap = computed(() => {
  const label = summary.value?.budgetLabel ?? ''
  return label.charAt(0).toUpperCase() + label.slice(1)
})

const headline = computed(() => {
  const s = summary.value
  if (!s) return null
  const scope = props.scopeLabel
  const lead = s.isNextYear
    ? `AWS forecasts ${money(s.projectedTotal)} for ${scope} in ${s.year}`
    : `At this pace, ${scope} will spend ${money(s.projectedTotal)} in ${s.year}`
  if (!s.hasBudget) return { lead: `${lead}.`, emphasis: '', tail: '', over: false }
  return {
    lead: `${lead}, `,
    emphasis: `${money(Math.abs(s.gap))} ${s.gap > 0 ? 'over' : 'under'}`,
    tail: ` the ${money(s.annualBudget)} ${s.budgetLabel}.`,
    over: s.gap > 0
  }
})

const stats = computed(() => {
  const s = summary.value
  if (!s) return []
  const months = s.months.filter(m => m.kind !== 'empty').length
  return [
    s.isNextYear
      ? { label: 'Forecast months', value: String(months), sub: 'AWS forecasts run 12 months ahead', tone: undefined }
      : { label: 'Actual to date', value: money(s.actualToDate), sub: `Jan through ${s.months[Math.max(0, s.currentIndex)]?.label ?? 'today'}`, tone: undefined },
    { label: 'Projected year end', value: money(s.projectedTotal), sub: s.isNextYear ? 'Sum of AWS projections' : 'Actuals plus AWS projection', tone: undefined },
    { label: 'Annual budget', value: s.hasBudget ? money(s.annualBudget) : '—', sub: s.hasBudget ? budgetLabelCap.value : 'No budget loaded', tone: undefined },
    {
      label: 'Year-end gap',
      value: s.hasBudget ? signed(s.gap) : '—',
      sub: s.hasBudget ? `${Math.round(s.projectedTotal / s.annualBudget * 100)}% of budget · ${s.overMonths} of 12 months over` : '',
      tone: s.hasBudget ? (s.gap > 0 ? 'over' as const : 'under' as const) : undefined
    }
  ]
})

const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')

const options = computed<Record<string, unknown> | null>(() => {
  const s = summary.value
  if (!s) return null
  return view.value === 'gap' ? buildYearGapOptions(s, isDark.value) : buildYearMonthlyOptions(s, isDark.value)
})

const ariaLabel = computed(() => {
  const s = summary.value
  if (!s) return ''
  const what = view.value === 'gap' ? 'Monthly difference from budget' : 'Monthly spend with AWS projection'
  return `${what} for ${s.year}. Projected ${money(s.projectedTotal)}${s.hasBudget ? ` against a ${money(s.annualBudget)} budget` : ''}.`
})
</script>
