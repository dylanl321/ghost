<template>
  <section class="overflow-hidden rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
    <header class="flex flex-col gap-3 border-b border-gray-200 p-4 dark:border-gray-800 xl:flex-row xl:items-center xl:justify-between">
      <div>
        <h2 class="font-semibold text-gray-950 dark:text-white">Usage, errors, and cost drivers</h2>
        <p class="text-sm text-gray-500 dark:text-gray-400">{{ filteredRows.length }} {{ activeView.label.toLowerCase() }} row{{ filteredRows.length === 1 ? '' : 's' }}</p>
      </div>
      <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
        <UTabs v-model="activeIndex" :items="tabs" />
        <UInput v-model="search" icon="i-heroicons-magnifying-glass" placeholder="Search current tab" size="sm" class="sm:w-64" />
      </div>
    </header>

    <div v-if="!filteredRows.length" class="py-16 text-center text-sm text-gray-500 dark:text-gray-400">No rows match this scope.</div>
    <div v-else class="max-h-[680px] overflow-auto">
      <table class="w-full min-w-[1050px] text-left text-sm">
        <thead class="sticky top-0 z-10 border-b border-gray-200 bg-gray-50 text-xs text-gray-500 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-400">
          <tr>
            <th class="w-10 px-3 py-3"><span class="sr-only">Details</span></th>
            <th class="min-w-[310px] px-3 py-3 font-medium">{{ activeView.label.slice(0, -1) }}</th>
            <th class="w-28 px-3 py-3 font-medium">Telemetry</th>
            <th class="px-3 py-3 text-right font-medium">Invocations</th>
            <th class="px-3 py-3 text-right font-medium">Tokens</th>
            <th class="px-3 py-3 text-right font-medium">Errors</th>
            <th class="px-3 py-3 text-right font-medium">Error rate</th>
            <th class="px-3 py-3 text-right font-medium">Actual</th>
            <th class="px-4 py-3 text-right font-medium">Estimate</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
          <template v-for="row in filteredRows" :key="`${activeView.key}-${row.key}`">
            <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/50">
              <td class="px-3 py-3 align-top">
                <UTooltip :text="expanded === row.key ? 'Hide details' : 'Show details'">
                  <UButton
                    color="gray"
                    variant="ghost"
                    :icon="expanded === row.key ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-right'"
                    size="xs"
                    @click="expanded = expanded === row.key ? null : row.key"
                  />
                </UTooltip>
              </td>
              <td class="px-3 py-3 align-top">
                <p class="max-w-[420px] break-words font-medium text-gray-950 dark:text-white">{{ rowLabel(row) }}</p>
                <p v-if="activeView.key === 'enclaves' && row.accountIds.length" class="mt-1 break-all font-mono text-xs text-gray-500">{{ row.accountIds.join(' · ') }}</p>
                <p v-else-if="activeView.key === 'services' && sourceLabels(row).length" class="mt-1 text-xs text-gray-500 dark:text-gray-400">Telemetry: {{ sourceLabels(row).join(', ') }}</p>
                <p v-else-if="row.services.length" class="mt-1 max-w-[420px] break-words text-xs text-gray-500 dark:text-gray-400">{{ row.services.join(', ') }}</p>
              </td>
              <td class="px-3 py-3 align-top">
                <UBadge :color="statusColor(row.telemetryStatus)" variant="soft" size="xs">{{ statusLabel(row.telemetryStatus) }}</UBadge>
                <p v-if="row.telemetryTargets && row.telemetryStatus !== 'cost-only'" class="mt-1 text-xs tabular-nums text-gray-500">{{ row.telemetryTargetsCollected }}/{{ row.telemetryTargets }} targets</p>
              </td>
              <td class="px-3 py-3 text-right tabular-nums">{{ telemetryValue(row, row.metrics.invocations) }}</td>
              <td class="px-3 py-3 text-right tabular-nums">{{ telemetryValue(row, row.metrics.inputTokens + row.metrics.outputTokens) }}</td>
              <td class="px-3 py-3 text-right tabular-nums" :class="errorCount(row) ? 'text-red-600 dark:text-red-400' : 'text-gray-500'">{{ telemetryValue(row, errorCount(row)) }}</td>
              <td class="px-3 py-3 text-right tabular-nums" :class="errorCount(row) ? 'text-red-600 dark:text-red-400' : 'text-gray-500'">{{ telemetryAvailable(row) ? `${errorRate(row).toFixed(2)}%` : '—' }}</td>
              <td class="px-3 py-3 text-right tabular-nums">{{ row.actualCostAvailable ? money(row.cost.actual) : '—' }}</td>
              <td class="px-4 py-3 text-right tabular-nums text-amber-700 dark:text-amber-400">{{ row.estimatedCostAvailable ? money(row.cost.estimated) : '—' }}</td>
            </tr>
            <tr v-if="expanded === row.key">
              <td colspan="9" class="p-0">
                <UsageRowDetails :row="row" :view="activeView.key" :query="query" />
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </section>
</template>

<script setup lang="ts">
import type {
  AIUsageBreakdownRow,
  AIUsageOverviewResponse,
  AIUsageProvider,
  AIUsageTelemetryStatus
} from '#shared/types/ai-usage'
import { aiUsageErrorCount, aiUsageErrorRate } from '#shared/types/ai-usage'

const props = defineProps<{
  analysis: AIUsageOverviewResponse['analysis']
  query: Record<string, string>
}>()

const emit = defineEmits<{ viewChange: [groupBy: 'enclave' | 'model' | 'provider' | 'service'] }>()
const activeIndex = ref(0)
const search = ref('')
const expanded = ref<string | null>(null)
const tabs = [
  { label: 'Enclaves', icon: 'i-heroicons-building-office-2' },
  { label: 'Models', icon: 'i-heroicons-cpu-chip' },
  { label: 'Sources', icon: 'i-heroicons-circle-stack' },
  { label: 'Services', icon: 'i-heroicons-squares-2x2' }
]
const views = [
  { key: 'enclaves' as const, label: 'Enclaves', groupBy: 'enclave' as const, rows: () => props.analysis.byEnclave },
  { key: 'models' as const, label: 'Models', groupBy: 'model' as const, rows: () => props.analysis.byModel },
  { key: 'sources' as const, label: 'Sources', groupBy: 'provider' as const, rows: () => props.analysis.byProvider },
  { key: 'services' as const, label: 'Services', groupBy: 'service' as const, rows: () => props.analysis.byService }
]
const activeView = computed(() => views[activeIndex.value] || views[0]!)
const filteredRows = computed(() => {
  const query = search.value.trim().toLowerCase()
  const rows = activeView.value.rows()
  if (!query) return rows
  return rows.filter(row => `${row.label} ${row.accountIds.join(' ')} ${row.services.join(' ')} ${row.sources.join(' ')}`.toLowerCase().includes(query))
})

watch(activeIndex, () => {
  expanded.value = null
  search.value = ''
  emit('viewChange', activeView.value.groupBy)
}, { immediate: true })

function telemetryAvailable(row: AIUsageBreakdownRow): boolean {
  return row.telemetryStatus === 'complete' || row.telemetryStatus === 'partial'
}

function telemetryValue(row: AIUsageBreakdownRow, value: number): string {
  return telemetryAvailable(row) ? compact(value) : '—'
}

function rowLabel(row: AIUsageBreakdownRow): string {
  if (activeView.value.key === 'sources') return providerLabel(row.provider || row.label as AIUsageProvider)
  return row.label
}

function providerLabel(provider: AIUsageProvider): string {
  if (provider === 'bedrock-runtime') return 'Bedrock Runtime'
  if (provider === 'bedrock-mantle') return 'Bedrock Mantle'
  return provider
}

function sourceLabels(row: AIUsageBreakdownRow): string[] {
  return row.sources
    .filter(source => source === 'bedrock-runtime' || source === 'bedrock-mantle')
    .map(source => source === 'bedrock-runtime' ? 'Runtime' : 'Mantle')
}

function statusLabel(status: AIUsageTelemetryStatus): string {
  if (status === 'cost-only') return 'Cost only'
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function statusColor(status: AIUsageTelemetryStatus): 'green' | 'amber' | 'red' | 'gray' {
  if (status === 'complete') return 'green'
  if (status === 'partial') return 'amber'
  if (status === 'unavailable') return 'red'
  return 'gray'
}

function errorCount(row: AIUsageBreakdownRow): number {
  return aiUsageErrorCount(row.metrics)
}

function errorRate(row: AIUsageBreakdownRow): number {
  return aiUsageErrorRate(row.metrics)
}

function compact(value: number): string {
  return new Intl.NumberFormat('en-US', { notation: value >= 1000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value)
}

function money(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: value < 10 ? 2 : 0 }).format(value)
}
</script>
