<template>
  <div class="space-y-5">
    <header class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <div class="flex items-center gap-2">
          <h2 class="text-lg font-semibold text-gray-950 dark:text-white">AI Usage Collection</h2>
          <UBadge :color="statusColor" variant="soft">{{ statusLabel }}</UBadge>
        </div>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {{ state?.completedAt ? `Last completed ${formatDateTime(state.completedAt)}` : 'No completed collection' }}
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <UButton
          color="emerald"
          variant="soft"
          icon="i-heroicons-play"
          size="sm"
          :loading="triggeringRange === 3"
          :disabled="running || triggeringRange !== null"
          @click="runCollection(3)"
        >
          Incremental run
        </UButton>
        <UButton
          color="gray"
          variant="soft"
          icon="i-heroicons-arrow-path-rounded-square"
          size="sm"
          :loading="triggeringRange === 400"
          :disabled="running || triggeringRange !== null"
          @click="runCollection(400)"
        >
          Full backfill
        </UButton>
        <UTooltip text="Refresh status">
          <UButton color="gray" variant="ghost" icon="i-heroicons-arrow-path" size="sm" :loading="loading" @click="loadStatus" />
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

    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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

    <section class="overflow-hidden rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <header class="flex flex-col gap-3 border-b border-gray-200 p-4 dark:border-gray-800 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 class="font-semibold text-gray-950 dark:text-white">Collection Failures</h3>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {{ status?.failureGroups.length || 0 }} grouped failure{{ status?.failureGroups.length === 1 ? '' : 's' }} across {{ status?.affectedAccounts || 0 }} accounts
          </p>
        </div>
        <div class="flex flex-col gap-2 sm:flex-row lg:w-[500px]">
          <USelect v-model="category" :options="categoryOptions" size="sm" class="sm:w-48" />
          <UInput v-model="search" icon="i-heroicons-magnifying-glass" placeholder="Search failures" size="sm" class="flex-1" />
        </div>
      </header>

      <div v-if="!filteredFailures.length" class="py-16 text-center text-sm text-gray-500 dark:text-gray-400">
        No collection failures match this view.
      </div>
      <div v-else class="max-h-[620px] overflow-auto">
        <table class="w-full min-w-[1050px] text-left text-sm">
          <thead class="sticky top-0 z-10 border-b border-gray-200 bg-gray-50 text-xs text-gray-500 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-400">
            <tr>
              <th class="w-10 px-3 py-3"><span class="sr-only">Details</span></th>
              <th class="w-48 px-3 py-3 font-medium">Account</th>
              <th class="w-28 px-3 py-3 font-medium">Environment</th>
              <th class="w-48 px-3 py-3 font-medium">Category</th>
              <th class="w-48 px-3 py-3 font-medium">Regions</th>
              <th class="px-3 py-3 font-medium">Action</th>
              <th class="w-20 px-4 py-3 text-right font-medium">Count</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
            <template v-for="item in filteredFailures" :key="item.id">
              <tr class="align-top hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <td class="px-3 py-3">
                  <UTooltip :text="expanded.has(item.id) ? 'Hide raw samples' : 'Show raw samples'">
                    <UButton
                      color="gray"
                      variant="ghost"
                      :icon="expanded.has(item.id) ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-right'"
                      size="xs"
                      @click="toggleExpanded(item.id)"
                    />
                  </UTooltip>
                </td>
                <td class="px-3 py-3">
                  <p class="font-medium text-gray-950 dark:text-white">{{ item.enclaveName || 'Organization' }}</p>
                  <p class="mt-1 font-mono text-xs text-gray-500">{{ item.accountId || '—' }}</p>
                </td>
                <td class="px-3 py-3"><UBadge :color="item.environment === 'govcloud' ? 'amber' : 'blue'" variant="soft" size="xs">{{ item.environment }}</UBadge></td>
                <td class="px-3 py-3"><UBadge color="red" variant="soft" size="xs">{{ item.category }}</UBadge></td>
                <td class="px-3 py-3 font-mono text-xs leading-5">{{ item.regions.join(', ') || 'All' }}</td>
                <td class="px-3 py-3">
                  <p class="text-gray-700 dark:text-gray-300">{{ item.explanation }}</p>
                  <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">{{ item.remediation }}</p>
                </td>
                <td class="px-4 py-3 text-right font-medium tabular-nums">{{ item.count }}</td>
              </tr>
              <tr v-if="expanded.has(item.id)" class="bg-gray-50/70 dark:bg-gray-950/60">
                <td colspan="7" class="px-4 py-4">
                  <div class="space-y-2">
                    <div v-for="sample in item.samples" :key="sample" class="flex items-start gap-2 rounded border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
                      <code class="min-w-0 flex-1 whitespace-pre-wrap break-words text-xs leading-5 text-gray-700 dark:text-gray-300">{{ sample }}</code>
                      <UTooltip text="Copy raw message">
                        <UButton color="gray" variant="ghost" icon="i-heroicons-clipboard" size="xs" @click="copyError(sample)" />
                      </UTooltip>
                    </div>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
interface CollectorState {
  status: 'running' | 'complete' | 'partial' | 'error'
  startedAt: string
  completedAt?: string
  factsWritten: number
  markersWritten?: number
  causesWritten?: number
}

interface FailureGroup {
  id: string
  accountId?: string
  enclaveName?: string
  environment: 'commercial' | 'govcloud'
  category: string
  regions: string[]
  count: number
  explanation: string
  remediation: string
  samples: string[]
}

interface CollectionStatus {
  state: CollectorState | null
  running: boolean
  targetCoveragePercent: number
  accountCoveragePercent: number
  targetAttempted: number
  targetSucceeded: number
  accountAttempted: number
  accountSucceeded: number
  failureGroups: FailureGroup[]
  errorSummary: Array<{ category: string; count: number }>
  affectedAccounts: number
}

const toast = useToast()
const status = ref<CollectionStatus | null>(null)
const loading = ref(true)
const triggeringRange = ref<number | null>(null)
const error = ref<string | null>(null)
const search = ref('')
const category = ref('all')
const expanded = ref(new Set<string>())
let pollTimer: ReturnType<typeof setInterval> | null = null

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
const categoryOptions = computed(() => [
  { label: 'All categories', value: 'all' },
  ...(status.value?.errorSummary || []).map(group => ({ label: `${group.category} (${group.count})`, value: group.category }))
])
const filteredFailures = computed(() => {
  const query = search.value.trim().toLowerCase()
  return (status.value?.failureGroups || []).filter(item =>
    (category.value === 'all' || item.category === category.value) &&
    (!query || `${item.category} ${item.accountId || ''} ${item.enclaveName || ''} ${item.regions.join(' ')} ${item.remediation}`.toLowerCase().includes(query)))
})
const metrics = computed(() => [
  {
    label: 'Account-region coverage',
    value: `${(status.value?.targetCoveragePercent || 0).toFixed(1)}%`,
    note: `${status.value?.targetSucceeded || 0} of ${status.value?.targetAttempted || 0} targets`
  },
  {
    label: 'Unique account coverage',
    value: `${(status.value?.accountCoveragePercent || 0).toFixed(1)}%`,
    note: `${status.value?.accountSucceeded || 0} of ${status.value?.accountAttempted || 0} accounts`
  },
  {
    label: 'Facts written',
    value: new Intl.NumberFormat().format(state.value?.factsWritten || 0),
    note: `${new Intl.NumberFormat().format(state.value?.markersWritten || 0)} coverage markers · ${new Intl.NumberFormat().format(state.value?.causesWritten || 0)} causes`
  },
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
    status.value = response.data
  } catch (err: any) {
    error.value = err.data?.error?.message || err.message || 'Failed to load collection status'
  } finally {
    loading.value = false
  }
}

async function runCollection(backfillDays: number) {
  triggeringRange.value = backfillDays
  try {
    await $fetch('/api/admin/ai-usage/collect', { method: 'POST', body: { backfillDays } })
    toast.add({ title: backfillDays === 400 ? 'Full backfill started' : 'Incremental collection started', color: 'green', icon: 'i-heroicons-play' })
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
    triggeringRange.value = null
  }
}

function toggleExpanded(id: string) {
  const next = new Set(expanded.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expanded.value = next
}

async function copyError(message: string) {
  await navigator.clipboard.writeText(message)
  toast.add({ title: 'Raw message copied', color: 'green' })
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString()
}

onMounted(() => {
  void loadStatus()
  pollTimer = setInterval(() => void loadStatus(), 10000)
})

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
})
</script>
