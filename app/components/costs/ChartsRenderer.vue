<template>
    <div class="space-y-6">
        <!-- Warnings banner for non-fatal fetch failures -->
        <div v-if="warnings && warnings.length > 0"
            class="px-4 py-2.5 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700/40 rounded-lg flex items-start gap-2">
            <UIcon name="i-heroicons-exclamation-triangle" class="w-4 h-4 text-yellow-600 dark:text-yellow-500 mt-0.5 flex-shrink-0" />
            <div class="text-xs text-yellow-700 dark:text-yellow-400">
                <span class="font-medium">Some data may be incomplete:</span>
                {{ warnings.join(', ') }}
            </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div v-for="chart in optimizedCharts" :key="chart.id"
                class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg"
                :class="layout[sizeOf(chart)].card">
                <div class="border-b border-gray-200 dark:border-gray-700" :class="layout[sizeOf(chart)].header">
                    <div class="flex items-start justify-between gap-3">
                        <div class="flex-1 min-w-0">
                            <h3 class="font-semibold text-gray-900 dark:text-white" :class="layout[sizeOf(chart)].title">{{ chart.title }}</h3>
                            <p v-if="chart.description" class="text-gray-500 dark:text-gray-400 mt-1" :class="layout[sizeOf(chart)].description">{{ chart.description }}</p>
                        </div>
                        <!-- Year selector for yearEndForecast chart -->
                        <div v-if="chart.id === 'yearEndForecast'" class="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
                            <button v-for="view in yearViews" :key="view.value"
                                class="px-3 py-1.5 text-xs font-medium rounded transition-colors"
                                :class="selectedYearView === view.value
                                    ? 'bg-blue-600 text-white'
                                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'"
                                @click="selectedYearView = view.value">
                                {{ view.label }}
                            </button>
                        </div>
                        <!-- Budget variance regression toggle -->
                        <UButton v-if="chart.id === 'budgetVarianceAnalysis'" size="xs"
                            :color="showRegressionLine ? 'blue' : 'gray'"
                            :variant="showRegressionLine ? 'solid' : 'outline'"
                            icon="i-heroicons-chart-bar"
                            @click="emit('toggleRegressionLine')">
                            {{ showRegressionLine ? 'Hide' : 'Show' }} Trend
                        </UButton>
                    </div>
                </div>
                <div :class="layout[sizeOf(chart)].body">
                    <div :class="layout[sizeOf(chart)].height">
                        <VChart v-if="chartStates.get(chart.id)?.options" :ref="registerChartRef"
                            :option="chartStates.get(chart.id)!.options" autoresize class="h-full w-full" />
                        <div v-else-if="!dataset" class="h-full flex items-center justify-center">
                            <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin text-blue-500" />
                        </div>
                        <div v-else class="h-full flex items-center justify-center">
                            <div class="text-center">
                                <UIcon name="i-heroicons-exclamation-triangle" class="w-8 h-8 text-red-400 mx-auto mb-2" />
                                <p class="text-gray-600 dark:text-gray-300">Chart failed to render</p>
                                <p class="text-xs text-gray-500 mt-1">{{ chartStates.get(chart.id)?.error }}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Charts with nothing to show for this selection, collapsed to one line -->
        <p v-if="emptyCharts.length > 0" class="text-xs text-gray-500 flex items-start gap-1.5">
            <UIcon name="i-heroicons-inbox" class="w-4 h-4 flex-shrink-0" />
            <span>No data for this view: {{ emptyCharts.map(c => c.title).join(', ') }}. Try a longer timeframe or a different selection.</span>
        </p>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import type { NormalizedDataset } from '~/types/costs'
import type { ChartDefinition } from '~/composables/useChartRegistry'
import VChart from 'vue-echarts'
import { chartAnimationDefaults } from '~/utils/chartAnimationDefaults'
import { useChartGroup } from '~/composables/useChartGroup'
import { use as echartsUse } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import {
    LineChart,
    BarChart,
    PieChart,
    ScatterChart,
    HeatmapChart,
    TreemapChart,
    GaugeChart
} from 'echarts/charts'
import {
    GridComponent,
    TooltipComponent,
    LegendComponent,
    TitleComponent,
    VisualMapComponent
} from 'echarts/components'

// Register ECharts components
echartsUse([
    CanvasRenderer,
    LineChart,
    BarChart,
    PieChart,
    ScatterChart,
    HeatmapChart,
    TreemapChart,
    GaugeChart,
    GridComponent,
    TooltipComponent,
    LegendComponent,
    TitleComponent,
    VisualMapComponent
])

// Chart group for crosshair linking across cost page charts
const { registerChart, unregisterAll } = useChartGroup('costCharts')
// Ref callback used by all VChart instances in the v-for loops
function registerChartRef(el: any) {
  if (el) registerChart(el)
}

onUnmounted(() => {
  unregisterAll()
})

const props = defineProps<{
    charts: ChartDefinition[]
    dataset: NormalizedDataset | null
    showRegressionLine?: boolean
    selectedAccounts?: string[]
    warnings?: string[]
}>()

const emit = defineEmits<{
    toggleRegressionLine: []
}>()

// Year selection state for yearEndForecast chart
const selectedYearView = ref<'current' | 'next'>('current')

// Layout helpers
const isFullWidth = (chart: ChartDefinition) => {
    // Full width for complex charts that need horizontal space
    return [
        'totalSpendTrend',
        'lobTrendComparison',
        'departmentTrendComparison', // New organizational chart
        'historicalMonthlyTrend',
        'historicalComparison',
        'yearOverYearComparison',
        'last24MonthsTrend',
        'organizationForecastComparison', // Daily spend + forecast
        'cumulativeBurnUp',
        'monthlyTrendWithForecast',
        'accountForecastComparison',
        'yearEndForecast' // Year-end projection with actuals + forecast
    ].includes(chart.id)
}

const isMediumWidth = (chart: ChartDefinition) => {
    // Medium width for comparison charts and detailed visualizations
    return [
        'departmentComparison',
        'lobComparison',
        'departmentBudgetPerformance',
        'billableVsProforma',
        'scenarioOverlay',
        'serviceCostVariance'
    ].includes(chart.id)
}

type ChartSize = 'full' | 'medium' | 'small'
const sizeOf = (chart: ChartDefinition): ChartSize =>
    isFullWidth(chart) ? 'full' : isMediumWidth(chart) ? 'medium' : 'small'

const layout: Record<ChartSize, Record<'card' | 'header' | 'title' | 'description' | 'body' | 'height', string>> = {
    full: { card: 'col-span-full', header: 'px-6 py-4', title: 'text-lg', description: 'text-sm', body: 'p-6', height: 'h-64 md:h-80 lg:h-96' },
    medium: { card: 'col-span-full md:col-span-2', header: 'px-6 py-4', title: 'text-lg', description: 'text-sm', body: 'p-6', height: 'h-64 md:h-80' },
    small: { card: '', header: 'px-4 py-3', title: 'text-base', description: 'text-xs', body: 'p-4', height: 'h-48 md:h-64' }
}

const currentYear = new Date().getFullYear()
const yearViews = [
    { value: 'current' as const, label: currentYear },
    { value: 'next' as const, label: currentYear + 1 }
]

// Smart chart ordering for optimal grid layout with visual variety
const optimizedCharts = computed(() => {
    const charts = props.charts.filter(chart => !emptyCharts.value.includes(chart))
    
    // Categorize charts by size
    const fullWidth: ChartDefinition[] = []
    const mediumWidth: ChartDefinition[] = []
    const smallWidth: ChartDefinition[] = []
    
    charts.forEach(chart => {
        if (isFullWidth(chart)) {
            fullWidth.push(chart)
        } else if (isMediumWidth(chart)) {
            mediumWidth.push(chart)
        } else {
            smallWidth.push(chart)
        }
    })
    
    const result: ChartDefinition[] = []
    
    // Strategy: Create varied, balanced layout
    const mediumCharts = [...mediumWidth]
    const smallCharts = [...smallWidth]
    const fullCharts = [...fullWidth]
    
    let mediumOnLeft = true // Alternate medium chart positions
    let consecutiveFullCount = 0 // Track consecutive full-width charts
    
    // Interleave different chart types for variety
    while (fullCharts.length > 0 || mediumCharts.length > 0 || smallCharts.length > 0) {
        
        // Prevent more than 1 consecutive full-width chart
        if (fullCharts.length > 0 && consecutiveFullCount === 0) {
            result.push(fullCharts.shift()!)
            consecutiveFullCount = 1
        }
        // Add medium+small or small-only rows between full charts
        else if (mediumCharts.length > 0 || smallCharts.length > 0) {
            consecutiveFullCount = 0 // Reset full chart counter
            
            // Create medium + small combination with position variety
            if (mediumCharts.length > 0) {
                const medium = mediumCharts.shift()!
                
                if (smallCharts.length > 0) {
                    const small = smallCharts.shift()!
                    
                    // Alternate which comes first for visual variety
                    if (mediumOnLeft) {
                        result.push(medium, small)
                    } else {
                        result.push(small, medium)
                    }
                    mediumOnLeft = !mediumOnLeft // Toggle for next time
                } else {
                    // Just the medium chart
                    result.push(medium)
                }
            }
            // Fill with small charts if no medium charts left
            else if (smallCharts.length > 0) {
                // Add up to 3 small charts for a complete row
                const smallBatch: ChartDefinition[] = []
                for (let i = 0; i < 3 && smallCharts.length > 0; i++) {
                    smallBatch.push(smallCharts.shift()!)
                }
                result.push(...smallBatch)
            }
        }
        // If only full charts remain but we need to avoid clustering
        else if (fullCharts.length > 0) {
            result.push(fullCharts.shift()!)
            consecutiveFullCount = 1
        }
    }
    
    return result
})

// Chart builder registry – delegates to individual builder files in ~/utils/chart-options/
import { chartBuilderById, chartBuilderByType, type ChartBuilderContext } from '~/utils/chart-options'

const logger = createLogger('ChartsRenderer')

// Per-chart memoization cache to avoid rebuilding all 25 charts every render cycle
const chartCache = new Map<string, {
    dataHash: string
    contextHash: string
    options: Record<string, unknown>
}>()

function stableHash(obj: unknown): string {
    try { return JSON.stringify(obj) }
    catch { return String(Date.now()) }
}

// Clear cache when dataset identity changes
watch(() => props.dataset, () => {
    chartCache.clear()
}, { flush: 'sync' })

interface ChartState {
    options?: Record<string, unknown>
    empty?: boolean
    error?: string
}

// One extractor + builder pass per chart per render cycle; the template reads
// options, empty or error from here instead of re-running extractors.
const chartStates = computed(() => {
    const map = new Map<string, ChartState>()
    if (!props.dataset) return map

    const context: ChartBuilderContext = {
        showRegressionLine: props.showRegressionLine,
        selectedYearView: selectedYearView.value,
    }

    const contextHash = stableHash(context)
    const activeIds = new Set<string>()

    for (const chart of props.charts) {
        activeIds.add(chart.id)
        try {
            if (!chart.extractor) continue

            const data = chart.extractor(props.dataset) as Record<string, unknown> | null
            if ((data as any)?.contextualChart || !data || (Array.isArray(data) && data.length === 0)) {
                map.set(chart.id, { empty: true })
                continue
            }

            // Check cache before calling builder
            const dataHash = stableHash(data)
            const cached = chartCache.get(chart.id)
            if (cached && cached.dataHash === dataHash && cached.contextHash === contextHash) {
                map.set(chart.id, { options: cached.options })
                continue
            }

            const builder = chartBuilderById[chart.id] || (chart.type ? chartBuilderByType[chart.type] : undefined)
            if (builder) {
                const options = builder(data, context)
                if (options) {
                    const optionsWithDefaults = { ...chartAnimationDefaults, ...options }
                    map.set(chart.id, { options: optionsWithDefaults })
                    chartCache.set(chart.id, { dataHash, contextHash, options: optionsWithDefaults })
                    continue
                }
            }
            map.set(chart.id, { empty: true })
        } catch (error: any) {
            logger.error('Error generating chart options for', chart.id, error)
            map.set(chart.id, { error: error?.message || String(error) })
        }
    }

    // Prune cache entries for charts no longer active
    for (const key of chartCache.keys()) {
        if (!activeIds.has(key)) chartCache.delete(key)
    }

    return map
})

// Empty charts collapse into a single line under the grid once data has loaded
const emptyCharts = computed(() => props.dataset
    ? props.charts.filter(chart => chartStates.value.get(chart.id)?.empty)
    : [])
</script>
