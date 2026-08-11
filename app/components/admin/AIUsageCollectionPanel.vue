<template>
  <div class="space-y-5">
    <header class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <div class="flex items-center gap-2">
          <h2 class="text-lg font-semibold text-gray-950 dark:text-white">AI Usage Collection</h2>
          <UBadge :color="statusColor" variant="soft">{{ statusLabel }}</UBadge>
        </div>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {{ state?.completedAt ? `Last completed ${formatDateTime(state.completedAt)}` : 'No completed collection' }}
        </p>
      </div>
      <div class="flex items-end gap-2">
        <div class="w-44">
          <label class="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Collection range</label>
          <USelect v-model="selectedRange" :options="rangeOptions" size="sm" :disabled="running" />
        </div>
        <UTooltip :text="running ? 'Collection already running' : 'Start collection'">
          <UButton
            color="emerald"
            icon="i-heroicons-play"
            size="sm"
            :loading="triggering"
            :disabled="running"
            @click="runCollection"
          >
            Run
          </UButton>
        </UTooltip>
        <UTooltip text="Refresh status">
          <UButton color="gray" variant="soft" icon="i-heroicons-arrow-path" size="sm" :loading="loading" @click="loadStatus" />
        </UTooltip>
      </div>
    </header>

    <UAlert
      v-if="error"
      color="red"
      variant="soft"
      icon="i-heroicons-exclamation-triangle"
      title="Collection status is unavailable"
      :description="error"
    />

    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <UCard v-for="metric in metrics" :key="metric.label" :ui="{ body: { padding: 'p-4 sm:p-4' } }">
        <p class="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">{{ metric.label }}</p>
        <p class="mt-2 text-xl font-semibold tabular-nums text-gray-950 dark:text-white">{{ metric.value }}</p>
        <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">{{ metric.note }}</p>
      </UCard>
    </div>

    <section v-if="running" class="rounded-md border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/30">
      <div class="flex items-center gap-3">
        <UIcon name="i-heroicons-arrow-path" class="h-5 w-5 animate-spin text-blue-600 dark:text-blue-400" />
        <div>
          <p class="text-sm font-medium text-blue-900 dark:text-blue-200">Collection running</p>
          <p class="text-xs text-blue-700 dark:text-blue-400">Started {{ state?.startedAt ? formatDateTime(state.startedAt) : 'recently' }}</p>
        </div>
      </div>
    </section>

    <UTabs v-model="activeView" :items="analysisTabs" />

    <template v-if="activeView === 0">
      <div class="flex justify-end">
        <USelect v-model="usagePeriod" :options="usagePeriodOptions" size="sm" class="w-44" :loading="usageLoading" />
      </div>

      <div class="grid gap-4 xl:grid-cols-2">
        <section class="overflow-hidden rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
          <header class="border-b border-gray-200 p-4 dark:border-gray-800">
            <h3 class="font-semibold text-gray-950 dark:text-white">Usage by Source</h3>
          </header>
          <div class="overflow-x-auto">
            <table class="w-full min-w-[620px] text-left text-sm">
              <thead class="border-b border-gray-200 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
                <tr>
                  <th class="px-4 py-3 font-medium">Source</th>
                  <th class="px-3 py-3 text-right font-medium">Invocations</th>
                  <th class="px-3 py-3 text-right font-medium">Tokens</th>
                  <th class="px-3 py-3 text-right font-medium">Actual</th>
                  <th class="px-4 py-3 text-right font-medium">Estimate</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
                <tr v-for="row in providerRows" :key="row.key">
                  <td class="px-4 py-3 font-medium text-gray-950 dark:text-white">{{ providerLabel(row.label) }}</td>
                  <td class="px-3 py-3 text-right tabular-nums">{{ row.telemetryAvailable ? compact(row.metrics.invocations) : '—' }}</td>
                  <td class="px-3 py-3 text-right tabular-nums">{{ row.telemetryAvailable ? compact(row.metrics.inputTokens + row.metrics.outputTokens) : '—' }}</td>
                  <td class="px-3 py-3 text-right tabular-nums">{{ money(row.cost.actual) }}</td>
                  <td class="px-4 py-3 text-right tabular-nums text-amber-700 dark:text-amber-400">{{ row.cost.estimated ? money(row.cost.estimated) : '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="overflow-hidden rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
          <header class="border-b border-gray-200 p-4 dark:border-gray-800">
            <h3 class="font-semibold text-gray-950 dark:text-white">Usage by Model</h3>
          </header>
          <div class="max-h-[420px] overflow-auto">
            <table class="w-full min-w-[680px] text-left text-sm">
              <thead class="sticky top-0 border-b border-gray-200 bg-gray-50 text-xs text-gray-500 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-400">
                <tr>
                  <th class="px-4 py-3 font-medium">Model</th>
                  <th class="px-3 py-3 text-right font-medium">Invocations</th>
                  <th class="px-3 py-3 text-right font-medium">Input</th>
                  <th class="px-3 py-3 text-right font-medium">Output</th>
                  <th class="px-4 py-3 text-right font-medium">Errors</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
                <tr v-for="row in modelRows" :key="row.key">
                  <td class="max-w-[280px] truncate px-4 py-3 font-mono text-xs text-gray-950 dark:text-white">{{ row.label }}</td>
                  <td class="px-3 py-3 text-right tabular-nums">{{ compact(row.metrics.invocations) }}</td>
                  <td class="px-3 py-3 text-right tabular-nums">{{ compact(row.metrics.inputTokens) }}</td>
                  <td class="px-3 py-3 text-right tabular-nums">{{ compact(row.metrics.outputTokens) }}</td>
                  <td class="px-4 py-3 text-right tabular-nums" :class="usageErrors(row) ? 'text-red-600 dark:text-red-400' : 'text-gray-500'">{{ compact(usageErrors(row)) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section class="overflow-hidden rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <header class="border-b border-gray-200 p-4 dark:border-gray-800">
          <h3 class="font-semibold text-gray-950 dark:text-white">AWS AI Services</h3>
        </header>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[760px] text-left text-sm">
            <thead class="border-b border-gray-200 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
              <tr>
                <th class="px-4 py-3 font-medium">Service</th>
                <th class="px-3 py-3 text-right font-medium">Invocations</th>
                <th class="px-3 py-3 text-right font-medium">Tokens</th>
                <th class="px-3 py-3 text-right font-medium">Actual</th>
                <th class="px-4 py-3 text-right font-medium">Unbilled estimate</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
              <tr v-for="row in serviceRows" :key="row.key">
                <td class="px-4 py-3 font-medium text-gray-950 dark:text-white">{{ row.label }}</td>
                <td class="px-3 py-3 text-right tabular-nums">{{ row.telemetryAvailable ? compact(row.metrics.invocations) : '—' }}</td>
                <td class="px-3 py-3 text-right tabular-nums">{{ row.telemetryAvailable ? compact(row.metrics.inputTokens + row.metrics.outputTokens) : '—' }}</td>
                <td class="px-3 py-3 text-right tabular-nums">{{ money(row.cost.actual) }}</td>
                <td class="px-4 py-3 text-right tabular-nums text-amber-700 dark:text-amber-400">{{ row.cost.estimated ? money(row.cost.estimated) : '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>

    <section v-else class="overflow-hidden rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <header class="flex flex-col gap-3 border-b border-gray-200 p-4 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 class="font-semibold text-gray-950 dark:text-white">Collection Errors</h3>
          <div class="mt-1 flex flex-wrap gap-1.5">
            <UBadge v-for="group in status?.errorSummary || []" :key="group.category" color="red" variant="soft" size="xs">
              {{ group.category }}: {{ group.count }}
            </UBadge>
            <span v-if="!status?.errorSummary.length" class="text-xs text-gray-500 dark:text-gray-400">No errors recorded</span>
          </div>
        </div>
        <div class="flex gap-2 sm:w-[430px]">
          <USelect v-model="category" :options="categoryOptions" size="sm" class="w-44" />
          <UInput v-model="search" icon="i-heroicons-magnifying-glass" placeholder="Search errors" size="sm" class="flex-1" />
        </div>
      </header>

      <div v-if="!filteredErrors.length" class="py-16 text-center text-sm text-gray-500 dark:text-gray-400">No collection errors match this view.</div>
      <div v-else class="max-h-[560px] overflow-auto">
        <table class="w-full min-w-[1100px] text-left text-sm">
          <thead class="sticky top-0 z-10 border-b border-gray-200 bg-gray-50 text-xs text-gray-500 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-400">
            <tr>
              <th class="w-44 px-4 py-3 font-medium">Category</th>
              <th class="w-32 px-3 py-3 font-medium">Account</th>
              <th class="w-28 px-3 py-3 font-medium">Environment</th>
              <th class="w-32 px-3 py-3 font-medium">Region</th>
              <th class="px-3 py-3 font-medium">Error</th>
              <th class="w-12 px-4 py-3"><span class="sr-only">Copy</span></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
            <tr v-for="item in filteredErrors" :key="item.id">
              <td class="px-4 py-3 align-top"><UBadge color="red" variant="soft" size="xs">{{ item.category }}</UBadge></td>
              <td class="px-3 py-3 align-top font-mono text-xs">{{ item.accountId || '—' }}</td>
              <td class="px-3 py-3 align-top"><UBadge :color="item.environment === 'govcloud' ? 'amber' : 'blue'" variant="soft" size="xs">{{ item.environment }}</UBadge></td>
              <td class="px-3 py-3 align-top font-mono text-xs">{{ item.region || '—' }}</td>
              <td class="px-3 py-3 font-mono text-xs leading-5 text-gray-700 dark:text-gray-300">{{ item.message }}</td>
              <td class="px-4 py-3 align-top">
                <UTooltip text="Copy error">
                  <UButton color="gray" variant="ghost" icon="i-heroicons-clipboard" size="xs" @click="copyError(item.message)" />
                </UTooltip>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import type { AIUsageBreakdownRow, AIUsageOverviewResponse } from '#shared/types/ai-usage'

interface CollectorState {
  status: 'running' | 'complete' | 'partial' | 'error'
  startedAt: string
  completedAt?: string
  accountsAttempted: number
  accountsSucceeded: number
  factsWritten: number
}

interface CollectionStatus {
  state: CollectorState | null
  running: boolean
  coveragePercent: number
  errors: Array<{ id: string; category: string; accountId?: string; environment: 'commercial' | 'govcloud'; region?: string; message: string }>
  errorSummary: Array<{ category: string; count: number }>
  affectedAccounts: number
}

const toast = useToast()
const status = ref<CollectionStatus | null>(null)
const loading = ref(true)
const triggering = ref(false)
const error = ref<string | null>(null)
const selectedRange = ref(3)
const search = ref('')
const category = ref('all')
const activeView = ref(0)
const usagePeriod = ref('last30days')
const usageLoading = ref(false)
const providerRows = ref<AIUsageBreakdownRow[]>([])
const modelRows = ref<AIUsageBreakdownRow[]>([])
const serviceRows = ref<AIUsageBreakdownRow[]>([])
let pollTimer: ReturnType<typeof setInterval> | null = null

const analysisTabs = [
  { label: 'Usage Analysis', icon: 'i-heroicons-chart-bar' },
  { label: 'Collection Errors', icon: 'i-heroicons-exclamation-triangle' }
]
const usagePeriodOptions = [
  { label: 'Last 7 days', value: 'last7days' },
  { label: 'Last 30 days', value: 'last30days' },
  { label: 'Last 90 days', value: 'last90days' }
]

const state = computed(() => status.value?.state || null)
const running = computed(() => status.value?.running === true)
const statusLabel = computed(() => state.value?.status || 'not started')
const statusColor = computed((): 'blue' | 'green' | 'amber' | 'red' | 'gray' => {
  if (state.value?.status === 'running') return 'blue'
  if (state.value?.status === 'complete') return 'green'
  if (state.value?.status === 'partial') return 'amber'
  if (state.value?.status === 'error') return 'red'
  return 'gray'
})
const rangeOptions = [
  { label: 'Incremental (3 days)', value: 3 },
  { label: 'Full backfill (400 days)', value: 400 }
]
const categoryOptions = computed(() => [
  { label: 'All categories', value: 'all' },
  ...(status.value?.errorSummary || []).map(group => ({ label: `${group.category} (${group.count})`, value: group.category }))
])
const filteredErrors = computed(() => {
  const query = search.value.trim().toLowerCase()
  return (status.value?.errors || []).filter(item =>
    (category.value === 'all' || item.category === category.value) &&
    (!query || `${item.message} ${item.category} ${item.accountId || ''} ${item.region || ''}`.toLowerCase().includes(query)))
})
const metrics = computed(() => [
  { label: 'Coverage', value: `${(status.value?.coveragePercent || 0).toFixed(1)}%`, note: `${state.value?.accountsSucceeded || 0} of ${state.value?.accountsAttempted || 0} targets` },
  { label: 'Facts written', value: new Intl.NumberFormat().format(state.value?.factsWritten || 0), note: 'Latest collection' },
  { label: 'Errors retained', value: new Intl.NumberFormat().format(status.value?.errors.length || 0), note: `${status.value?.affectedAccounts || 0} affected accounts, capped at 50` },
  { label: 'Duration', value: durationLabel.value, note: state.value?.completedAt ? 'Latest collection' : 'Not completed' }
])
const durationLabel = computed(() => {
  if (!state.value?.startedAt || !state.value.completedAt) return '—'
  const seconds = Math.max(0, Math.round((new Date(state.value.completedAt).getTime() - new Date(state.value.startedAt).getTime()) / 1000))
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`
})

async function loadStatus() {
  loading.value = true
  error.value = null
  try {
    const response = await $fetch<{ success: boolean; data: CollectionStatus }>('/api/admin/ai-usage/status')
    const collectionFinished = status.value?.running === true && response.data.running === false
    status.value = response.data
    if (collectionFinished) void loadUsage()
  } catch (err: any) {
    error.value = err.data?.error?.message || err.message || 'Failed to load collection status'
  } finally {
    loading.value = false
  }
}

async function loadUsage() {
  usageLoading.value = true
  try {
    const query = { environment: 'all', period: usagePeriod.value, costBasis: 'proforma' }
    const response = await $fetch<{ success: boolean; data: AIUsageOverviewResponse }>('/api/ai-usage/overview', { query: { ...query, groupBy: 'enclave' } })
    providerRows.value = response.data.analysis.byProvider
    modelRows.value = response.data.analysis.byModel.filter(row => row.telemetryAvailable)
    serviceRows.value = response.data.analysis.byService
  } catch (err: any) {
    toast.add({ title: 'Usage analysis is unavailable', description: err.message, color: 'red' })
  } finally {
    usageLoading.value = false
  }
}

async function runCollection() {
  triggering.value = true
  try {
    await $fetch('/api/admin/ai-usage/collect', { method: 'POST', body: { backfillDays: selectedRange.value } })
    toast.add({ title: 'Collection started', color: 'green', icon: 'i-heroicons-play' })
    await new Promise(resolve => setTimeout(resolve, 1000))
    await loadStatus()
  } catch (err: any) {
    toast.add({
      title: 'Collection was not started',
      description: err.data?.error?.message || err.message,
      color: 'red',
      icon: 'i-heroicons-exclamation-triangle'
    })
  } finally {
    triggering.value = false
  }
}

async function copyError(message: string) {
  await navigator.clipboard.writeText(message)
  toast.add({ title: 'Error copied', color: 'green' })
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString()
}

function providerLabel(value: string): string {
  const labels: Record<string, string> = {
    'bedrock-runtime': 'Bedrock Runtime',
    'bedrock-mantle': 'Bedrock Mantle',
    'bedrock-cost': 'Bedrock cost (unattributed)',
    'aws-ai-service': 'Other AWS AI services'
  }
  return labels[value] || value
}

function compact(value: number): string {
  return new Intl.NumberFormat('en-US', { notation: value >= 1000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value)
}

function money(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: value < 10 ? 2 : 0 }).format(value)
}

function usageErrors(row: AIUsageBreakdownRow): number {
  return row.metrics.clientErrors + row.metrics.serverErrors + row.metrics.throttles
}

onMounted(() => {
  void Promise.all([loadStatus(), loadUsage()])
  pollTimer = setInterval(() => void loadStatus(), 10000)
})

watch(usagePeriod, () => void loadUsage())

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
})
</script>
