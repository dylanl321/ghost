<template>
  <div class="mx-auto max-w-[1600px] space-y-5 px-4 py-5 sm:px-6">
    <header class="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
      <div class="min-w-0">
        <div class="mb-1 flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
          <UIcon name="i-heroicons-sparkles" class="h-4 w-4" />
          Organization adoption
        </div>
        <h1 class="text-2xl font-semibold text-gray-950 dark:text-white">AI Usage</h1>
        <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
          {{ scopeLabel }} · {{ periodLabel }}
        </p>
      </div>
      <div class="flex items-center gap-2">
        <UTooltip text="Export current view">
          <UButton color="gray" variant="soft" icon="i-heroicons-arrow-down-tray" @click="exportCsv" />
        </UTooltip>
        <UTooltip text="Refresh snapshot">
          <UButton color="gray" variant="soft" icon="i-heroicons-arrow-path" :loading="loading" @click="loadData" />
        </UTooltip>
      </div>
    </header>

    <section class="border-y border-gray-200 py-3 dark:border-gray-800">
      <div class="flex flex-wrap items-end gap-3">
        <div>
          <label class="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Environment</label>
          <div class="flex h-8 overflow-hidden rounded-md border border-gray-300 dark:border-gray-700">
            <button
              v-for="option in environmentOptions"
              :key="option.value"
              class="px-3 text-xs font-medium transition-colors"
              :class="environment === option.value ? 'bg-emerald-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800'"
              @click="environment = option.value"
            >
              {{ option.label }}
            </button>
          </div>
        </div>
        <div class="w-40">
          <label class="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Period</label>
          <USelect v-model="period" :options="periodOptions" size="sm" />
        </div>
        <div class="w-40">
          <label class="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Cost basis</label>
          <USelect v-model="costBasis" :options="costBasisOptions" size="sm" />
        </div>
        <div class="min-w-[260px] flex-1 xl:max-w-md">
          <label class="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Accounts</label>
          <USelectMenu
            v-model="selectedAccounts"
            :options="accountOptions"
            value-attribute="value"
            option-attribute="label"
            searchable
            multiple
            size="sm"
            placeholder="All enclaves"
          />
        </div>
        <div class="w-40">
          <label class="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Group by</label>
          <USelect v-model="groupBy" :options="groupByOptions" size="sm" />
        </div>
        <UPopover>
          <UButton color="gray" variant="soft" icon="i-heroicons-adjustments-horizontal" size="sm">
            Filters
            <UBadge v-if="activeFilterCount" color="emerald" variant="solid" size="xs">{{ activeFilterCount }}</UBadge>
          </UButton>
          <template #panel>
            <div class="grid w-[min(92vw,720px)] gap-4 p-4 sm:grid-cols-2">
              <FilterSelect v-model="providers" label="Provider" :options="providerOptions" />
              <FilterSelect v-model="services" label="Service" :options="stringOptions(data?.options.services)" />
              <FilterSelect v-model="projects" label="Mantle project" :options="stringOptions(data?.options.projects)" />
              <FilterSelect v-model="models" label="Model" :options="stringOptions(data?.options.models)" />
              <FilterSelect v-model="regions" label="Region" :options="stringOptions(data?.options.regions)" />
              <FilterSelect v-model="linesOfBusiness" label="Line of business" :options="stringOptions(data?.options.linesOfBusiness)" />
              <FilterSelect v-model="departments" label="Department" :options="stringOptions(data?.options.departments)" />
              <div class="flex items-end justify-end">
                <UButton color="gray" variant="ghost" size="sm" @click="clearFilters">Clear filters</UButton>
              </div>
            </div>
          </template>
        </UPopover>
      </div>
    </section>

    <UAlert
      v-if="error"
      color="red"
      variant="soft"
      icon="i-heroicons-exclamation-triangle"
      title="AI usage is unavailable"
      :description="error"
    />
    <UAlert
      v-else-if="data?.dataQuality.partial"
      color="amber"
      variant="soft"
      icon="i-heroicons-exclamation-triangle"
      title="Some sources could not be collected"
      :description="data.dataQuality.warnings[0] || 'The totals below include all available snapshots.'"
    />

    <template v-if="loading && !data">
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        <USkeleton v-for="index in 6" :key="index" class="h-28" />
      </div>
      <USkeleton class="h-80" />
      <USkeleton class="h-96" />
    </template>

    <template v-else-if="data">
      <section class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6" aria-label="AI adoption summary">
        <UCard v-for="metric in summaryMetrics" :key="metric.label" :ui="{ body: { padding: 'p-4 sm:p-4' } }">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">{{ metric.label }}</p>
              <p class="mt-2 text-xl font-semibold tabular-nums text-gray-950 dark:text-white">{{ metric.value }}</p>
              <p class="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">{{ metric.note }}</p>
            </div>
            <UIcon :name="metric.icon" class="h-5 w-5 flex-none" :class="metric.color" />
          </div>
        </UCard>
      </section>

      <section class="overflow-hidden rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <header class="flex flex-col gap-2 border-b border-gray-200 p-4 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 class="font-semibold text-gray-950 dark:text-white">Adoption trend</h2>
            <p class="text-sm text-gray-500 dark:text-gray-400">Daily active enclaves and inference volume</p>
          </div>
          <div class="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <span v-if="data.dataQuality.actualCostThrough">Actuals through {{ data.dataQuality.actualCostThrough }}</span>
            <span v-if="data.dataQuality.collectedAt">· Snapshot {{ relativeTime(data.dataQuality.collectedAt) }}</span>
          </div>
        </header>
        <VChart v-if="data.trend.length" :option="trendOption" class="h-72" autoresize />
        <div v-else class="py-20 text-center text-sm text-gray-500 dark:text-gray-400">No AI activity was found for this scope.</div>
      </section>

      <section class="overflow-hidden rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <header class="flex flex-col gap-3 border-b border-gray-200 p-4 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 class="font-semibold text-gray-950 dark:text-white">{{ groupLabel }} breakdown</h2>
            <p class="text-sm text-gray-500 dark:text-gray-400">{{ filteredRows.length }} row{{ filteredRows.length === 1 ? '' : 's' }}</p>
          </div>
          <UInput v-model="search" icon="i-heroicons-magnifying-glass" placeholder="Search breakdown" class="sm:w-72" size="sm" />
        </header>
        <div v-if="!filteredRows.length" class="py-20 text-center text-sm text-gray-500 dark:text-gray-400">No rows match this view.</div>
        <div v-else class="overflow-x-auto">
          <table class="w-full min-w-[1100px] text-left text-sm">
            <thead class="border-b border-gray-200 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
              <tr>
                <th class="px-4 py-3 font-medium">{{ groupLabel }}</th>
                <th class="px-3 py-3 text-right font-medium">Invocations</th>
                <th class="px-3 py-3 text-right font-medium">Input tokens</th>
                <th class="px-3 py-3 text-right font-medium">Output tokens</th>
                <th class="px-3 py-3 text-right font-medium">Errors</th>
                <th class="px-3 py-3 text-right font-medium">Actual</th>
                <th class="px-3 py-3 text-right font-medium">Unbilled est.</th>
                <th class="px-4 py-3 text-right font-medium">Last seen</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
              <tr v-for="row in filteredRows" :key="row.key" class="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <td class="px-4 py-3">
                  <p class="max-w-[360px] truncate font-medium text-gray-950 dark:text-white">{{ row.label }}</p>
                  <div class="mt-1 flex items-center gap-1.5">
                    <UBadge v-if="row.environment" :color="row.environment === 'govcloud' ? 'amber' : 'blue'" variant="soft" size="xs">{{ row.environment }}</UBadge>
                    <span v-if="row.accountId" class="font-mono text-xs text-gray-500">{{ row.accountId }}</span>
                  </div>
                </td>
                <td class="px-3 py-3 text-right tabular-nums">{{ compact(row.metrics.invocations) }}</td>
                <td class="px-3 py-3 text-right tabular-nums">{{ compact(row.metrics.inputTokens) }}</td>
                <td class="px-3 py-3 text-right tabular-nums">{{ compact(row.metrics.outputTokens) }}</td>
                <td class="px-3 py-3 text-right tabular-nums" :class="errorCount(row) ? 'text-red-600 dark:text-red-400' : 'text-gray-500'">{{ compact(errorCount(row)) }}</td>
                <td class="px-3 py-3 text-right tabular-nums">{{ money(row.cost.actual) }}</td>
                <td class="px-3 py-3 text-right tabular-nums text-amber-700 dark:text-amber-400">{{ row.cost.estimated ? money(row.cost.estimated) : '—' }}</td>
                <td class="px-4 py-3 text-right text-xs text-gray-500 dark:text-gray-400">{{ row.lastSeen ? formatDate(row.lastSeen) : '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { $fetch } from 'ofetch'
import * as echarts from 'echarts/core'
import { LineChart, BarChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import VChart from 'vue-echarts'
import { definePageMeta, useRoute, useRouter } from '#imports'
import FilterSelect from '~/components/ai-usage/FilterSelect.vue'
import type {
  AIUsageBreakdownRow,
  AIUsageCostBasis,
  AIUsageEnvironmentFilter,
  AIUsageGroupBy,
  AIUsageOverviewResponse,
  AIUsageProvider
} from '#shared/types/ai-usage'

echarts.use([LineChart, BarChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer])

definePageMeta({ middleware: 'auth', title: 'AI Usage' })

const route = useRoute()
const router = useRouter()

const environment = ref<AIUsageEnvironmentFilter>((route.query.environment as AIUsageEnvironmentFilter) || 'all')
const period = ref((route.query.period as string) || 'last30days')
const costBasis = ref<AIUsageCostBasis>((route.query.costBasis as AIUsageCostBasis) || 'proforma')
const groupBy = ref<AIUsageGroupBy>((route.query.groupBy as AIUsageGroupBy) || 'enclave')
const selectedAccounts = ref(queryList('accountIds'))
const providers = ref<AIUsageProvider[]>(queryList('providers') as AIUsageProvider[])
const services = ref(queryList('services'))
const projects = ref(queryList('projects'))
const models = ref(queryList('models'))
const regions = ref(queryList('regions'))
const linesOfBusiness = ref(queryList('linesOfBusiness'))
const departments = ref(queryList('departments'))
const search = ref('')
const loading = ref(true)
const error = ref<string | null>(null)
const data = ref<AIUsageOverviewResponse | null>(null)
let timer: ReturnType<typeof setTimeout> | null = null
const accountsResponse = ref<any>(null)

const accounts = computed<any[]>(() => {
  const raw = accountsResponse.value?.data || accountsResponse.value
  return Array.isArray(raw) ? raw : raw?.items || []
})
const accountOptions = computed(() => accounts.value.map(account => {
  const value = account.accountId || account.awsStandardAccountID || account.id
  const name = account.accountName || account.projectName || account.name || account.pepCloudRecordName || value
  const gov = account.govCloudAccountId || account.awsGovCloudAccountID
  return { label: `${name} · ${value}${gov ? ' + GovCloud' : ''}`, value }
}).filter(option => option.value))

const environmentOptions = [
  { label: 'All', value: 'all' as const },
  { label: 'Commercial', value: 'commercial' as const },
  { label: 'GovCloud', value: 'govcloud' as const }
]
const periodOptions = [
  { label: 'Last 7 days', value: 'last7days' },
  { label: 'Last 30 days', value: 'last30days' },
  { label: 'Last 90 days', value: 'last90days' },
  { label: 'This month', value: 'thisMonth' },
  { label: 'This quarter', value: 'thisQuarter' },
  { label: 'Year-to-date', value: 'ytd' },
  { label: 'Last 12 months', value: 'last12months' }
]
const costBasisOptions = [
  { label: 'Proforma + Gov billable', value: 'proforma' },
  { label: 'Billable', value: 'billable' }
]
const groupByOptions = [
  { label: 'Enclave', value: 'enclave' },
  { label: 'AWS account', value: 'account' },
  { label: 'Environment', value: 'environment' },
  { label: 'Provider', value: 'provider' },
  { label: 'Service', value: 'service' },
  { label: 'Mantle project', value: 'project' },
  { label: 'Model', value: 'model' },
  { label: 'Region', value: 'region' },
  { label: 'Day', value: 'day' }
]
const providerOptions = [
  { label: 'Bedrock Runtime', value: 'bedrock-runtime' },
  { label: 'Bedrock Mantle', value: 'bedrock-mantle' },
  { label: 'Bedrock cost', value: 'bedrock-cost' },
  { label: 'Other AWS AI', value: 'aws-ai-service' }
]

const activeFilterCount = computed(() => [providers, services, projects, models, regions, linesOfBusiness, departments]
  .reduce((sum, filter) => sum + filter.value.length, 0))
const scopeLabel = computed(() => selectedAccounts.value.length
  ? `${selectedAccounts.value.length} enclave${selectedAccounts.value.length === 1 ? '' : 's'}`
  : environment.value === 'all' ? 'All environments' : environment.value === 'commercial' ? 'Commercial' : 'GovCloud')
const periodLabel = computed(() => data.value?.filters.periodLabel || periodOptions.find(option => option.value === period.value)?.label || 'Custom')
const groupLabel = computed(() => groupByOptions.find(option => option.value === groupBy.value)?.label || 'Enclave')

const summaryMetrics = computed(() => {
  const summary = data.value!.summary
  const tokenTotal = summary.metrics.inputTokens + summary.metrics.outputTokens
  return [
    { label: 'Active enclaves', value: number(summary.activeEnclaves), note: growth(summary.growthPercent), icon: 'i-heroicons-building-office-2', color: 'text-emerald-600' },
    { label: 'Mantle projects', value: number(summary.activeProjects), note: `${number(summary.activeModels)} active models`, icon: 'i-heroicons-folder-open', color: 'text-blue-600' },
    { label: 'Invocations', value: compact(summary.metrics.invocations), note: `${compact(summary.metrics.clientErrors + summary.metrics.serverErrors + summary.metrics.throttles)} errors or throttles`, icon: 'i-heroicons-bolt', color: 'text-violet-600' },
    { label: 'Tokens', value: compact(tokenTotal), note: `${compact(summary.metrics.inputTokens)} in · ${compact(summary.metrics.outputTokens)} out`, icon: 'i-heroicons-circle-stack', color: 'text-cyan-600' },
    { label: 'Actual spend', value: money(summary.cost.actual), note: costBasis.value === 'proforma' ? 'Commercial proforma + Gov billable' : 'Billable actual', icon: 'i-heroicons-banknotes', color: 'text-green-600' },
    { label: 'Unbilled estimate', value: summary.cost.estimated ? money(summary.cost.estimated) : '—', note: coverage(summary.cost.estimateCoveragePercent), icon: 'i-heroicons-calculator', color: 'text-amber-600' }
  ]
})

const trendOption = computed(() => ({
  tooltip: { trigger: 'axis' },
  legend: { data: ['Active enclaves', 'Invocations'], textStyle: { color: '#9ca3af' } },
  grid: { left: 52, right: 52, top: 42, bottom: 36 },
  xAxis: { type: 'category', data: data.value?.trend.map(point => point.date) || [], axisLabel: { color: '#9ca3af' }, axisLine: { lineStyle: { color: '#374151' } } },
  yAxis: [
    { type: 'value', minInterval: 1, axisLabel: { color: '#9ca3af' }, splitLine: { lineStyle: { color: '#1f2937' } } },
    { type: 'value', axisLabel: { color: '#9ca3af', formatter: (value: number) => compact(value) }, splitLine: { show: false } }
  ],
  series: [
    { name: 'Active enclaves', type: 'line', smooth: true, symbolSize: 5, data: data.value?.trend.map(point => point.activeEnclaves) || [], lineStyle: { color: '#10b981', width: 2 }, itemStyle: { color: '#10b981' }, areaStyle: { color: 'rgba(16,185,129,0.10)' } },
    { name: 'Invocations', type: 'bar', yAxisIndex: 1, barMaxWidth: 18, data: data.value?.trend.map(point => point.invocations) || [], itemStyle: { color: '#6366f1' } }
  ]
}))

const filteredRows = computed(() => {
  const query = search.value.trim().toLowerCase()
  if (!query) return data.value?.breakdown || []
  return (data.value?.breakdown || []).filter(row => `${row.label} ${row.accountId || ''}`.toLowerCase().includes(query))
})

function queryList(key: string): string[] {
  const value = route.query[key]
  if (!value) return []
  return (Array.isArray(value) ? value : String(value).split(',')).map(String).map(item => item.trim()).filter(Boolean)
}

function apiParams(): Record<string, string> {
  const params: Record<string, string> = { environment: environment.value, period: period.value, costBasis: costBasis.value, groupBy: groupBy.value }
  const lists: Record<string, string[]> = {
    accountIds: selectedAccounts.value, providers: providers.value, services: services.value, projects: projects.value,
    models: models.value, regions: regions.value, linesOfBusiness: linesOfBusiness.value, departments: departments.value
  }
  for (const [key, values] of Object.entries(lists)) if (values.length) params[key] = values.join(',')
  return params
}

async function loadData() {
  loading.value = true
  error.value = null
  try {
    const response = await $fetch<{ success: boolean; data: AIUsageOverviewResponse }>('/api/ai-usage/overview', { query: apiParams() })
    data.value = response.data
  } catch (err: any) {
    error.value = err.data?.error?.message || err.message || 'Failed to load AI usage'
  } finally {
    loading.value = false
  }
}

async function loadAccounts() {
  try {
    accountsResponse.value = await $fetch('/api/accounts/list', {
      query: { source: 'full', enrichment: 'basic', includeLZAccounts: true }
    })
  } catch {
    accountsResponse.value = []
  }
}

function clearFilters() {
  providers.value = []
  services.value = []
  projects.value = []
  models.value = []
  regions.value = []
  linesOfBusiness.value = []
  departments.value = []
}

function stringOptions(values?: string[]) {
  return (values || []).map(value => ({ label: value, value }))
}

function exportCsv() {
  const query = new URLSearchParams(apiParams())
  window.location.assign(`/api/ai-usage/export?${query.toString()}`)
}

function number(value: number) { return new Intl.NumberFormat('en-US').format(value) }
function compact(value: number) { return new Intl.NumberFormat('en-US', { notation: value >= 1000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value) }
function money(value: number) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: value < 10 ? 2 : 0 }).format(value) }
function coverage(value: number | null) { return value === null ? 'No token estimate' : `${value.toFixed(0)}% of tokens priced` }
function growth(value: number | null) { return value === null ? 'New adoption in this period' : `${value >= 0 ? '+' : ''}${value.toFixed(1)}% vs prior period` }
function errorCount(row: AIUsageBreakdownRow) { return row.metrics.clientErrors + row.metrics.serverErrors + row.metrics.throttles }
function formatDate(value: string) { return new Date(value.length === 10 ? `${value}T00:00:00Z` : value).toLocaleDateString() }
function relativeTime(value: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000))
  return minutes < 60 ? `${minutes}m ago` : `${Math.round(minutes / 60)}h ago`
}

watch([environment, period, costBasis, groupBy, selectedAccounts, providers, services, projects, models, regions, linesOfBusiness, departments], () => {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    router.replace({ query: apiParams() })
    void loadData()
  }, 300)
}, { deep: true })

onMounted(() => { void Promise.all([loadAccounts(), loadData()]) })
onUnmounted(() => { if (timer) clearTimeout(timer) })
</script>
