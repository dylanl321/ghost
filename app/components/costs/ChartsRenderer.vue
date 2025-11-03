<template>
    <div class="space-y-6">
        <!-- Grid layout for smaller charts -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <template v-for="chart in optimizedCharts" :key="chart.id">
                <!-- Full width charts -->
                <div v-if="isFullWidth(chart)"
                    class="col-span-full bg-gray-900 border border-gray-700 rounded-lg">
                    <div class="px-6 py-4 border-b border-gray-700">
                        <div class="flex items-start justify-between">
                            <div>
                                <h3 class="text-lg font-semibold text-white">{{ chart.title }}</h3>
                                <p v-if="chart.description" class="text-sm text-gray-400 mt-1">{{ chart.description }}</p>
                            </div>
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
                    <div class="p-6">
                        <div class="h-96">
                            <VChart v-if="getChartOptions(chart)" :option="getChartOptions(chart)" autoresize
                                class="h-full w-full" />
                            <div v-else-if="isLoading()" class="h-full flex items-center justify-center">
                                <div class="text-center">
                                    <Icon name="i-heroicons-arrow-path"
                                        class="w-8 h-8 animate-spin text-blue-500 mx-auto mb-2" />
                                    <p class="text-gray-400">Loading chart data...</p>
                                </div>
                            </div>
                            <div v-else-if="hasError(chart)" class="h-full flex items-center justify-center">
                                <div class="text-center">
                                    <Icon name="i-heroicons-exclamation-triangle"
                                        class="w-8 h-8 text-yellow-500 mx-auto mb-2" />
                                    <p class="text-gray-400">No data available</p>
                                    <details class="mt-2">
                                        <summary class="text-xs text-gray-500 cursor-pointer hover:text-gray-400">Debug
                                        </summary>
                                        <pre
                                            class="text-xs text-left mt-2 p-2 bg-gray-800 rounded overflow-auto max-h-32">{{ preview(chart) }}</pre>
                                    </details>
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
                        <div class="h-80">
                            <VChart v-if="getChartOptions(chart)" :option="getChartOptions(chart)" autoresize
                                class="h-full w-full" />
                            <div v-else-if="isLoading()" class="h-full flex items-center justify-center">
                                <Icon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin text-blue-500" />
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
                        <div class="h-64">
                            <VChart v-if="getChartOptions(chart)" :option="getChartOptions(chart)" autoresize
                                class="h-full w-full" />
                            <div v-else-if="isLoading()" class="h-full flex items-center justify-center">
                                <Icon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin text-blue-500" />
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
import { ref } from 'vue'
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
}>()

const emit = defineEmits<{
    toggleRegressionLine: []
}>()

// Import contextual charts composable
import { useContextualCharts } from '~/composables/useContextualCharts'
const { fetchContextualData } = useContextualCharts(ref(props.selectedAccounts || []))

// Layout helpers
const isFullWidth = (chart: ChartDefinition) => {
    // Full width for complex charts that need horizontal space
    return [
        'totalSpendTrend',
        'monthlyHeatmap',
        'lobTrendComparison',
        'departmentTrendComparison', // New organizational chart
        'serviceCostDistribution',
        'budgetVarianceAnalysis',
        'historicalMonthlyTrend',
        'historicalComparison',
        'yearOverYearComparison',
        'last24MonthsTrend',
        'organizationForecastComparison', // Daily spend + forecast
        'forecastProjectionLine',
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
        'topSpenders',
        'budgetUtilization',
        'lobComparison',
        'departmentBudgetPerformance',
        'costGrowthRate',
        'costOptimizationOpportunities',
        'monthOverMonthComparison',
        'billableVsProforma',
        'budgetSCurve',
        'scenarioOverlay'
    ].includes(chart.id)
}

const isLoading = () => !props.dataset
const hasError = (chart: ChartDefinition) => {
    if (!props.dataset) return false
    if (!chart.extractor) return false // No extractor means chart will use default data
    try {
        const data = chart.extractor(props.dataset)
        return !data || (Array.isArray(data) && data.length === 0)
    } catch (error) {
        console.warn(`Error in chart extractor for ${chart.id}:`, error)
        return true
    }
}

// Consistent currency formatting helper
const formatCurrency = (value: number | string | undefined, showCents = true): string => {
    const numValue = typeof value === 'number' ? value : parseFloat(String(value || 0))
    if (isNaN(numValue)) {
        return '$0.00'
    }
    if (numValue >= 1000000) {
        return `$${(numValue / 1000000).toFixed(2)}M`
    }
    if (numValue >= 1000) {
        return `$${(numValue / 1000).toFixed(2)}k`
    }
    return showCents ? `$${numValue.toFixed(2)}` : `$${Math.round(numValue)}`
}

// Consistent percentage formatting helper
const formatPercent = (value: number): string => {
    return `${value.toFixed(2)}%`
}

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
    
    console.log('Chart layout optimization:', {
        original: charts.map(c => ({ id: c.id, size: isFullWidth(c) ? 'full' : isMediumWidth(c) ? 'medium' : 'small' })),
        optimized: result.map(c => ({ id: c.id, size: isFullWidth(c) ? 'full' : isMediumWidth(c) ? 'medium' : 'small' })),
        layoutPattern: result.map(c => isFullWidth(c) ? 'F' : isMediumWidth(c) ? 'M' : 'S').join('-')
    })
    
    return result
})

// Simple linear regression calculation
const calculateLinearRegression = (data: Array<{ budgetedCost: number, actualCost: number }>) => {
    const n = data.length
    if (n < 2) return null

    const sumX = data.reduce((sum, item) => sum + item.budgetedCost, 0)
    const sumY = data.reduce((sum, item) => sum + item.actualCost, 0)
    const sumXY = data.reduce((sum, item) => sum + (item.budgetedCost * item.actualCost), 0)
    const sumXX = data.reduce((sum, item) => sum + (item.budgetedCost * item.budgetedCost), 0)

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX)
    const intercept = (sumY - slope * sumX) / n

    // Calculate R-squared
    const meanY = sumY / n
    const totalSumSquares = data.reduce((sum, item) => sum + Math.pow(item.actualCost - meanY, 2), 0)
    const residualSumSquares = data.reduce((sum, item) => {
        const predicted = slope * item.budgetedCost + intercept
        return sum + Math.pow(item.actualCost - predicted, 2)
    }, 0)
    const rSquared = 1 - (residualSumSquares / totalSumSquares)

    return { slope, intercept, rSquared }
}

const getChartOptions = (chart: ChartDefinition) => {
    if (!props.dataset) return null

    try {
        // Check if chart has an extractor
        if (!chart.extractor) {
            // For placeholder charts without extractors, return null
            console.log(`Chart ${chart.id} has no extractor, skipping`)
            return null
        }
        
        let data = chart.extractor(props.dataset)
        
        // Handle contextual charts that fetch their own data
        if (data?.contextualChart) {
            // For now, return null for contextual charts until we implement proper async handling
            return null
        }
        
        if (!data) return null

        // Common chart styling
        const baseOptions = {
            backgroundColor: 'transparent',
            textStyle: { color: '#9ca3af' },
            tooltip: {
                backgroundColor: 'rgba(17, 24, 39, 0.95)',
                borderColor: '#374151',
                textStyle: { color: '#e5e7eb' },
                appendToBody: true,
                position: function (point: number[], params: any, dom: any, rect: any, size: any) {
                    // Ensure tooltip stays within viewport
                    const x = point[0]
                    const y = point[1]
                    const viewWidth = size.viewSize[0]
                    const viewHeight = size.viewSize[1]
                    const boxWidth = size.contentSize[0]
                    const boxHeight = size.contentSize[1]
                    
                    let posX = x
                    let posY = y - boxHeight - 10
                    
                    // Adjust X position if tooltip goes off right edge
                    if (posX + boxWidth > viewWidth) {
                        posX = viewWidth - boxWidth - 10
                    }
                    
                    // Adjust Y position if tooltip goes off top edge
                    if (posY < 10) {
                        posY = y + 10
                    }
                    
                    // Ensure tooltip doesn't go off left edge
                    if (posX < 10) {
                        posX = 10
                    }
                    
                    return [posX, posY]
                },
                extraCssText: 'z-index: 9999;'
            },
            grid: {
                left: '3%',
                right: '4%',
                bottom: '3%',
                top: '10%',
                containLabel: true
            }
        }

        // Line chart for trends with weekend highlighting and master account annotations
        if (chart.type === 'line' && data?.dates && data?.totals) {
            const hasEnhancedData = data.weekendData && data.firstOfMonthData && data.masterAccountData

            // Create weekend highlighting as background markArea (vertical bands)
            const weekendMarkAreas: any[] = []
            if (hasEnhancedData) {
                // Group consecutive weekends into ranges for better performance
                let weekendStart = -1
                data.weekendData.forEach((isWeekend: boolean, index: number) => {
                    if (isWeekend && weekendStart === -1) {
                        // Start of weekend period
                        weekendStart = index
                    } else if (!isWeekend && weekendStart !== -1) {
                        // End of weekend period
                        weekendMarkAreas.push([
                            {
                                xAxis: weekendStart - 0.4, // Slight offset for better visual
                                yAxis: 'min'
                            },
                            {
                                xAxis: index - 1 + 0.4, // Slight offset for better visual
                                yAxis: 'max'
                            }
                        ])
                        weekendStart = -1
                    }
                })

                // Handle case where data ends on a weekend
                if (weekendStart !== -1) {
                    weekendMarkAreas.push([
                        {
                            xAxis: weekendStart - 0.4,
                            yAxis: 'min'
                        },
                        {
                            xAxis: data.weekendData.length - 1 + 0.4,
                            yAxis: 'max'
                        }
                    ])
                }
            }

            // Create master account annotations for first of month
            const masterAccountAnnotations: any[] = []
            if (hasEnhancedData) {
                data.firstOfMonthData.forEach((isFirst: boolean, index: number) => {
                    if (isFirst && data.masterAccountData[index] > 50000) { // Significant master account charge
                        masterAccountAnnotations.push({
                            type: 'line',
                            xAxis: index,
                            label: {
                                show: true,
                                formatter: '💳 Master Account\nEnterprise Support',
                                position: 'insideEndTop',
                                color: '#fbbf24',
                                fontSize: 10,
                                backgroundColor: 'rgba(0,0,0,0.8)',
                                borderColor: '#fbbf24',
                                borderWidth: 1,
                                borderRadius: 4,
                                padding: [4, 8]
                            },
                            lineStyle: {
                                color: '#fbbf24',
                                type: 'dashed',
                                width: 2
                            }
                        })
                    }
                })
            }

            return {
                ...baseOptions,
                tooltip: {
                    ...baseOptions.tooltip,
                    trigger: 'axis',
                    formatter: (params: any) => {
                        if (Array.isArray(params)) params = params[0]
                        const index = params.dataIndex
                        const value = formatCurrency(params.value)
                        const date = new Date(data.dates[index])

                        let tooltip = `${params.name}<br/>Total Spend: ${value}`

                        // Add weekend indicator
                        if (hasEnhancedData && data.weekendData[index]) {
                            const dayName = date.getDay() === 0 ? 'Sunday' : 'Saturday'
                            tooltip += `<br/><span style="color: #8b5cf6">🗓️ Weekend (${dayName})</span>`
                        }

                        // Add master account info for first of month
                        if (hasEnhancedData && data.firstOfMonthData[index] && data.masterAccountData[index] > 50000) {
                            tooltip += `<br/><span style="color: #fbbf24">💳 Master Account: ${formatCurrency(data.masterAccountData[index])}</span>`
                            tooltip += `<br/><span style="color: #fbbf24">   (Enterprise Support + Savings Plans)</span>`
                        }

                        return tooltip
                    }
                },
                xAxis: {
                    type: 'category',
                    data: data.dates,
                    axisLine: { lineStyle: { color: '#374151' } },
                    axisLabel: {
                        color: '#6b7280',
                        rotate: 45,
                        fontSize: 10,
                        formatter: (value: string, index: number) => {
                            const date = new Date(value)
                            const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
                            const dayOfWeek = dayNames[date.getDay()]
                            const shortDate = value.substring(5) // Remove year (YYYY-MM-DD -> MM-DD)

                            // Format with day of week
                            const label = `${shortDate}\n${dayOfWeek}`

                            // Highlight weekends
                            if (hasEnhancedData && data.weekendData[index]) {
                                return `{weekend|${label}}`
                            }
                            return `{normal|${label}}`
                        },
                        rich: {
                            weekend: {
                                color: '#8b5cf6',
                                fontWeight: 'bold',
                                backgroundColor: 'rgba(139, 92, 246, 0.1)',
                                borderRadius: 3,
                                padding: [2, 4]
                            },
                            normal: {
                                color: '#6b7280'
                            }
                        }
                    }
                },
                yAxis: {
                    type: 'value',
                    axisLine: { lineStyle: { color: '#374151' } },
                    axisLabel: {
                        color: '#6b7280',
                        formatter: (value: number) => formatCurrency(value)
                    },
                    splitLine: { lineStyle: { color: '#1f2937' } }
                },
                series: [
                    {
                        name: 'Total Spend',
                        type: 'line',
                        data: data.totals,
                        smooth: true,
                        lineStyle: {
                            color: '#3b82f6',
                            width: 2
                        },
                        areaStyle: {
                            color: {
                                type: 'linear',
                                x: 0, y: 0, x2: 0, y2: 1,
                                colorStops: [
                                    { offset: 0, color: 'rgba(59, 130, 246, 0.4)' },
                                    { offset: 1, color: 'rgba(59, 130, 246, 0.05)' }
                                ]
                            }
                        },
                        itemStyle: {
                            color: (params: any) => {
                                // Highlight weekend points
                                if (hasEnhancedData && data.weekendData[params.dataIndex]) {
                                    return '#8b5cf6' // Purple for weekends
                                }
                                // Highlight first-of-month with master account charges
                                if (hasEnhancedData && data.firstOfMonthData[params.dataIndex] &&
                                    data.masterAccountData[params.dataIndex] > 50000) {
                                    return '#fbbf24' // Yellow for master account charges
                                }
                                return '#3b82f6' // Default blue
                            }
                        },
                        markArea: weekendMarkAreas.length > 0 ? {
                            silent: true,
                            itemStyle: {
                                color: 'rgba(139, 92, 246, 0.12)', // Light purple background for weekends
                                borderWidth: 0,
                                opacity: 0.6
                            },
                            emphasis: {
                                disabled: true // Disable hover effects on background areas
                            },
                            data: weekendMarkAreas,
                            z: -1 // Ensure it's behind the line chart
                        } : undefined,
                        markLine: masterAccountAnnotations.length > 0 ? {
                            silent: false,
                            data: masterAccountAnnotations
                        } : undefined
                    }
                ]
            }
        }

        // Budget utilization - gauge for single account, bars for multiple
        if (chart.id === 'budgetUtilization' && Array.isArray(data)) {
            // Calculate dynamic max based on actual data
            const maxUtilization = Math.max(...data.map(d => d.utilization))
            const dynamicMax = Math.max(120, Math.ceil(maxUtilization / 10) * 10) // Round up to nearest 10, minimum 120

            // For single account, show as gauge
            if (data.length === 1) {
                const account = data[0]
                const utilization = account.utilization

                return {
                    ...baseOptions,
                    series: [
                        {
                            type: 'gauge',
                            startAngle: 180,
                            endAngle: 0,
                            min: 0,
                            max: dynamicMax,
                            splitNumber: 6,
                            axisLine: {
                                lineStyle: {
                                    width: 20,
                                    color: [
                                        [0.6, '#10b981'],  // Green: 0-60%
                                        [0.8, '#3b82f6'],  // Blue: 60-80%
                                        [0.9, '#f59e0b'],  // Yellow: 80-90%
                                        [1, '#ef4444']     // Red: 90-150%
                                    ]
                                }
                            },
                            pointer: {
                                icon: 'path://M12.8,0.7l12,40.1H0.7L12.8,0.7z',
                                length: '25%',
                                width: 10,
                                offsetCenter: [0, '-60%'],
                                itemStyle: { 
                                    color: '#1f2937',
                                    borderColor: '#ffffff',
                                    borderWidth: 2
                                },
                            },
                            axisTick: {
                                length: 10,
                                lineStyle: { color: 'auto', width: 2 }
                            },
                            splitLine: {
                                length: 15,
                                lineStyle: { color: 'auto', width: 3 }
                            },
                            axisLabel: {
                                color: '#9ca3af',
                                distance: 25,
                                fontSize: 10,
                                formatter: '{value}%'
                            },
                            title: {
                                offsetCenter: [0, '-20%'],
                                fontSize: 14,
                                color: '#9ca3af',
                                show: false
                            },
                            detail: {
                                fontSize: 20,
                                offsetCenter: [0, '20%'],
                                valueAnimation: true,
                                formatter: () => {
                                    return `${formatPercent(utilization)}\n${formatCurrency(account.actualCost, false)} / ${formatCurrency(account.budgetedCost, false)}`
                                },
                                color: 'auto'
                            },
                            data: [
                                {
                                    value: utilization,
                                    name: account.accountName
                                }
                            ]
                        }
                    ]
                }
            }

            // For multiple accounts, show as bar chart
            return {
                ...baseOptions,
                tooltip: {
                    ...baseOptions.tooltip,
                    trigger: 'axis',
                    formatter: (params: any) => {
                        const item = data[params[0].dataIndex]
                        return `${item.accountName}<br/>
                    Actual: ${formatCurrency(item.actualCost, false)}<br/>
                    Budget: ${formatCurrency(item.budgetedCost, false)}<br/>
                    Utilization: ${formatPercent(item.utilization)}`
                    }
                },
                xAxis: {
                    type: 'category',
                    data: data.map(d => d.accountName),
                    axisLine: { lineStyle: { color: '#374151' } },
                    axisLabel: {
                        color: '#6b7280',
                        rotate: 45,
                        interval: 0,
                        formatter: (value: string) => value.length > 15 ? value.substring(0, 15) + '...' : value
                    }
                },
                yAxis: {
                    type: 'value',
                    max: dynamicMax,
                    axisLine: { lineStyle: { color: '#374151' } },
                    axisLabel: {
                        color: '#6b7280',
                        formatter: (value: number) => `${value}%`
                    },
                    splitLine: { lineStyle: { color: '#1f2937' } }
                },
                series: [
                    {
                        name: 'Utilization',
                        type: 'bar',
                        data: data.map(d => ({
                            value: d.utilization,
                            itemStyle: {
                                color: d.utilization > 100 ? '#ef4444' :
                                    d.utilization > 90 ? '#f59e0b' :
                                        d.utilization > 50 ? '#3b82f6' : '#10b981'
                            }
                        }))
                    }
                ]
            }
        }

        // Pie chart for service breakdown
        if (chart.type === 'pie' && Array.isArray(data)) {
            return {
                ...baseOptions,
                tooltip: {
                    ...baseOptions.tooltip,
                    trigger: 'item',
                    formatter: '{b}<br/>${c} ({d}%)'
                },
                series: [
                    {
                        type: 'pie',
                        radius: ['40%', '65%'],
                        center: ['50%', '40%'],
                        avoidLabelOverlap: true,
                        itemStyle: {
                            borderRadius: 10,
                            borderColor: '#111827',
                            borderWidth: 2
                        },
                        label: {
                            show: true,
                            position: 'outside',
                            formatter: '{b}\n{d}%',
                            fontSize: 11,
                            color: '#9ca3af',
                            distanceToLabelLine: 5
                        },
                        labelLine: {
                            show: true,
                            length: 10,
                            length2: 5,
                            lineStyle: {
                                color: '#4b5563'
                            }
                        },
                        emphasis: {
                            label: {
                                show: true,
                                fontSize: 12,
                                fontWeight: 'normal',
                                color: '#fff'
                            }
                        },
                        data: data.map((item, index) => ({
                            value: item.value,
                            name: item.name,
                            itemStyle: {
                                color: [
                                    '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
                                    '#ec4899', '#14b8a6', '#f97316', '#06b6d4', '#84cc16'
                                ][index % 10]
                            }
                        }))
                    }
                ]
            }
        }

        // Gauge chart for forecast
        if (chart.type === 'gauge' && data?.value !== undefined) {
            const percentage = Math.min(data.percentage || 0, 150) // Cap at 150%
            return {
                ...baseOptions,
                series: [
                    {
                        type: 'gauge',
                        startAngle: 180,
                        endAngle: 0,
                        min: 0,
                        max: 150,
                        splitNumber: 6,
                        axisLine: {
                            lineStyle: {
                                width: 20,
                                color: [
                                    [0.6, '#10b981'],
                                    [0.8, '#3b82f6'],
                                    [0.9, '#f59e0b'],
                                    [1, '#ef4444']
                                ]
                            }
                        },
                        pointer: {
                            icon: 'path://M12.8,0.7l12,40.1H0.7L12.8,0.7z',
                            length: '70%',
                            width: 8,
                            offsetCenter: [0, '-60%'],
                            itemStyle: { color: 'auto' }
                        },
                        axisTick: {
                            length: 10,
                            lineStyle: { color: 'auto', width: 2 }
                        },
                        splitLine: {
                            length: 15,
                            lineStyle: { color: 'auto', width: 3 }
                        },
                        axisLabel: {
                            color: '#9ca3af',
                            distance: 25,
                            fontSize: 10,
                            formatter: '{value}%'
                        },
                        title: {
                            offsetCenter: [0, '-20%'],
                            fontSize: 14,
                            color: '#9ca3af',
                            show: true
                        },
                        detail: {
                            fontSize: 24,
                            offsetCenter: [0, '20%'],
                            valueAnimation: true,
                            formatter: () => formatCurrency(data.value),
                            color: 'auto'
                        },
                        data: [
                            {
                                value: percentage.toFixed(2),
                                name: 'vs Budget'
                            }
                        ]
                    }
                ]
            }
        }

        // Donut chart for efficiency score
        if (chart.type === 'donut' && Array.isArray(data)) {
            return {
                ...baseOptions,
                tooltip: {
                    ...baseOptions.tooltip,
                    trigger: 'item',
                    formatter: '{b}: {c} accounts ({d}%)'
                },
                legend: {
                    orient: 'horizontal',
                    bottom: '8%',
                    left: 'center',
                    textStyle: { color: '#9ca3af', fontSize: 12 },
                    itemGap: 15,
                    itemWidth: 12,
                    itemHeight: 12
                },
                series: [
                    {
                        type: 'pie',
                        radius: ['50%', '80%'],
                        avoidLabelOverlap: false,
                        label: {
                            show: true,
                            position: 'center',
                            formatter: () => {
                                const total = data.reduce((sum, item) => sum + item.value, 0)
                                return `${total}\nAccounts`
                            },
                            fontSize: 16,
                            color: '#fff'
                        },
                        emphasis: {
                            label: {
                                show: true,
                                fontSize: 20,
                                fontWeight: 'bold'
                            }
                        },
                        labelLine: { show: false },
                        data: data.map(item => ({
                            value: item.value,
                            name: item.name,
                            itemStyle: { color: item.color }
                        }))
                    }
                ]
            }
        }

        // Treemap for department comparison
        if (chart.type === 'treemap' && Array.isArray(data)) {
            return {
                ...baseOptions,
                tooltip: {
                    ...baseOptions.tooltip,
                    formatter: (info: any) => {
                        const value = info.value
                        return `${info.name}<br/>Total: ${formatCurrency(value)}`
                    }
                },
                series: [
                    {
                        type: 'treemap',
                        roam: false,
                        nodeClick: false,
                        breadcrumb: { show: false },
                        label: {
                            show: true,
                            formatter: '{b}',
                            color: '#fff'
                        },
                        itemStyle: {
                            borderColor: '#111827',
                            borderWidth: 2,
                            gapWidth: 2
                        },
                        levels: [
                            {
                                itemStyle: {
                                    borderWidth: 0,
                                    gapWidth: 2
                                }
                            },
                            {
                                itemStyle: {
                                    borderWidth: 2,
                                    gapWidth: 2
                                }
                            }
                        ],
                        data: data.map((item, index) => ({
                            name: item.name,
                            value: item.value,
                            itemStyle: {
                                color: [
                                    '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444',
                                    '#ec4899', '#14b8a6', '#f97316', '#06b6d4', '#84cc16'
                                ][index % 10]
                            }
                        }))
                    }
                ]
            }
        }

        // LOB Trend Comparison (Multi-line chart)
        if (chart.id === 'lobTrendComparison' && data?.series && data?.dates) {
            const series = data.series.map((lobSeries: any, index: number) => ({
                name: lobSeries.name,
                type: 'line',
                data: lobSeries.values,
                smooth: true,
                lineStyle: {
                    width: 2,
                    color: [
                        '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
                        '#ec4899', '#14b8a6', '#f97316', '#06b6d4', '#84cc16'
                    ][index % 10]
                },
                itemStyle: {
                    color: [
                        '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
                        '#ec4899', '#14b8a6', '#f97316', '#06b6d4', '#84cc16'
                    ][index % 10]
                }
            }))

            return {
                ...baseOptions,
                tooltip: {
                    ...baseOptions.tooltip,
                    trigger: 'axis',
                    formatter: (params: any) => {
                        let tooltip = `${params[0].name}<br/>`
                        params.forEach((param: any) => {
                            tooltip += `${param.seriesName}: ${formatCurrency(param.value)}<br/>`
                        })
                        return tooltip
                    }
                },
                legend: {
                    orient: 'horizontal',
                    top: 'top',
                    textStyle: { color: '#9ca3af' }
                },
                xAxis: {
                    type: 'category',
                    data: data.dates,
                    axisLine: { lineStyle: { color: '#374151' } },
                    axisLabel: {
                        color: '#6b7280',
                        rotate: 45,
                        fontSize: 10
                    }
                },
                yAxis: {
                    type: 'value',
                    axisLine: { lineStyle: { color: '#374151' } },
                    axisLabel: {
                        color: '#6b7280',
                        formatter: (value: number) => formatCurrency(value)
                    },
                    splitLine: { lineStyle: { color: '#1f2937' } }
                },
                series
            }
        }

        // Department Trend Comparison (Multi-line chart) - New organizational view
        if (chart.id === 'departmentTrendComparison' && data?.series && data?.dates) {
            const series = data.series.map((deptSeries: any, index: number) => ({
                name: deptSeries.name,
                type: 'line',
                data: deptSeries.values,
                smooth: true,
                lineStyle: {
                    width: 2,
                    color: [
                        '#22d3ee', '#f472b6', '#a78bfa', '#34d399', '#fbbf24',
                        '#fb7185', '#60a5fa', '#4ade80', '#f59e0b', '#ef4444'
                    ][index % 10] // Different color palette for departments
                },
                itemStyle: {
                    color: [
                        '#22d3ee', '#f472b6', '#a78bfa', '#34d399', '#fbbf24',
                        '#fb7185', '#60a5fa', '#4ade80', '#f59e0b', '#ef4444'
                    ][index % 10]
                }
            }))

            return {
                ...baseOptions,
                tooltip: {
                    ...baseOptions.tooltip,
                    trigger: 'axis',
                    formatter: (params: any) => {
                        let tooltip = `${params[0].name}<br/>`
                        params.forEach((param: any) => {
                            tooltip += `${param.seriesName}: ${formatCurrency(param.value)}<br/>`
                        })
                        return tooltip
                    }
                },
                legend: {
                    orient: 'horizontal',
                    top: 'top',
                    textStyle: { color: '#9ca3af' },
                    itemGap: 8,
                    itemWidth: 14
                },
                xAxis: {
                    type: 'category',
                    data: data.dates,
                    axisLine: { lineStyle: { color: '#374151' } },
                    axisLabel: {
                        color: '#6b7280',
                        rotate: 45,
                        fontSize: 10
                    }
                },
                yAxis: {
                    type: 'value',
                    axisLine: { lineStyle: { color: '#374151' } },
                    axisLabel: {
                        color: '#6b7280',
                        formatter: (value: number) => formatCurrency(value)
                    },
                    splitLine: { lineStyle: { color: '#1f2937' } }
                },
                series
            }
        }

        // LOB Comparison (Horizontal Bar Chart)
        if (chart.id === 'lobComparison' && Array.isArray(data)) {
            return {
                ...baseOptions,
                tooltip: {
                    ...baseOptions.tooltip,
                    trigger: 'axis',
                    formatter: (params: any) => {
                        const item = data[params[0].dataIndex]
                        return `${item.name}<br/>
                    Cost: ${formatCurrency(item.cost)}<br/>
                    Budget: ${formatCurrency(item.budget)}<br/>
                    Accounts: ${item.accounts}<br/>
                    Utilization: ${formatPercent(item.utilization)}`
                    }
                },
                xAxis: {
                    type: 'value',
                    axisLine: { lineStyle: { color: '#374151' } },
                    axisLabel: {
                        color: '#6b7280',
                        formatter: (value: number) => formatCurrency(value)
                    },
                    splitLine: { lineStyle: { color: '#1f2937' } }
                },
                yAxis: {
                    type: 'category',
                    data: data.map(d => d.name),
                    axisLine: { lineStyle: { color: '#374151' } },
                    axisLabel: {
                        color: '#6b7280',
                        formatter: (value: string) => value.length > 15 ? value.substring(0, 15) + '...' : value
                    }
                },
                series: [
                    {
                        type: 'bar',
                        data: data.map(d => ({
                            value: d.cost,
                            itemStyle: {
                                color: d.utilization > 100 ? '#ef4444' :
                                    d.utilization > 90 ? '#f59e0b' :
                                        d.utilization > 50 ? '#3b82f6' : '#10b981'
                            }
                        }))
                    }
                ]
            }
        }

        // Department Budget Performance (Multiple Gauges)
        if (chart.id === 'departmentBudgetPerformance' && Array.isArray(data)) {
            // Calculate dynamic max based on actual data
            const maxUtilization = Math.max(...data.map(d => d.utilization))
            const dynamicMax = Math.max(120, Math.ceil(maxUtilization / 10) * 10) // Round up to nearest 10, minimum 120

            // For multiple departments, show as horizontal bars instead of gauges
            return {
                ...baseOptions,
                tooltip: {
                    ...baseOptions.tooltip,
                    trigger: 'axis',
                    formatter: (params: any) => {
                        const item = data[params[0].dataIndex]
                        return `${item.name}<br/>
                    Actual: ${formatCurrency(item.actualCost)}<br/>
                    Budget: ${formatCurrency(item.budgetedCost)}<br/>
                    Accounts: ${item.accounts}<br/>
                    Utilization: ${formatPercent(item.utilization)}`
                    }
                },
                xAxis: {
                    type: 'value',
                    max: dynamicMax,
                    axisLine: { lineStyle: { color: '#374151' } },
                    axisLabel: {
                        color: '#6b7280',
                        formatter: (value: number) => `${value}%`
                    },
                    splitLine: { lineStyle: { color: '#1f2937' } }
                },
                yAxis: {
                    type: 'category',
                    data: data.map(d => d.name),
                    axisLine: { lineStyle: { color: '#374151' } },
                    axisLabel: {
                        color: '#6b7280',
                        formatter: (value: string) => value.length > 12 ? value.substring(0, 12) + '...' : value
                    }
                },
                series: [
                    {
                        type: 'bar',
                        data: data.map(d => ({
                            value: d.utilization,
                            itemStyle: {
                                color: d.utilization > 100 ? '#ef4444' :
                                    d.utilization > 90 ? '#f59e0b' :
                                        d.utilization > 50 ? '#3b82f6' : '#10b981'
                            }
                        }))
                    }
                ]
            }
        }

        // Cost Growth Rate Analysis
        if (chart.id === 'costGrowthRate' && Array.isArray(data)) {
            return {
                ...baseOptions,
                tooltip: {
                    ...baseOptions.tooltip,
                    trigger: 'axis',
                    formatter: (params: any) => {
                        const item = data[params[0].dataIndex]
                        return `${item.accountName}<br/>
                    Growth: ${formatPercent(item.growthRate)}<br/>
                    Current: ${formatCurrency(item.currentCost)}<br/>
                    Previous: ${formatCurrency(item.previousCost)}<br/>
                    Change: ${formatCurrency(item.growthAmount)}`
                    }
                },
                xAxis: {
                    type: 'category',
                    data: data.map(d => d.accountName || d.accountId),
                    axisLine: { lineStyle: { color: '#374151' } },
                    axisLabel: {
                        color: '#6b7280',
                        rotate: 45,
                        interval: 0,
                        formatter: (value: string) => value.length > 12 ? value.substring(0, 12) + '...' : value
                    }
                },
                yAxis: {
                    type: 'value',
                    axisLine: { lineStyle: { color: '#374151' } },
                    axisLabel: {
                        color: '#6b7280',
                        formatter: (value: number) => `${value}%`
                    },
                    splitLine: { lineStyle: { color: '#1f2937' } }
                },
                series: [
                    {
                        type: 'bar',
                        data: data.map(d => ({
                            value: d.growthRate,
                            itemStyle: {
                                color: d.growthRate > 50 ? '#ef4444' :     // High growth - red
                                    d.growthRate > 20 ? '#f59e0b' :     // Medium growth - orange  
                                        d.growthRate > 0 ? '#3b82f6' :      // Positive growth - blue
                                            d.growthRate > -20 ? '#10b981' :    // Small decline - green
                                                '#6b7280'                           // Large decline - gray
                            }
                        }))
                    }
                ]
            }
        }

        // Service Cost Distribution (Enhanced Treemap)
        if (chart.id === 'serviceCostDistribution' && Array.isArray(data)) {
            return {
                ...baseOptions,
                tooltip: {
                    ...baseOptions.tooltip,
                    formatter: (info: any) => {
                        const value = info.value
                        let tooltip = `${info.name}<br/>Total: ${formatCurrency(value)}`

                        // Add percentage if available
                        if (info.data?.children) {
                            const total = data.reduce((sum, item) => sum + item.value, 0)
                            const percentage = (value / total) * 100
                            tooltip += `<br/>Share: ${formatPercent(percentage)}`
                        }

                        return tooltip
                    }
                },
                series: [
                    {
                        type: 'treemap',
                        roam: false,
                        nodeClick: false,
                        breadcrumb: { show: false },
                        label: {
                            show: true,
                            formatter: (params: any) => {
                                const name = params.name
                                const value = formatCurrency(params.value)
                                return name.length > 12 ? `${name.substring(0, 12)}...\n${value}` : `${name}\n${value}`
                            },
                            color: '#fff',
                            fontSize: 11
                        },
                        itemStyle: {
                            borderColor: '#111827',
                            borderWidth: 2,
                            gapWidth: 2
                        },
                        levels: [
                            {
                                itemStyle: {
                                    borderWidth: 0,
                                    gapWidth: 2
                                }
                            },
                            {
                                itemStyle: {
                                    borderWidth: 2,
                                    gapWidth: 2
                                }
                            }
                        ],
                        data: data.map((item, index) => ({
                            name: item.name,
                            value: item.value,
                            children: item.children,
                            itemStyle: {
                                color: [
                                    '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444',
                                    '#ec4899', '#14b8a6', '#f97316', '#06b6d4', '#84cc16'
                                ][index % 10]
                            }
                        }))
                    }
                ]
            }
        }

        // Budget Variance Analysis (Scatter plot)
        if (chart.id === 'budgetVarianceAnalysis' && Array.isArray(data)) {
            const series: any[] = [
                {
                    name: 'Accounts',
                    type: 'scatter',
                    symbolSize: (dataItem: any) => {
                        const item = data[dataItem[2]]
                        return Math.max(8, Math.min(30, (item.size / 10000) * 10)) // Size based on budget
                    },
                    data: data.map((item: any, index: number) => [
                        item.budgetedCost,
                        item.actualCost,
                        index,
                        item.accountName
                    ]),
                    itemStyle: {
                        color: (params: any) => {
                            const item = data[params.data[2]]
                            return item.variancePercent > 20 ? '#ef4444' :     // Over budget - red
                                item.variancePercent > 0 ? '#f59e0b' :      // Slightly over - orange
                                    item.variancePercent > -20 ? '#10b981' :    // Under budget - green
                                        '#3b82f6'                                   // Well under - blue
                        }
                    }
                }
            ]

            // Add regression line if enabled
            if (props.showRegressionLine && data.length >= 2) {
                const regression = calculateLinearRegression(data)
                if (regression) {
                    const minX = Math.min(...data.map(d => d.budgetedCost))
                    const maxX = Math.max(...data.map(d => d.budgetedCost))

                    const regressionLine = {
                        name: `Trend Line (R² = ${regression.rSquared.toFixed(2)})`,
                        type: 'line',
                        smooth: true,
                        symbol: 'none',
                        data: [
                            [minX, regression.slope * minX + regression.intercept],
                            [maxX, regression.slope * maxX + regression.intercept]
                        ],
                        lineStyle: {
                            color: '#8b5cf6',
                            width: 2,
                            type: 'dashed'
                        }
                    }

                    series.push(regressionLine)
                }
            }

            return {
                ...baseOptions,
                tooltip: {
                    ...baseOptions.tooltip,
                    trigger: 'item',
                    formatter: (params: any) => {
                        if (params.seriesName?.includes('Trend Line')) {
                            return `${params.seriesName}<br/>Budget vs Actual correlation`
                        }
                        const item = data[params.data[2]]
                        return `${item.accountName}<br/>
                    Budget: ${formatCurrency(item.budgetedCost)}<br/>
                    Actual: ${formatCurrency(item.actualCost)}<br/>
                    Variance: ${formatPercent(item.variancePercent)}<br/>
                    Amount: ${formatCurrency(item.variance)}`
                    }
                },
                legend: props.showRegressionLine ? {
                    show: true,
                    bottom: '2%',
                    textStyle: { color: '#9ca3af' }
                } : { show: false },
                xAxis: {
                    type: 'value',
                    name: 'Budgeted Cost ($K)',
                    nameLocation: 'middle',
                    nameGap: 30,
                    axisLine: { lineStyle: { color: '#374151' } },
                    axisLabel: {
                        color: '#6b7280',
                        formatter: (value: number) => formatCurrency(value)
                    },
                    splitLine: { lineStyle: { color: '#1f2937' } }
                },
                yAxis: {
                    type: 'value',
                    name: 'Actual Cost ($K)',
                    nameLocation: 'middle',
                    nameGap: 40,
                    axisLine: { lineStyle: { color: '#374151' } },
                    axisLabel: {
                        color: '#6b7280',
                        formatter: (value: number) => formatCurrency(value)
                    },
                    splitLine: { lineStyle: { color: '#1f2937' } }
                },
                series
            }
        }

        // Cost Optimization Opportunities
        if (chart.id === 'costOptimizationOpportunities' && Array.isArray(data)) {
            return {
                ...baseOptions,
                tooltip: {
                    ...baseOptions.tooltip,
                    trigger: 'axis',
                    formatter: (params: any) => {
                        const item = data[params[0].dataIndex]
                        return `${item.accountName}<br/>
                    Opportunity: ${item.opportunity}<br/>
                    Priority: ${item.priority}<br/>
                    Potential Savings: ${formatCurrency(item.potentialSavings)}<br/>
                    Utilization: ${formatPercent(item.utilization)}`
                    }
                },
                xAxis: {
                    type: 'category',
                    data: data.map(d => d.accountName),
                    axisLine: { lineStyle: { color: '#374151' } },
                    axisLabel: {
                        color: '#6b7280',
                        rotate: 45,
                        interval: 0,
                        formatter: (value: string) => value.length > 12 ? value.substring(0, 12) + '...' : value
                    }
                },
                yAxis: {
                    type: 'value',
                    name: 'Potential Savings ($K)',
                    axisLine: { lineStyle: { color: '#374151' } },
                    axisLabel: {
                        color: '#6b7280',
                        formatter: (value: number) => formatCurrency(value)
                    },
                    splitLine: { lineStyle: { color: '#1f2937' } }
                },
                series: [
                    {
                        type: 'bar',
                        data: data.map(d => ({
                            value: d.potentialSavings,
                            itemStyle: {
                                color: d.priority === 'High' ? '#ef4444' :
                                    d.priority === 'Medium' ? '#f59e0b' : '#3b82f6'
                            }
                        }))
                    }
                ]
            }
        }

        // Account Risk Assessment (Enhanced donut)
        if (chart.id === 'accountRiskAssessment' && Array.isArray(data)) {
            return {
                ...baseOptions,
                tooltip: {
                    ...baseOptions.tooltip,
                    trigger: 'item',
                    formatter: '{b}<br/>{c} accounts ({d}%)'
                },
                legend: {
                    orient: 'horizontal',
                    bottom: '8%',
                    left: 'center',
                    textStyle: { color: '#9ca3af', fontSize: 12 },
                    itemGap: 15,
                    itemWidth: 12,
                    itemHeight: 12
                },
                series: [
                    {
                        type: 'pie',
                        radius: ['50%', '80%'],
                        avoidLabelOverlap: false,
                        label: {
                            show: true,
                            position: 'center',
                            formatter: () => {
                                const total = data.reduce((sum, item) => sum + item.value, 0)
                                return `${total}\\nTotal Accounts`
                            },
                            fontSize: 16,
                            color: '#fff'
                        },
                        emphasis: {
                            label: {
                                show: true,
                                fontSize: 20,
                                fontWeight: 'bold'
                            }
                        },
                        labelLine: { show: false },
                        data: data.map(item => ({
                            value: item.value,
                            name: item.name,
                            itemStyle: { color: item.color }
                        }))
                    }
                ]
            }
        }

        // Historical Monthly Trend Bar Chart
        if (chart.id === 'historicalMonthlyTrend' && Array.isArray(data)) {
            // Determine appropriate interval based on data length
            const labelInterval = data.length > 12 ? Math.ceil(data.length / 12) - 1 : 0
            
            return {
                ...baseOptions,
                tooltip: {
                    ...baseOptions.tooltip,
                    trigger: 'axis',
                    formatter: (params: any) => {
                        if (Array.isArray(params)) params = params[0]
                        const monthData = data[params.dataIndex]
                        const monthName = monthData.name // YYYY-MM format
                        const [year, month] = monthName.split('-')
                        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                                          'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
                        const formattedMonth = `${monthNames[parseInt(month) - 1]} ${year}`
                        return `${formattedMonth}<br/>Cost: ${monthData.formattedValue || formatCurrency(params.value)}`
                    }
                },
                xAxis: {
                    type: 'category',
                    data: data.map(d => {
                        const [year, month] = d.name.split('-')
                        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                                          'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
                        const shortYear = year.substring(2) // Use 2-digit year for space
                        return `${monthNames[parseInt(month) - 1]} '${shortYear}`
                    }),
                    axisLine: { lineStyle: { color: '#374151' } },
                    axisLabel: {
                        color: '#6b7280',
                        rotate: 45,
                        interval: labelInterval, // Show fewer labels for longer periods
                        fontSize: 9
                    }
                },
                yAxis: {
                    type: 'value',
                    axisLine: { lineStyle: { color: '#374151' } },
                    axisLabel: {
                        color: '#6b7280',
                        formatter: (value: number) => formatCurrency(value)
                    },
                    splitLine: { lineStyle: { color: '#1f2937' } }
                },
                series: [
                    {
                        type: 'bar',
                        data: data.map((d, index) => ({
                            value: d.value,
                            itemStyle: {
                                color: {
                                    type: 'linear',
                                    x: 0, y: 0, x2: 0, y2: 1,
                                    colorStops: [
                                        { offset: 0, color: '#10b981' },
                                        { offset: 1, color: '#065f46' }
                                    ]
                                }
                            }
                        }))
                    }
                ]
            }
        }

        // Historical Monthly Trend Line Chart
        if (chart.id === 'historicalComparison' && data?.series && data?.dates) {
            const series = data.series.map((yearSeries: any, index: number) => ({
                name: yearSeries.name,
                type: 'line',
                data: yearSeries.values,
                smooth: true,
                lineStyle: {
                    width: 2,
                    color: '#3b82f6'
                },
                itemStyle: {
                    color: '#3b82f6'
                },
                areaStyle: {
                    color: {
                        type: 'linear',
                        x: 0, y: 0, x2: 0, y2: 1,
                        colorStops: [
                            { offset: 0, color: 'rgba(59, 130, 246, 0.3)' },
                            { offset: 1, color: 'rgba(59, 130, 246, 0.05)' }
                        ]
                    }
                }
            }))

            return {
                ...baseOptions,
                tooltip: {
                    ...baseOptions.tooltip,
                    trigger: 'axis',
                    formatter: (params: any) => {
                        if (Array.isArray(params)) params = params[0]
                        return `${params.name}<br/>Cost: ${formatCurrency(params.value)}`
                    }
                },
                xAxis: {
                    type: 'category',
                    data: data.dates,
                    axisLine: { lineStyle: { color: '#374151' } },
                    axisLabel: {
                        color: '#6b7280',
                        fontSize: 9,
                        rotate: 45,
                        interval: Math.floor(data.dates.length / 12) // Show ~12 labels max
                    }
                },
                yAxis: {
                    type: 'value',
                    axisLine: { lineStyle: { color: '#374151' } },
                    axisLabel: {
                        color: '#6b7280',
                        formatter: (value: number) => formatCurrency(value)
                    },
                    splitLine: { lineStyle: { color: '#1f2937' } }
                },
                series
            }
        }

        // Billable vs Proforma Comparison Chart
        if (chart.id === 'billableVsProforma' && Array.isArray(data)) {
            return {
                ...baseOptions,
                tooltip: {
                    ...baseOptions.tooltip,
                    trigger: 'axis',
                    formatter: (params: any) => {
                        const item = data[params[0].dataIndex]
                        return `
                            <div class="text-sm">
                                <div class="font-semibold">${item.accountName}</div>
                                <div>Billable: ${formatCurrency(item.billableCost, false)}</div>
                                <div>Proforma: ${formatCurrency(item.proformaCost, false)}</div>
                                <div class="${item.difference > 0 ? 'text-red-400' : 'text-green-400'}">
                                    Difference: ${formatCurrency(Math.abs(item.difference), false)} 
                                    (${item.percentChange > 0 ? '+' : ''}${item.percentChange.toFixed(1)}%)
                                </div>
                            </div>
                        `
                    }
                },
                legend: {
                    data: ['Billable', 'Proforma'],
                    textStyle: { color: '#9ca3af' },
                    top: 10
                },
                xAxis: {
                    type: 'category',
                    data: data.map(d => d.accountName || d.accountId),
                    axisLine: { lineStyle: { color: '#374151' } },
                    axisLabel: {
                        color: '#6b7280',
                        rotate: 45,
                        interval: 0,
                        formatter: (value: string) => value.length > 20 ? value.substring(0, 20) + '...' : value
                    }
                },
                yAxis: {
                    type: 'value',
                    axisLine: { lineStyle: { color: '#374151' } },
                    axisLabel: {
                        color: '#6b7280',
                        formatter: (value: number) => formatCurrency(value)
                    },
                    splitLine: { lineStyle: { color: '#1f2937' } }
                },
                series: [
                    {
                        name: 'Billable',
                        type: 'bar',
                        data: data.map(d => d.billableCost),
                        itemStyle: {
                            color: '#6b7280' // Gray for billable
                        }
                    },
                    {
                        name: 'Proforma',
                        type: 'bar',
                        data: data.map(d => d.proformaCost),
                        itemStyle: {
                            color: '#3b82f6' // Blue for proforma
                        }
                    }
                ]
            }
        }

        // Forecast comparison charts (current vs forecast)
        if (chart.id === 'currentVsForecastComparison' && Array.isArray(data)) {
            return {
                ...baseOptions,
                tooltip: {
                    ...baseOptions.tooltip,
                    trigger: 'axis',
                    formatter: (params: any) => {
                        const dataIndex = params[0].dataIndex
                        const item = data[dataIndex]
                        const change = item.percentChange > 0 ? '+' : ''
                        return `${item.accountName}<br/>
                        Current: ${formatCurrency(item.currentCost)}<br/>
                        Forecast: ${formatCurrency(item.forecastCost)}<br/>
                        Change: ${change}${item.percentChange.toFixed(1)}%<br/>
                        Difference: ${formatCurrency(item.difference)}`
                    }
                },
                xAxis: {
                    type: 'category',
                    data: data.map(d => d.accountName),
                    axisLine: { lineStyle: { color: '#374151' } },
                    axisLabel: {
                        color: '#6b7280',
                        rotate: 45,
                        interval: 0,
                        formatter: (value: string) => value.length > 15 ? value.substring(0, 15) + '...' : value
                    }
                },
                yAxis: {
                    type: 'value',
                    axisLine: { lineStyle: { color: '#374151' } },
                    axisLabel: {
                        color: '#6b7280',
                        formatter: (value: number) => formatCurrency(value)
                    },
                    splitLine: { lineStyle: { color: '#1f2937' } }
                },
                series: [
                    {
                        name: 'Current',
                        type: 'bar',
                        data: data.map(d => d.currentCost),
                        itemStyle: { color: '#3b82f6' }
                    },
                    {
                        name: 'Forecast',
                        type: 'bar',
                        data: data.map(d => d.forecastCost),
                        itemStyle: { color: '#10b981' }
                    }
                ]
            }
        }

        // Organization Forecast Comparison - Daily Spend + Forecast
        if (chart.id === 'organizationForecastComparison' && data?.series && data?.dates) {
            return {
                ...baseOptions,
                tooltip: {
                    ...baseOptions.tooltip,
                    trigger: 'axis',
                    formatter: (params: any) => {
                        const dateIndex = params[0].dataIndex
                        const date = data.dates[dateIndex]
                        let result = `${date}<br/>`
                        
                        params.forEach((param: any) => {
                            if (param.value !== 0 && param.value !== null) {
                                result += `${param.seriesName}: ${formatCurrency(param.value)}<br/>`
                            }
                        })
                        
                        // Add metadata if we're at current day
                        if (data.metadata && dateIndex === data.metadata.currentDay - 1) {
                            result += `<br/><b>Today (Day ${data.metadata.currentDay})</b><br/>`
                            result += `Avg Daily Actual: ${formatCurrency(data.metadata.avgDailyActual)}<br/>`
                            result += `Avg Daily Forecast: ${formatCurrency(data.metadata.avgDailyForecast)}<br/>`
                            result += `Progress: ${data.metadata.percentThroughMonth.toFixed(1)}% of month`
                        }
                        
                        return result
                    }
                },
                legend: {
                    data: ['Actual Daily Spend', 'AWS Projection', 'Cumulative Actual', 'Cumulative AWS Projection', 'GDMS Forecasted Costs'],
                    textStyle: { color: '#9ca3af' },
                    top: 10
                },
                xAxis: {
                    type: 'category',
                    data: data.dates,
                    axisLine: { lineStyle: { color: '#374151' } },
                    axisLabel: { 
                        color: '#6b7280',
                        interval: 'auto',
                        rotate: 45
                    },
                    splitLine: {
                        show: true,
                        interval: (index: number) => {
                            // Show line at current day
                            return data.metadata && index === data.metadata.currentDay - 1
                        },
                        lineStyle: {
                            color: '#fbbf24',
                            type: 'dashed',
                            width: 2
                        }
                    }
                },
                yAxis: [
                    {
                        type: 'value',
                        position: 'left',
                        axisLine: { lineStyle: { color: '#374151' } },
                        axisLabel: {
                            color: '#6b7280',
                            formatter: (value: number) => formatCurrency(value)
                        },
                        splitLine: { lineStyle: { color: '#1f2937' } }
                    }
                ],
                series: [
                    {
                        name: 'Actual Daily Spend',
                        type: 'bar',
                        data: data.series[0].data,
                        itemStyle: { color: '#3b82f6' },
                        barWidth: '40%'
                    },
                    {
                        name: 'AWS Projection',
                        type: 'bar',
                        data: data.series[1].data,
                        itemStyle: { 
                            color: '#10b981',
                            opacity: 0.7
                        },
                        barWidth: '40%'
                    },
                    {
                        name: 'Cumulative Actual',
                        type: 'line',
                        data: data.series[2].data,
                        smooth: true,
                        lineStyle: { 
                            color: '#3b82f6',
                            width: 3
                        },
                        symbol: 'circle',
                        symbolSize: 4
                    },
                    {
                        name: 'Cumulative AWS Projection',
                        type: 'line',
                        data: data.series[3].data,
                        smooth: true,
                        lineStyle: { 
                            color: '#10b981',
                            width: 2,
                            type: 'dashed'
                        },
                        symbol: 'none'
                    },
                    {
                        name: 'GDMS Forecasted Costs',
                        type: 'line',
                        data: data.series[4].data,
                        lineStyle: { 
                            color: '#f59e0b',
                            width: 2,
                            type: 'dotted'
                        },
                        symbol: 'none'
                    }
                ]
            }
        }

        // Monthly trend with forecast charts
        if (chart.id === 'monthlyTrendWithForecast' && Array.isArray(data)) {
            return {
                ...baseOptions,
                tooltip: {
                    ...baseOptions.tooltip,
                    trigger: 'axis',
                    formatter: (params: any) => {
                        const dataIndex = params[0].dataIndex
                        const item = data[dataIndex]
                        return `${item.accountName}<br/>
                        Last Month: ${formatCurrency(item.lastMonth)}<br/>
                        Current: ${formatCurrency(item.currentMonth)}<br/>
                        Forecast: ${formatCurrency(item.forecast)}<br/>
                        MoM Change: ${item.monthOverMonth > 0 ? '+' : ''}${item.monthOverMonth.toFixed(1)}%<br/>
                        Forecast Change: ${item.forecastChange > 0 ? '+' : ''}${item.forecastChange.toFixed(1)}%`
                    }
                },
                xAxis: {
                    type: 'category',
                    data: data.map(d => d.accountName),
                    axisLine: { lineStyle: { color: '#374151' } },
                    axisLabel: {
                        color: '#6b7280',
                        rotate: 45,
                        interval: 0,
                        formatter: (value: string) => value.length > 12 ? value.substring(0, 12) + '...' : value
                    }
                },
                yAxis: {
                    type: 'value',
                    axisLine: { lineStyle: { color: '#374151' } },
                    axisLabel: {
                        color: '#6b7280',
                        formatter: (value: number) => formatCurrency(value)
                    },
                    splitLine: { lineStyle: { color: '#1f2937' } }
                },
                series: [
                    {
                        name: 'Last Month',
                        type: 'bar',
                        data: data.map(d => d.lastMonth),
                        itemStyle: { color: '#6b7280' }
                    },
                    {
                        name: 'Current',
                        type: 'bar',
                        data: data.map(d => d.currentMonth),
                        itemStyle: { color: '#3b82f6' }
                    },
                    {
                        name: 'Forecast',
                        type: 'bar',
                        data: data.map(d => d.forecast),
                        itemStyle: { color: '#10b981' }
                    }
                ]
            }
        }

        // Account forecast comparison chart
        if (chart.id === 'accountForecastComparison' && Array.isArray(data)) {
            return {
                ...baseOptions,
                tooltip: {
                    ...baseOptions.tooltip,
                    trigger: 'axis',
                    formatter: (params: any) => {
                        const dataIndex = params[0].dataIndex
                        const item = data[dataIndex]
                        return `${item.accountName}<br/>
                        Current: ${formatCurrency(item.currentCost)}<br/>
                        Forecast: ${formatCurrency(item.forecastCost)}<br/>
                        Budget: ${formatCurrency(item.budget)}<br/>
                        Growth: ${item.growthProjection > 0 ? '+' : ''}${item.growthProjection.toFixed(1)}%<br/>
                        Risk: ${item.riskLevel}`
                    }
                },
                xAxis: {
                    type: 'category',
                    data: data.map(d => d.accountName),
                    axisLine: { lineStyle: { color: '#374151' } },
                    axisLabel: {
                        color: '#6b7280',
                        rotate: 45,
                        interval: 0,
                        formatter: (value: string) => value.length > 15 ? value.substring(0, 15) + '...' : value
                    }
                },
                yAxis: {
                    type: 'value',
                    axisLine: { lineStyle: { color: '#374151' } },
                    axisLabel: {
                        color: '#6b7280',
                        formatter: (value: number) => formatCurrency(value)
                    },
                    splitLine: { lineStyle: { color: '#1f2937' } }
                },
                series: [
                    {
                        name: 'Current',
                        type: 'bar',
                        data: data.map(d => d.currentCost),
                        itemStyle: { color: '#3b82f6' }
                    },
                    {
                        name: 'Forecast',
                        type: 'bar', 
                        data: data.map(d => d.forecastCost),
                        itemStyle: { color: '#10b981' }
                    },
                    {
                        name: 'Budget',
                        type: 'bar',
                        data: data.map(d => d.budget),
                        itemStyle: { color: '#f59e0b' }
                    }
                ]
            }
        }

        // Extended forecast trend chart  
        if (chart.id === 'extendedForecastTrend' && data?.dates && data?.series) {
            return {
                ...baseOptions,
                tooltip: {
                    ...baseOptions.tooltip,
                    trigger: 'axis',
                    formatter: (params: any) => {
                        const date = params[0].name
                        const forecast = params[0].value
                        return `${date}<br/>Forecast: ${formatCurrency(forecast)}`
                    }
                },
                xAxis: {
                    type: 'category',
                    data: data.dates,
                    axisLine: { lineStyle: { color: '#374151' } },
                    axisLabel: { color: '#6b7280' }
                },
                yAxis: {
                    type: 'value',
                    axisLine: { lineStyle: { color: '#374151' } },
                    axisLabel: {
                        color: '#6b7280',
                        formatter: (value: number) => formatCurrency(value)
                    },
                    splitLine: { lineStyle: { color: '#1f2937' } }
                },
                series: [
                    {
                        name: 'Forecast',
                        type: 'line',
                        data: data.series[0].values,
                        smooth: true,
                        lineStyle: { color: '#10b981', width: 3 },
                        areaStyle: {
                            color: {
                                type: 'linear',
                                x: 0, y: 0, x2: 0, y2: 1,
                                colorStops: [
                                    { offset: 0, color: 'rgba(16, 185, 129, 0.3)' },
                                    { offset: 1, color: 'rgba(16, 185, 129, 0.1)' }
                                ]
                            }
                        }
                    }
                ]
            }
        }

        // Forecast Projection Line (Actual + Forecast Overlay)
        if (chart.id === 'forecastProjectionLine' && data?.actualSeries && data?.forecastSeries) {
            return {
                ...baseOptions,
                tooltip: {
                    ...baseOptions.tooltip,
                    trigger: 'axis',
                    formatter: (params: any) => {
                        let result = `${params[0].name}<br/>`
                        params.forEach((param: any) => {
                            result += `${param.seriesName}: ${formatCurrency(param.value)}<br/>`
                        })
                        return result
                    }
                },
                xAxis: {
                    type: 'category',
                    data: data.dates,
                    axisLine: { lineStyle: { color: '#374151' } },
                    axisLabel: { color: '#6b7280' }
                },
                yAxis: {
                    type: 'value',
                    axisLine: { lineStyle: { color: '#374151' } },
                    axisLabel: {
                        color: '#6b7280',
                        formatter: (value: number) => formatCurrency(value)
                    },
                    splitLine: { lineStyle: { color: '#1f2937' } }
                },
                series: [
                    {
                        name: 'Actual Spend',
                        type: 'line',
                        data: [...data.actualSeries.values, ...Array(data.forecastSeries.values.length).fill(null)],
                        lineStyle: { color: '#3b82f6', width: 3 },
                        connectNulls: false
                    },
                    {
                        name: 'AWS Projected Spend',
                        type: 'line',
                        data: [...Array(data.actualSeries.values.length).fill(null), ...data.forecastSeries.values],
                        lineStyle: { color: '#10b981', width: 3, type: 'dashed' },
                        connectNulls: false
                    },
                    {
                        name: 'GDMS Forecasted Costs',
                        type: 'line',
                        data: Array(data.dates.length).fill(data.totalBudget),
                        lineStyle: { color: '#f59e0b', width: 2, type: 'dotted' }
                    }
                ]
            }
        }

        // Cumulative Burn-up Chart
        if (chart.id === 'cumulativeBurnUp' && Array.isArray(data)) {
            // Multi-account burn-up chart
            const allMonths = data.length > 0 ? data[0].months : []
            const series: any[] = []
            
            data.forEach((account: any) => {
                // Actual spend line for each account
                series.push({
                    name: account.accountName,
                    type: 'line',
                    data: account.actualSpend,
                    smooth: true,
                    lineStyle: { width: 2 }
                })
                
                // Budget track line (if budget exists)
                if (account.totalBudget > 0) {
                    series.push({
                        name: `${account.accountName} Budget`,
                        type: 'line',
                        data: account.budgetTrack,
                        lineStyle: { 
                            type: 'dashed',
                            width: 1,
                            opacity: 0.5
                        },
                        symbol: 'none'
                    })
                }
            })
            
            return {
                ...baseOptions,
                tooltip: {
                    ...baseOptions.tooltip,
                    trigger: 'axis',
                    formatter: (params: any) => {
                        const month = params[0].name
                        let result = `${month}<br/>`
                        params.forEach((param: any) => {
                            const isBudget = param.seriesName.includes('Budget')
                            const prefix = isBudget ? 'Budget: ' : 'Actual: '
                            result += `${param.seriesName}: ${prefix}${formatCurrency(param.value)}<br/>`
                        })
                        return result
                    }
                },
                legend: {
                    data: series.map(s => s.name),
                    textStyle: { color: '#9ca3af' },
                    type: 'scroll'
                },
                xAxis: {
                    type: 'category',
                    data: allMonths,
                    axisLine: { lineStyle: { color: '#374151' } },
                    axisLabel: { color: '#6b7280' }
                },
                yAxis: {
                    type: 'value',
                    name: 'Cumulative Spend',
                    axisLine: { lineStyle: { color: '#374151' } },
                    axisLabel: {
                        color: '#6b7280',
                        formatter: (value: number) => formatCurrency(value)
                    },
                    splitLine: { lineStyle: { color: '#1f2937' } }
                },
                series
            }
        }

        // Budget S-Curve Tracking
        if (chart.id === 'budgetSCurve' && data?.months && data?.actualSpend) {
            return {
                ...baseOptions,
                tooltip: {
                    ...baseOptions.tooltip,
                    trigger: 'axis',
                    formatter: (params: any) => {
                        const month = params[0].name
                        let result = `${month}<br/>`
                        params.forEach((param: any) => {
                            if (param.seriesName === 'Actual Spend') {
                                result += `Actual: ${formatCurrency(param.value)}<br/>`
                            } else if (param.seriesName === 'Budget Envelope') {
                                result += `Budget Target: ${formatCurrency(param.value)}<br/>`
                            } else if (param.seriesName === 'Forecast Projection') {
                                result += `Projected: ${formatCurrency(param.value)}<br/>`
                            }
                        })
                        if (data.isOverBudget) {
                            result += '<span style="color: #ef4444">⚠ Over Budget</span>'
                        }
                        return result
                    }
                },
                legend: {
                    data: [
                        'Actual Spend',
                        ...(data.budgetEnvelope ? ['Budget Envelope'] : []),
                        ...(data.forecastProjection ? ['Forecast Projection'] : [])
                    ],
                    textStyle: { color: '#9ca3af' }
                },
                xAxis: {
                    type: 'category',
                    data: data.months,
                    axisLine: { lineStyle: { color: '#374151' } },
                    axisLabel: { 
                        color: '#6b7280',
                        rotate: 45,
                        interval: 0
                    }
                },
                yAxis: {
                    type: 'value',
                    name: 'Cumulative Spend',
                    axisLine: { lineStyle: { color: '#374151' } },
                    axisLabel: {
                        color: '#6b7280',
                        formatter: (value: number) => formatCurrency(value)
                    },
                    splitLine: { lineStyle: { color: '#1f2937' } }
                },
                series: [
                    {
                        name: 'Actual Spend',
                        type: 'line',
                        data: data.actualSpend,
                        smooth: true,
                        lineStyle: { color: '#3b82f6', width: 3 },
                        areaStyle: {
                            color: {
                                type: 'linear',
                                x: 0, y: 0, x2: 0, y2: 1,
                                colorStops: [
                                    { offset: 0, color: 'rgba(59, 130, 246, 0.3)' },
                                    { offset: 1, color: 'rgba(59, 130, 246, 0.05)' }
                                ]
                            }
                        }
                    },
                    ...(data.budgetEnvelope ? [{
                        name: 'Budget Envelope',
                        type: 'line',
                        data: data.budgetEnvelope,
                        smooth: true,
                        lineStyle: { 
                            color: '#f59e0b', 
                            width: 2,
                            type: 'dashed'
                        },
                        symbol: 'none'
                    }] : []),
                    ...(data.forecastProjection ? [{
                        name: 'Forecast Projection',
                        type: 'line',
                        data: [...Array(data.actualSpend.length - data.forecastProjection.length).fill(null), ...data.forecastProjection],
                        lineStyle: { 
                            color: '#10b981', 
                            width: 2,
                            type: 'dotted'
                        },
                        connectNulls: false,
                        symbol: 'none'
                    }] : [])
                ]
            }
        }

        // Scenario Overlay Chart
        if (chart.id === 'scenarioOverlay' && data?.dates && data?.scenarios) {
            const series = data.scenarios.map((scenario: any) => ({
                name: scenario.name,
                type: 'line',
                data: scenario.values,
                smooth: true,
                lineStyle: { 
                    color: scenario.color,
                    width: 2
                },
                emphasis: {
                    focus: 'series'
                }
            }))
            
            return {
                ...baseOptions,
                tooltip: {
                    ...baseOptions.tooltip,
                    trigger: 'axis',
                    formatter: (params: any) => {
                        const date = params[0].name
                        let result = `${date}<br/>`
                        params.forEach((param: any) => {
                            result += `${param.seriesName}: ${formatCurrency(param.value)}<br/>`
                        })
                        return result
                    }
                },
                legend: {
                    data: data.scenarios.map((s: any) => s.name),
                    textStyle: { color: '#9ca3af' }
                },
                xAxis: {
                    type: 'category',
                    data: data.dates,
                    axisLine: { lineStyle: { color: '#374151' } },
                    axisLabel: { color: '#6b7280' }
                },
                yAxis: {
                    type: 'value',
                    name: 'Forecast Amount',
                    axisLine: { lineStyle: { color: '#374151' } },
                    axisLabel: {
                        color: '#6b7280',
                        formatter: (value: number) => formatCurrency(value)
                    },
                    splitLine: { lineStyle: { color: '#1f2937' } }
                },
                series
            }
        }

        // Forecast with Confidence Bands
        if (chart.id === 'forecastConfidenceBands' && data?.dates && data?.forecastLine) {
            const series: any[] = []
            
            // Only add confidence bands if we have real data from API
            if (data.upperConfidence && data.lowerConfidence) {
                series.push(
                    {
                        name: 'Upper Confidence',
                        type: 'line',
                        data: data.upperConfidence,
                        lineStyle: { opacity: 0 },
                        stack: 'confidence',
                        symbol: 'none'
                    },
                    {
                        name: 'Lower Confidence',
                        type: 'line',
                        data: data.lowerConfidence,
                        lineStyle: { opacity: 0 },
                        areaStyle: {
                            color: 'rgba(16, 185, 129, 0.1)'
                        },
                        stack: 'confidence',
                        symbol: 'none'
                    }
                )
            }
            
            // Always add the forecast line
            series.push({
                name: 'Forecast',
                type: 'line',
                data: data.forecastLine,
                lineStyle: { color: '#10b981', width: 3 },
                symbol: 'circle'
            })
            
            return {
                ...baseOptions,
                tooltip: {
                    ...baseOptions.tooltip,
                    trigger: 'axis',
                    formatter: (params: any) => {
                        const date = params[0].name
                        let result = `${date}<br/>`
                        
                        // Find the forecast value
                        const forecastParam = params.find((p: any) => p.seriesName === 'Forecast')
                        if (forecastParam) {
                            result += `Forecast: ${formatCurrency(forecastParam.value)}<br/>`
                        }
                        
                        // Only show confidence bands if they exist
                        if (data.confidenceLevel) {
                            const upperParam = params.find((p: any) => p.seriesName === 'Upper Confidence')
                            const lowerParam = params.find((p: any) => p.seriesName === 'Lower Confidence')
                            if (upperParam) result += `Upper Bound: ${formatCurrency(upperParam.value)}<br/>`
                            if (lowerParam) result += `Lower Bound: ${formatCurrency(lowerParam.value)}`
                        }
                        
                        return result
                    }
                },
                xAxis: {
                    type: 'category',
                    data: data.dates,
                    axisLine: { lineStyle: { color: '#374151' } },
                    axisLabel: { color: '#6b7280' }
                },
                yAxis: {
                    type: 'value',
                    axisLine: { lineStyle: { color: '#374151' } },
                    axisLabel: {
                        color: '#6b7280',
                        formatter: (value: number) => formatCurrency(value)
                    },
                    splitLine: { lineStyle: { color: '#1f2937' } }
                },
                series
            }
        }

        // Simple bar chart for top spenders and other generic bar charts
        if (chart.type === 'bar' && Array.isArray(data)) {
            return {
                ...baseOptions,
                tooltip: {
                    ...baseOptions.tooltip,
                    trigger: 'axis',
                    formatter: (params: any) => {
                        if (Array.isArray(params)) params = params[0]
                        return `${params.name}<br/>Cost: ${formatCurrency(params.value, false)}`
                    }
                },
                xAxis: {
                    type: 'category',
                    data: data.map(d => d.accountName || d.name),
                    axisLine: { lineStyle: { color: '#374151' } },
                    axisLabel: {
                        color: '#6b7280',
                        rotate: 45,
                        interval: 0,
                        formatter: (value: string) => value.length > 15 ? value.substring(0, 15) + '...' : value
                    }
                },
                yAxis: {
                    type: 'value',
                    axisLine: { lineStyle: { color: '#374151' } },
                    axisLabel: {
                        color: '#6b7280',
                        formatter: (value: number) => formatCurrency(value)
                    },
                    splitLine: { lineStyle: { color: '#1f2937' } }
                },
                series: [
                    {
                        type: 'bar',
                        data: data.map(d => d.cost || d.actualCost || d.value),
                        itemStyle: {
                            color: {
                                type: 'linear',
                                x: 0, y: 0, x2: 0, y2: 1,
                                colorStops: [
                                    { offset: 0, color: '#3b82f6' },
                                    { offset: 1, color: '#1e40af' }
                                ]
                            }
                        }
                    }
                ]
            }
        }

        // Year-over-Year Comparison Chart
        if (chart.id === 'yearOverYearComparison' && data?.series && data?.dates) {
            const series = data.series.map((yearSeries: any, index: number) => ({
                name: yearSeries.name,
                type: 'line',
                data: yearSeries.values,
                smooth: true,
                lineStyle: {
                    width: 3,
                    color: index === 0 ? '#6b7280' : '#3b82f6' // Gray for last year, blue for this year
                },
                itemStyle: {
                    color: index === 0 ? '#6b7280' : '#3b82f6'
                }
            }))

            return {
                ...baseOptions,
                tooltip: {
                    ...baseOptions.tooltip,
                    trigger: 'axis',
                    formatter: (params: any) => {
                        const monthName = data.dates[params[0].dataIndex]
                        let tooltip = `${monthName}<br/>`
                        params.forEach((param: any) => {
                            tooltip += `${param.seriesName}: ${formatCurrency(param.value)}<br/>`
                        })
                        return tooltip
                    }
                },
                legend: {
                    orient: 'horizontal',
                    top: 'top',
                    textStyle: { color: '#9ca3af' }
                },
                xAxis: {
                    type: 'category',
                    data: data.dates,
                    axisLine: { lineStyle: { color: '#374151' } },
                    axisLabel: { color: '#6b7280' }
                },
                yAxis: {
                    type: 'value',
                    axisLine: { lineStyle: { color: '#374151' } },
                    axisLabel: {
                        color: '#6b7280',
                        formatter: (value: number) => formatCurrency(value)
                    },
                    splitLine: { lineStyle: { color: '#1f2937' } }
                },
                series
            }
        }

        // Month-over-Month Comparison Chart
        if (chart.id === 'monthOverMonthComparison' && Array.isArray(data)) {
            return {
                ...baseOptions,
                tooltip: {
                    ...baseOptions.tooltip,
                    trigger: 'axis',
                    formatter: (params: any) => {
                        if (Array.isArray(params)) params = params[0]
                        const item = data[params.dataIndex]
                        return `${item.name}<br/>Cost: ${item.formattedValue}`
                    }
                },
                xAxis: {
                    type: 'category',
                    data: data.map(d => d.name),
                    axisLine: { lineStyle: { color: '#374151' } },
                    axisLabel: { color: '#6b7280' }
                },
                yAxis: {
                    type: 'value',
                    axisLine: { lineStyle: { color: '#374151' } },
                    axisLabel: {
                        color: '#6b7280',
                        formatter: (value: number) => formatCurrency(value)
                    },
                    splitLine: { lineStyle: { color: '#1f2937' } }
                },
                series: [{
                    type: 'bar',
                    data: data.map((d, index) => ({
                        value: d.value,
                        itemStyle: {
                            color: index === 0 ? '#6b7280' : '#3b82f6' // Gray for last month, blue for this month
                        }
                    }))
                }]
            }
        }

        // Last 24 Months Trend Chart
        if (chart.id === 'last24MonthsTrend' && data?.series && data?.dates) {
            const series = data.series.map((trendSeries: any) => ({
                name: trendSeries.name,
                type: 'line',
                data: trendSeries.values,
                smooth: true,
                lineStyle: {
                    width: 2,
                    color: '#10b981'
                },
                itemStyle: {
                    color: '#10b981'
                },
                areaStyle: {
                    color: {
                        type: 'linear',
                        x: 0, y: 0, x2: 0, y2: 1,
                        colorStops: [
                            { offset: 0, color: 'rgba(16, 185, 129, 0.3)' },
                            { offset: 1, color: 'rgba(16, 185, 129, 0.05)' }
                        ]
                    }
                }
            }))

            return {
                ...baseOptions,
                tooltip: {
                    ...baseOptions.tooltip,
                    trigger: 'axis',
                    formatter: (params: any) => {
                        if (Array.isArray(params)) params = params[0]
                        return `${params.name}<br/>Cost: ${formatCurrency(params.value)}`
                    }
                },
                xAxis: {
                    type: 'category',
                    data: data.dates,
                    axisLine: { lineStyle: { color: '#374151' } },
                    axisLabel: {
                        color: '#6b7280',
                        fontSize: 9,
                        rotate: 45,
                        interval: Math.floor(data.dates.length / 12)
                    }
                },
                yAxis: {
                    type: 'value',
                    axisLine: { lineStyle: { color: '#374151' } },
                    axisLabel: {
                        color: '#6b7280',
                        formatter: (value: number) => formatCurrency(value)
                    },
                    splitLine: { lineStyle: { color: '#1f2937' } }
                },
                series
            }
        }

        // Year-End Forecast with Actuals (Full Year View)
        if (chart.id === 'yearEndForecast' && data?.months && data?.series) {
            const series: any[] = []

            // Check if we have confidence bands
            const hasConfidenceBands = data.confidenceBands?.upper &&
                                     data.confidenceBands.upper.some((v: any) => v !== null)

            console.log('[Chart Render] yearEndForecast hasConfidenceBands:', hasConfidenceBands)
            console.log('[Chart Render] Forecast data:', data.series[1]?.data)
            console.log('[Chart Render] Upper bounds:', data.confidenceBands?.upper)
            console.log('[Chart Render] Lower bounds:', data.confidenceBands?.lower)

            // Add confidence band area using stacked area approach
            if (hasConfidenceBands) {
                // Calculate the area between lower and upper bounds
                // ECharts stacked area: lower bound + (upper - lower) difference
                const areaData = data.confidenceBands.lower.map((lower: number | null, idx: number) => {
                    const upper = data.confidenceBands.upper[idx]
                    if (lower !== null && upper !== null) {
                        return upper - lower // The height of the confidence band
                    }
                    return null
                })

                // Lower bound line (base of the confidence area)
                series.push({
                    name: 'Confidence Lower',
                    type: 'line',
                    data: data.confidenceBands.lower,
                    lineStyle: { opacity: 0 },
                    symbol: 'none',
                    stack: 'confidence',
                    z: 0
                })

                // Confidence band (stacked on top of lower bound)
                series.push({
                    name: '80% Confidence Band',
                    type: 'line',
                    data: areaData,
                    lineStyle: { opacity: 0 },
                    areaStyle: {
                        color: 'rgba(16, 185, 129, 0.15)'
                    },
                    stack: 'confidence',
                    symbol: 'none',
                    z: 0
                })
            }

            // Build stacked bars for actual and forecast
            // Current month shows both: actual (bottom) + forecast remainder (top)
            const currentMonthIndex = data.metadata?.currentMonth - 1 // Convert to 0-indexed

            // Actual spend series (blue bars for past + current month)
            const actualBars = data.series[0].data.map((val: number | null) => val)

            // Forecast series for future months (green bars)
            const forecastBars = data.series[1].data.map((val: number | null, idx: number) => {
                // For current month, show forecast remainder (end-of-month forecast minus current actual)
                if (idx === currentMonthIndex && val !== null && actualBars[idx] !== null) {
                    return val - actualBars[idx] // Remaining forecast to reach month-end
                }
                return val
            })

            // Actual costs (blue bars)
            series.push({
                name: 'Actual',
                type: 'bar',
                stack: 'total',
                data: actualBars,
                itemStyle: {
                    color: '#3b82f6',
                    borderRadius: [0, 0, 0, 0] // No radius for stacked bars
                },
                barWidth: '60%',
                z: 2
            })

            // AWS Projection (green bars, stacked on top of actual for current month)
            series.push({
                name: 'AWS Projection',
                type: 'bar',
                stack: 'total',
                data: forecastBars,
                itemStyle: {
                    color: '#10b981',
                    opacity: 0.8,
                    borderRadius: [4, 4, 0, 0] // Only top has radius
                },
                barWidth: '60%',
                z: 2
            })

            // Add trend lines overlaying the bars
            const actualLineData = data.series[0].data.map((v: number | null) => v)
            const forecastLineData = data.series[1].data.map((v: number | null) => v)

            // Actual trend line
            series.push({
                name: 'Actual Trend',
                type: 'line',
                data: actualLineData,
                smooth: true,
                lineStyle: {
                    color: '#1e40af',
                    width: 2
                },
                symbol: 'circle',
                symbolSize: 6,
                z: 3
            })

            // AWS Projection trend line
            series.push({
                name: 'AWS Projection Trend',
                type: 'line',
                data: forecastLineData,
                smooth: true,
                lineStyle: {
                    color: '#059669',
                    width: 2,
                    type: 'dashed'
                },
                symbol: 'circle',
                symbolSize: 6,
                z: 3
            })

            // Calculate year total for subtitle
            const yearTotal = data.metadata?.yearTotal || 0
            const yearTotalFormatted = formatCurrency(yearTotal, false)

            return {
                ...baseOptions,
                title: {
                    text: `Projected Year Total: ${yearTotalFormatted}`,
                    textStyle: {
                        color: '#ffffff',
                        fontSize: 16,
                        fontWeight: 'bold'
                    },
                    left: 'center',
                    top: 5
                },
                tooltip: {
                    ...baseOptions.tooltip,
                    trigger: 'axis',
                    formatter: (params: any) => {
                        const monthIndex = params[0].dataIndex
                        const month = params[0].name
                        const currentMonthIndex = data.metadata?.currentMonth - 1
                        let result = `<b>${month} ${new Date().getFullYear()}</b><br/>`

                        // Get actual and forecast values for this month
                        const actualVal = data.series[0].data[monthIndex]
                        const forecastVal = data.series[1].data[monthIndex]

                        if (monthIndex < currentMonthIndex) {
                            // Past month - only actual
                            if (actualVal !== null) {
                                result += `<span style="color: #3b82f6">● Actual: ${formatCurrency(actualVal)}</span><br/>`
                            }
                        } else if (monthIndex === currentMonthIndex) {
                            // Current month - show actual + projected month-end + remainder
                            if (actualVal !== null) {
                                result += `<span style="color: #3b82f6">● Actual (MTD): ${formatCurrency(actualVal)}</span><br/>`
                            }
                            if (forecastVal !== null) {
                                result += `<span style="color: #10b981">● Projected Month-End: ${formatCurrency(forecastVal)}</span><br/>`
                                if (actualVal !== null) {
                                    const remainder = forecastVal - actualVal
                                    result += `<span style="color: #6ee7b7">  └─ Remaining: ${formatCurrency(remainder)}</span><br/>`
                                }
                            }
                        } else {
                            // Future month - only forecast
                            if (forecastVal !== null) {
                                result += `<span style="color: #10b981">● Forecast: ${formatCurrency(forecastVal)}</span><br/>`
                            }

                            // Show confidence band if available
                            if (hasConfidenceBands) {
                                const lower = data.confidenceBands.lower[monthIndex]
                                const upper = data.confidenceBands.upper[monthIndex]
                                if (lower !== null && upper !== null) {
                                    result += `<span style="color: #6ee7b7">▬ 80% Range: ${formatCurrency(lower)} - ${formatCurrency(upper)}</span><br/>`
                                }
                            }
                        }

                        return result
                    }
                },
                legend: {
                    data: [
                        { name: 'Actual', icon: 'rect', itemStyle: { color: '#3b82f6' } },
                        { name: 'Forecast', icon: 'rect', itemStyle: { color: '#10b981' } },
                        { name: 'Actual Trend', icon: 'line', itemStyle: { color: '#1e40af' } },
                        { name: 'Forecast Trend', icon: 'line', itemStyle: { color: '#059669' } },
                        ...(hasConfidenceBands ? [{ name: '80% Confidence Band', icon: 'rect', itemStyle: { color: 'rgba(16, 185, 129, 0.15)' } }] : [])
                    ],
                    textStyle: { color: '#9ca3af' },
                    top: 35,
                    itemGap: 15
                },
                grid: {
                    left: '3%',
                    right: '4%',
                    bottom: '10%',
                    top: '20%',
                    containLabel: true
                },
                xAxis: {
                    type: 'category',
                    data: data.months,
                    axisLine: { lineStyle: { color: '#374151' } },
                    axisLabel: {
                        color: '#6b7280',
                        fontSize: 11
                    },
                    splitLine: {
                        show: true,
                        interval: (index: number) => {
                            // Show vertical line at current month
                            return data.metadata && index === data.metadata.currentMonth - 1
                        },
                        lineStyle: {
                            color: '#fbbf24',
                            type: 'dashed',
                            width: 2
                        }
                    }
                },
                yAxis: {
                    type: 'value',
                    name: 'Monthly Cost',
                    nameTextStyle: {
                        color: '#9ca3af',
                        fontSize: 12
                    },
                    axisLine: { lineStyle: { color: '#374151' } },
                    axisLabel: {
                        color: '#6b7280',
                        formatter: (value: number) => formatCurrency(value)
                    },
                    splitLine: { lineStyle: { color: '#1f2937' } }
                },
                series
            }
        }

        return null
    } catch (error) {
        console.error('Error generating chart options for', chart.id, error)
        return null
    }
}

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