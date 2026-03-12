<template>
    <div class="space-y-6">
        <!-- Warnings banner for non-fatal fetch failures -->
        <div v-if="warnings && warnings.length > 0"
            class="px-4 py-2.5 bg-yellow-900/20 border border-yellow-700/40 rounded-lg flex items-start gap-2">
            <UIcon name="i-heroicons-exclamation-triangle" class="w-4 h-4 text-yellow-500 mt-0.5 flex-shrink-0" />
            <div class="text-xs text-yellow-400">
                <span class="font-medium">Some data may be incomplete:</span>
                {{ warnings.join(', ') }}
            </div>
        </div>

        <!-- Grid layout for smaller charts -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <template v-for="chart in optimizedCharts" :key="chart.id">
                <!-- Full width charts -->
                <div v-if="isFullWidth(chart)"
                    class="col-span-full bg-gray-900 border border-gray-700 rounded-lg">
                    <div class="px-6 py-4 border-b border-gray-700">
                        <div class="flex items-start justify-between">
                            <div class="flex-1">
                                <h3 class="text-lg font-semibold text-white">{{ chart.title }}</h3>
                                <p v-if="chart.description" class="text-sm text-gray-400 mt-1">{{ chart.description }}</p>
                            </div>
                            <div class="flex items-center gap-3">
                                <!-- Year selector for yearEndForecast chart -->
                                <div v-if="chart.id === 'yearEndForecast'" class="flex gap-1 bg-gray-800 rounded-lg p-1">
                                    <button
                                        class="px-3 py-1.5 text-xs font-medium rounded transition-colors"
                                        :class="selectedYearView === 'current'
                                            ? 'bg-blue-600 text-white'
                                            : 'text-gray-400 hover:text-gray-300'"
                                        @click="selectedYearView = 'current'"
                                    >
                                        {{ new Date().getFullYear() }}
                                    </button>
                                    <button
                                        class="px-3 py-1.5 text-xs font-medium rounded transition-colors"
                                        :class="selectedYearView === 'next'
                                            ? 'bg-blue-600 text-white'
                                            : 'text-gray-400 hover:text-gray-300'"
                                        @click="selectedYearView = 'next'"
                                    >
                                        {{ new Date().getFullYear() + 1 }}
                                    </button>
                                </div>

                                <!-- Budget variance regression toggle -->
                                <UButton
                                    v-if="chart.id === 'budgetVarianceAnalysis'"
                                    size="xs"
                                    :color="showRegressionLine ? 'blue' : 'gray'"
                                    :variant="showRegressionLine ? 'solid' : 'outline'"
                                    icon="i-heroicons-chart-bar"
                                    @click="$emit('toggleRegressionLine')"
                                >
                                    {{ showRegressionLine ? 'Hide' : 'Show' }} Trend
                                </UButton>
                            </div>
                        </div>
                    </div>
                    <div class="p-6">
                        <div class="h-64 md:h-80 lg:h-96">
                            <VChart v-if="getChartOptions(chart)" :option="getChartOptions(chart)" autoresize
                                class="h-full w-full" />
                            <div v-else-if="isLoading()" class="h-full flex items-center justify-center">
                                <div class="text-center">
                                    <UIcon name="i-heroicons-arrow-path"
                                        class="w-8 h-8 animate-spin text-blue-500 mx-auto mb-2" />
                                    <p class="text-gray-400">Loading chart data...</p>
                                </div>
                            </div>
                            <div v-else-if="hasExtractorError(chart)" class="h-full flex items-center justify-center">
                                <div class="text-center">
                                    <UIcon name="i-heroicons-exclamation-triangle"
                                        class="w-8 h-8 text-red-400 mx-auto mb-2" />
                                    <p class="text-gray-300">Chart failed to render</p>
                                    <details class="mt-2">
                                        <summary class="text-xs text-gray-500 cursor-pointer hover:text-gray-400">Debug
                                        </summary>
                                        <pre
                                            class="text-xs text-left mt-2 p-2 bg-gray-800 rounded overflow-auto max-h-32">{{ preview(chart) }}</pre>
                                    </details>
                                </div>
                            </div>
                            <div v-else-if="hasNoData(chart)" class="h-full flex items-center justify-center">
                                <div class="text-center">
                                    <UIcon name="i-heroicons-inbox"
                                        class="w-8 h-8 text-gray-500 mx-auto mb-2" />
                                    <p class="text-gray-400">No data available for this view</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Medium width charts (2 columns) -->
                <div v-else-if="isMediumWidth(chart)"
                    class="col-span-full md:col-span-2 bg-gray-900 border border-gray-700 rounded-lg">
                    <div class="px-6 py-4 border-b border-gray-700">
                        <h3 class="text-lg font-semibold text-white">{{ chart.title }}</h3>
                        <p v-if="chart.description" class="text-sm text-gray-400 mt-1">{{ chart.description }}</p>
                    </div>
                    <div class="p-6">
                        <div class="h-64 md:h-80">
                            <VChart v-if="getChartOptions(chart)" :option="getChartOptions(chart)" autoresize
                                class="h-full w-full" />
                            <div v-else-if="isLoading()" class="h-full flex items-center justify-center">
                                <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin text-blue-500" />
                            </div>
                            <div v-else class="h-full flex items-center justify-center text-gray-500 text-sm">
                                No data
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Small charts (1 column) -->
                <div v-else class="bg-gray-900 border border-gray-700 rounded-lg">
                    <div class="px-4 py-3 border-b border-gray-700">
                        <h3 class="text-base font-semibold text-white">{{ chart.title }}</h3>
                        <p v-if="chart.description" class="text-xs text-gray-400 mt-1">{{ chart.description }}</p>
                    </div>
                    <div class="p-4">
                        <div class="h-48 md:h-64">
                            <VChart v-if="getChartOptions(chart)" :option="getChartOptions(chart)" autoresize
                                class="h-full w-full" />
                            <div v-else-if="isLoading()" class="h-full flex items-center justify-center">
                                <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin text-blue-500" />
                            </div>
                            <div v-else class="h-full flex items-center justify-center text-gray-500 text-sm">
                                No data
                            </div>
                        </div>
                    </div>
                </div>
            </template>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { NormalizedDataset } from '~/types/costs'
import type { ChartDefinition } from '~/composables/useChartRegistry'
import VChart from 'vue-echarts'
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

const isLoading = () => !props.dataset

// Distinguish between "no data available" and "extractor threw an error"
const hasNoData = (chart: ChartDefinition) => {
    if (!props.dataset) return false
    if (!chart.extractor) return false
    try {
        const data = chart.extractor(props.dataset)
        return !data || (Array.isArray(data) && data.length === 0)
    } catch {
        return false // error case handled by hasExtractorError
    }
}

const hasExtractorError = (chart: ChartDefinition) => {
    if (!props.dataset) return false
    if (!chart.extractor) return false
    try {
        chart.extractor(props.dataset)
        return false
    } catch (error) {
        console.warn(`Error in chart extractor for ${chart.id}:`, error)
        return true
    }
}

// Combined check used by template for the "no chart options" state
const hasError = (chart: ChartDefinition) => hasNoData(chart) || hasExtractorError(chart)

// Consistent currency and percentage formatting uses auto-imported formatCurrency / formatPercent from utils/formatters

// Smart chart ordering for optimal grid layout with visual variety
const optimizedCharts = computed(() => {
    const charts = [...props.charts]
    
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

// Cached chart options map – computed once per render cycle instead of twice per chart
// (template was calling getChartOptions once for v-if and once for :option)
const chartOptionsMap = computed(() => {
    const map = new Map<string, any>()
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
            if ((data as any)?.contextualChart || !data) continue

            // Check cache before calling builder
            const dataHash = stableHash(data)
            const cached = chartCache.get(chart.id)
            if (cached && cached.dataHash === dataHash && cached.contextHash === contextHash) {
                map.set(chart.id, cached.options)
                continue
            }

            const builder = chartBuilderById[chart.id] || (chart.type ? chartBuilderByType[chart.type] : undefined)
            if (builder) {
                const options = builder(data, context)
                if (options) {
                    map.set(chart.id, options)
                    chartCache.set(chart.id, { dataHash, contextHash, options })
                }
            }
        } catch (error) {
            console.error('Error generating chart options for', chart.id, error)
        }
    }

    // Prune cache entries for charts no longer active
    for (const key of chartCache.keys()) {
        if (!activeIds.has(key)) chartCache.delete(key)
    }

    return map
})

// Convenience accessor used by template
const getChartOptions = (chart: ChartDefinition) => chartOptionsMap.value.get(chart.id) || null

const preview = (chart: ChartDefinition) => {
    if (!props.dataset) return 'No dataset'
    try {
        const data = chart.extractor(props.dataset)
        return JSON.stringify({ id: chart.id, type: chart.type, data }, null, 2)
    } catch (e: any) {
        return `Error: ${e?.message || e}`
    }
}
</script>
