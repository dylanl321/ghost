<template>
  <div class="border-t border-gray-200 bg-gray-50/80 px-5 py-5 dark:border-gray-800 dark:bg-gray-950/60">
    <div v-if="loading" class="flex items-center gap-2 py-3 text-sm text-gray-500 dark:text-gray-400">
      <UIcon name="i-heroicons-arrow-path" class="h-4 w-4 animate-spin" />
      Loading drill-down…
    </div>

    <UAlert
      v-else-if="error"
      color="red"
      variant="soft"
      icon="i-heroicons-exclamation-triangle"
      title="Drill-down is unavailable"
      :description="error"
    />

    <template v-else-if="costDrivers">
      <div class="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <div>
          <h3 class="text-sm font-semibold text-gray-950 dark:text-white">Cost Explorer drivers</h3>
          <p class="text-xs text-gray-500 dark:text-gray-400">Usage type and operation explain the billed service total.</p>
        </div>
        <p class="text-sm font-semibold tabular-nums text-gray-950 dark:text-white">{{ money(costDrivers.totalCost) }}</p>
      </div>
      <div class="mt-4 grid gap-5 lg:grid-cols-2">
        <div>
          <h4 class="mb-2 text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Usage types</h4>
          <div class="divide-y divide-gray-200 border-y border-gray-200 dark:divide-gray-800 dark:border-gray-800">
            <div v-for="item in costDrivers.usageTypes.slice(0, 10)" :key="item.key" class="flex items-start justify-between gap-4 py-2 text-xs">
              <span class="min-w-0 break-words text-gray-700 dark:text-gray-300">{{ item.label }}</span>
              <span class="flex-none tabular-nums text-gray-950 dark:text-white">{{ money(item.cost) }}</span>
            </div>
            <p v-if="!costDrivers.usageTypes.length" class="py-3 text-xs text-gray-500">No usage-type drivers were returned.</p>
          </div>
        </div>
        <div>
          <h4 class="mb-2 text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Operations</h4>
          <div class="divide-y divide-gray-200 border-y border-gray-200 dark:divide-gray-800 dark:border-gray-800">
            <div v-for="item in costDrivers.operations.slice(0, 10)" :key="item.key" class="flex items-start justify-between gap-4 py-2 text-xs">
              <span class="min-w-0 break-words text-gray-700 dark:text-gray-300">{{ item.label }}</span>
              <span class="flex-none tabular-nums text-gray-950 dark:text-white">{{ money(item.cost) }}</span>
            </div>
            <p v-if="!costDrivers.operations.length" class="py-3 text-xs text-gray-500">No operation drivers were returned.</p>
          </div>
        </div>
      </div>
      <div class="mt-5">
        <h4 class="mb-2 text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Resources</h4>
        <p v-if="!costDrivers.resourceDataAvailable" class="text-xs text-gray-500 dark:text-gray-400">{{ costDrivers.resourceDataMessage }}</p>
        <div v-else class="divide-y divide-gray-200 border-y border-gray-200 dark:divide-gray-800 dark:border-gray-800">
          <div v-for="resource in costDrivers.resources.slice(0, 10)" :key="resource.resourceId" class="flex items-start justify-between gap-4 py-2 text-xs">
            <code class="min-w-0 break-all text-gray-700 dark:text-gray-300">{{ resource.resourceId }}</code>
            <span class="flex-none tabular-nums text-gray-950 dark:text-white">{{ money(resource.cost) }}</span>
          </div>
          <p v-if="!costDrivers.resources.length" class="py-3 text-xs text-gray-500">Resource data is enabled, but AWS returned no resource identifiers for this service.</p>
        </div>
      </div>
    </template>

    <template v-else-if="causes">
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div>
          <p class="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Metric errors</p>
          <p class="mt-1 text-lg font-semibold tabular-nums text-gray-950 dark:text-white">{{ number(causes.metricErrorTotal) }}</p>
        </div>
        <div>
          <p class="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Matched cause events</p>
          <p class="mt-1 text-lg font-semibold tabular-nums text-gray-950 dark:text-white">{{ number(causes.matchedCauseEvents) }}</p>
        </div>
        <div v-for="source in causes.sources" :key="source.source">
          <p class="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">{{ source.label }}</p>
          <p class="mt-1 text-sm font-medium capitalize text-gray-950 dark:text-white">{{ source.availability }} · {{ number(source.eventCount) }} events</p>
          <p v-if="source.message" class="mt-1 text-xs text-amber-700 dark:text-amber-400">{{ source.message }}</p>
        </div>
      </div>

      <div v-if="causes.affectedAccounts.length || causes.affectedModels.length" class="mt-4 grid gap-3 text-xs lg:grid-cols-2">
        <p class="break-words text-gray-600 dark:text-gray-400">
          <span class="font-medium text-gray-900 dark:text-gray-200">Affected accounts:</span>
          {{ causes.affectedAccounts.slice(0, 8).map(item => `${item.enclaveName} (${item.count})`).join(', ') || 'None' }}
        </p>
        <p class="break-words text-gray-600 dark:text-gray-400">
          <span class="font-medium text-gray-900 dark:text-gray-200">Affected models:</span>
          {{ causes.affectedModels.slice(0, 8).map(item => `${item.modelId} (${item.count})`).join(', ') || 'Unattributed' }}
        </p>
      </div>

      <div v-if="view === 'services' && row.sources.length" class="mt-4 flex flex-wrap items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
        <span>Telemetry sources:</span>
        <UBadge v-for="source in telemetrySources" :key="source" color="gray" variant="soft" size="xs">{{ providerLabel(source) }}</UBadge>
      </div>

      <div class="mt-5 grid gap-5 xl:grid-cols-2">
        <div>
          <h4 class="mb-2 text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Grouped causes</h4>
          <div class="divide-y divide-gray-200 border-y border-gray-200 dark:divide-gray-800 dark:border-gray-800">
            <div v-for="group in causes.groups.slice(0, 8)" :key="group.key" class="py-2.5 text-xs">
              <div class="flex items-start justify-between gap-4">
                <div class="min-w-0">
                  <p class="font-medium text-gray-950 dark:text-white">{{ group.errorCode }} · {{ group.operation }}</p>
                  <p v-if="group.message" class="mt-1 break-words text-gray-500 dark:text-gray-400">{{ group.message }}</p>
                  <p class="mt-1 text-gray-500">{{ causeSourceLabel(group.source) }}</p>
                </div>
                <span class="flex-none tabular-nums text-gray-700 dark:text-gray-300">{{ group.count }}</span>
              </div>
              <p class="mt-1 text-gray-500">{{ group.affectedAccounts }} accounts · {{ group.affectedModels }} models</p>
            </div>
            <p v-if="!causes.groups.length" class="py-3 text-xs text-gray-500">No matching cause events were collected.</p>
          </div>
        </div>
        <div>
          <h4 class="mb-2 text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Recent examples</h4>
          <div class="divide-y divide-gray-200 border-y border-gray-200 dark:divide-gray-800 dark:border-gray-800">
            <div v-for="example in causes.recentExamples.slice(0, 6)" :key="example.eventId" class="py-2.5 text-xs">
              <p class="font-medium text-gray-950 dark:text-white">{{ example.errorCode }} · {{ example.operation }}</p>
              <p v-if="example.errorMessage" class="mt-1 break-words text-gray-500 dark:text-gray-400">{{ example.errorMessage }}</p>
              <p class="mt-1 break-words text-gray-500">{{ example.enclaveName }} · {{ example.region }} · {{ formatDateTime(example.timestamp) }}</p>
              <p class="mt-1 text-gray-500">{{ causeSourceLabel(example.source) }}</p>
              <p v-if="example.callerIdentity" class="mt-1 break-all font-mono text-gray-500">{{ example.callerIdentity }}</p>
            </div>
            <p v-if="!causes.recentExamples.length" class="py-3 text-xs text-gray-500">No recent examples match this row.</p>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import type {
  AIUsageBreakdownRow,
  AIUsageCostDriverResponse,
  AIUsageErrorCauseResponse,
  AIUsageProvider
} from '#shared/types/ai-usage'

const props = defineProps<{
  row: AIUsageBreakdownRow
  view: 'enclaves' | 'models' | 'sources' | 'services'
  query: Record<string, string>
}>()

const loading = ref(false)
const error = ref<string | null>(null)
const causes = ref<AIUsageErrorCauseResponse | null>(null)
const costDrivers = ref<AIUsageCostDriverResponse | null>(null)
const telemetrySources = computed(() => props.row.sources.filter(source => source === 'bedrock-runtime' || source === 'bedrock-mantle'))

function detailQuery(): Record<string, string> {
  const query = { ...props.query }
  delete query.groupBy
  if (props.view === 'enclaves') query.accountIds = props.row.accountIds.join(',')
  if (props.view === 'models' && props.row.modelId) query.models = props.row.modelId
  if (props.view === 'sources' && props.row.provider) query.providers = props.row.provider
  if (props.view === 'services' && props.row.service) query.services = props.row.service
  return query
}

async function loadDetails() {
  loading.value = true
  error.value = null
  try {
    if (props.view === 'services' && props.row.service !== 'Amazon Bedrock') {
      const response = await $fetch<{ success: boolean; data: AIUsageCostDriverResponse }>('/api/ai-usage/cost-drivers', {
        query: { ...detailQuery(), service: props.row.service }
      })
      costDrivers.value = response.data
    } else {
      const response = await $fetch<{ success: boolean; data: AIUsageErrorCauseResponse }>('/api/ai-usage/error-causes', {
        query: detailQuery()
      })
      causes.value = response.data
    }
  } catch (err: any) {
    error.value = err.data?.error?.message || err.message || 'Failed to load drill-down'
  } finally {
    loading.value = false
  }
}

function providerLabel(provider: AIUsageProvider): string {
  if (provider === 'bedrock-runtime') return 'Runtime'
  if (provider === 'bedrock-mantle') return 'Mantle'
  return provider
}

function causeSourceLabel(source: 'bedrock-runtime' | 'cloudwatch-genai'): string {
  return source === 'cloudwatch-genai' ? 'CloudWatch GenAI Observability' : 'Runtime CloudTrail'
}

function number(value: number): string {
  return new Intl.NumberFormat('en-US').format(value)
}

function money(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: value < 10 ? 2 : 0 }).format(value)
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString()
}

onMounted(() => void loadDetails())
</script>
