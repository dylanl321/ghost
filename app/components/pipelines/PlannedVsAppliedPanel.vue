<template>
  <UCard>
    <template #header>
      <div class="flex justify-between items-center">
        <div class="text-lg font-semibold">Planned vs Applied</div>
        <UBadge
          v-if="!loading && driftData"
          :color="unappliedCount > 0 ? 'orange' : 'green'"
          variant="soft"
          size="sm"
        >
          {{ unappliedCount > 0 ? `${unappliedCount} unapplied resources` : 'All resources applied' }}
        </UBadge>
      </div>
    </template>

    <CenteredLoadingSpinner v-if="loading" />

    <UAlert
      v-else-if="error"
      color="red"
      icon="i-heroicons-exclamation-triangle"
      title="Failed to load drift data"
      :description="error"
      class="mb-4"
    />

    <div v-else-if="!driftData" class="text-center py-8 text-gray-400">
      No drift data available for this account
    </div>

    <div v-else class="space-y-6">
      <!-- Progress bar -->
      <div>
        <div class="flex justify-between text-xs text-gray-400 mb-1">
          <span>Applied: {{ driftData.summary.totalApplied }}</span>
          <span>Failed: {{ driftData.summary.totalFailed }}</span>
          <span>Not Applied: {{ driftData.summary.totalPending }}</span>
        </div>
        <div class="h-4 bg-gray-700 rounded-full overflow-hidden flex">
          <div
            class="h-full bg-green-500 transition-all"
            :style="{ width: `${appliedPercent}%` }"
          />
          <div
            class="h-full bg-red-500 transition-all"
            :style="{ width: `${failedPercent}%` }"
          />
          <div
            class="h-full bg-yellow-500 transition-all"
            :style="{ width: `${pendingPercent}%` }"
          />
        </div>
        <div class="flex justify-between text-xs text-gray-500 mt-1">
          <span>{{ appliedPercent.toFixed(1) }}%</span>
          <span>{{ failedPercent.toFixed(1) }}%</span>
          <span>{{ pendingPercent.toFixed(1) }}%</span>
        </div>
      </div>

      <!-- Resource type breakdown table -->
      <div v-if="driftData.summary.byResourceType?.length">
        <h4 class="text-sm font-semibold text-gray-300 mb-2">Breakdown by Resource Type</h4>
        <UTable
          :rows="driftData.summary.byResourceType"
          :columns="breakdownColumns"
        >
          <template #resource_type-data="{ row }">
            <code class="text-xs text-gray-300 bg-gray-800 px-2 py-1 rounded">
              {{ row.resource_type }}
            </code>
          </template>
        </UTable>
      </div>

      <!-- Unapplied resources table -->
      <div v-if="driftData.unappliedResources?.length">
        <h4 class="text-sm font-semibold text-gray-300 mb-2">Unapplied Resources</h4>
        <UTable
          :rows="paginatedUnapplied"
          :columns="unappliedColumns"
        >
          <template #change_action-data="{ row }">
            <UBadge
              :color="getActionColor(row.change_action)"
              variant="soft"
              size="sm"
            >
              {{ row.change_action }}
            </UBadge>
          </template>

          <template #resource_address-data="{ row }">
            <code class="text-xs text-gray-300 bg-gray-800 px-2 py-1 rounded break-all" :title="row.resource_address">
              {{ formatResourceAddress(row.resource_address) }}
            </code>
          </template>

          <template #resource_type-data="{ row }">
            <code class="text-xs text-gray-300 bg-gray-800 px-2 py-1 rounded">
              {{ row.resource_type }}
            </code>
          </template>

          <template #module_name-data="{ row }">
            <span class="text-sm text-gray-300">{{ row.module_name || '-' }}</span>
          </template>

          <template #latest_timestamp-data="{ row }">
            <span class="text-sm text-gray-400">{{ formatTimestamp(row.latest_timestamp) }}</span>
          </template>
        </UTable>

        <!-- Pagination -->
        <div v-if="driftData.unappliedResources.length > unappliedPageSize" class="flex justify-between items-center mt-4">
          <div class="text-sm text-gray-400">
            Showing {{ unappliedStart }}-{{ unappliedEnd }} of {{ driftData.unappliedResources.length }} unapplied resources
          </div>
          <UPagination
            v-model="unappliedPage"
            :page-count="unappliedPageSize"
            :total="driftData.unappliedResources.length"
          />
        </div>
      </div>

      <!-- State comparison section -->
      <div class="border-t border-gray-700 pt-4">
        <h4 class="text-sm font-semibold text-gray-300 mb-3">Compare to State File</h4>
        <div class="flex items-center gap-2 mb-3">
          <USelectMenu
            v-if="props.repoNames?.length"
            v-model="stateRepoName"
            :options="props.repoNames"
            placeholder="Select repository..."
            class="flex-1"
            size="sm"
            searchable
          />
          <UInput
            v-else
            v-model="stateRepoName"
            placeholder="Enter repository name..."
            class="flex-1"
            size="sm"
          />
          <UButton
            color="primary"
            size="sm"
            icon="i-heroicons-arrow-path"
            :loading="stateLoading"
            :disabled="!stateRepoName.trim()"
            @click="fetchStateComparison"
          >
            Compare to State File
          </UButton>
        </div>

        <!-- State comparison error -->
        <UAlert
          v-if="stateError"
          color="yellow"
          icon="i-heroicons-exclamation-triangle"
          title="State comparison failed"
          :description="stateError"
          class="mb-3"
        />

        <!-- State comparison loading -->
        <CenteredLoadingSpinner v-if="stateLoading" />

        <!-- State comparison results -->
        <div v-if="stateComparison && !stateLoading">
          <UAccordion
            :items="stateAccordionItems"
            :ui="{ wrapper: 'space-y-2' }"
          >
            <template #default="{ item, open }">
              <UButton
                color="gray"
                variant="ghost"
                class="w-full"
                :ui="{ rounded: 'rounded-lg', padding: { sm: 'p-3' } }"
              >
                <template #leading>
                  <UIcon
                    name="i-heroicons-chevron-right"
                    class="w-5 h-5 transition-transform duration-200"
                    :class="[open && 'rotate-90']"
                  />
                </template>
                <div class="flex items-center gap-2 w-full">
                  <span class="font-medium text-white">{{ item.label }}</span>
                  <UBadge :color="item.badgeColor" variant="soft" size="sm">
                    {{ item.count }}
                  </UBadge>
                </div>
              </UButton>
            </template>

            <template #item="{ item }">
              <div class="p-3 bg-gray-800/50 rounded-lg">
                <div v-if="item.resources.length === 0" class="text-sm text-gray-400 text-center py-2">
                  No resources in this category
                </div>
                <div v-else class="space-y-1 max-h-64 overflow-y-auto">
                  <div
                    v-for="resource in item.resources"
                    :key="resource"
                    class="text-xs font-mono text-gray-300 bg-gray-900 px-2 py-1 rounded"
                  >
                    {{ resource }}
                  </div>
                </div>
              </div>
            </template>
          </UAccordion>
        </div>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import type { PlannedVsAppliedSummary, UnappliedResource, StateComparison } from '~/shared/types/pipelines'

const logger = createLogger('PlannedVsAppliedPanel')

interface DriftData {
  summary: PlannedVsAppliedSummary
  unappliedResources: UnappliedResource[]
}

const props = defineProps<{
  accountId: string
  days: number
  repoNames?: string[]
}>()

const { fetchAccountDrift } = usePipelineData()
const loading = ref(true)
const error = ref<string | null>(null)
const driftData = ref<DriftData | null>(null)

// Unapplied resources pagination
const unappliedPage = ref(1)
const unappliedPageSize = 15

// State comparison
const stateRepoName = ref('')
const stateLoading = ref(false)
const stateError = ref<string | null>(null)
const stateComparison = ref<StateComparison | null>(null)

// Computed: unapplied count for the header badge
const unappliedCount = computed(() => {
  return driftData.value?.unappliedResources?.length ?? 0
})

// Computed: progress bar percentages
const totalResources = computed(() => {
  if (!driftData.value?.summary) return 0
  const s = driftData.value.summary
  return s.totalApplied + s.totalFailed + s.totalPending
})

const appliedPercent = computed(() => {
  if (totalResources.value === 0) return 0
  return (driftData.value!.summary.totalApplied / totalResources.value) * 100
})

const failedPercent = computed(() => {
  if (totalResources.value === 0) return 0
  return (driftData.value!.summary.totalFailed / totalResources.value) * 100
})

const pendingPercent = computed(() => {
  if (totalResources.value === 0) return 0
  return (driftData.value!.summary.totalPending / totalResources.value) * 100
})

// Paginated unapplied resources
const paginatedUnapplied = computed(() => {
  if (!driftData.value?.unappliedResources) return []
  const start = (unappliedPage.value - 1) * unappliedPageSize
  return driftData.value.unappliedResources.slice(start, start + unappliedPageSize)
})

const unappliedStart = computed(() => {
  if (!driftData.value?.unappliedResources?.length) return 0
  return (unappliedPage.value - 1) * unappliedPageSize + 1
})

const unappliedEnd = computed(() => {
  if (!driftData.value?.unappliedResources) return 0
  return Math.min(unappliedPage.value * unappliedPageSize, driftData.value.unappliedResources.length)
})

// State comparison accordion items
const stateAccordionItems = computed(() => {
  if (!stateComparison.value) return []

  return [
    {
      label: 'In State Only',
      slot: 'item',
      defaultOpen: false,
      badgeColor: 'red' as const,
      count: stateComparison.value.inStateOnly.length,
      resources: stateComparison.value.inStateOnly.map(r => r.address)
    },
    {
      label: 'In Plan Only',
      slot: 'item',
      defaultOpen: false,
      badgeColor: 'yellow' as const,
      count: stateComparison.value.inPlanOnly.length,
      resources: stateComparison.value.inPlanOnly.map(r => r.resource_address)
    },
    {
      label: 'Matched',
      slot: 'item',
      defaultOpen: false,
      badgeColor: 'green' as const,
      count: stateComparison.value.matched.length,
      resources: stateComparison.value.matched.map(r => r.address)
    }
  ]
})

// Table column definitions
const breakdownColumns = [
  { key: 'resource_type', label: 'Resource Type' },
  { key: 'planned', label: 'Planned', sortable: true },
  { key: 'applied', label: 'Applied', sortable: true },
  { key: 'failed', label: 'Failed', sortable: true },
  { key: 'pending', label: 'Not Applied', sortable: true }
]

const unappliedColumns = [
  { key: 'resource_address', label: 'Resource Address' },
  { key: 'resource_type', label: 'Resource Type' },
  { key: 'module_name', label: 'Module' },
  { key: 'change_action', label: 'Action' },
  { key: 'occurrence_count', label: 'Occurrences', sortable: true },
  { key: 'latest_timestamp', label: 'Last Seen', sortable: true }
]

// Fetch drift data from the API
async function fetchDriftData() {
  loading.value = true
  error.value = null

  try {
    driftData.value = await fetchAccountDrift(props.accountId, props.days)
  } catch (err: any) {
    logger.error('Error fetching drift data:', err)
    error.value = err.message || 'An unexpected error occurred'
  } finally {
    loading.value = false
  }
}

// Fetch state comparison data
async function fetchStateComparison() {
  if (!stateRepoName.value.trim()) return

  stateLoading.value = true
  stateError.value = null
  stateComparison.value = null

  try {
    const params = new URLSearchParams({
      account_id: props.accountId,
      repo_name: stateRepoName.value.trim(),
      days: String(props.days)
    })

    const result = await $fetch<any>(`/api/pipelines/account-state-comparison?${params}`)

    if (!result.data) {
      stateError.value = 'No state comparison data returned for this repository'
      return
    }

    stateComparison.value = result.data
  } catch (err: any) {
    logger.error('Error fetching state comparison:', err)
    stateError.value = err.message || 'An unexpected error occurred while comparing state'
  } finally {
    stateLoading.value = false
  }
}

// Map change actions to badge colors
function getActionColor(action: string): string {
  switch (action?.toLowerCase()) {
    case 'create':
      return 'green'
    case 'update':
      return 'blue'
    case 'destroy':
    case 'delete':
      return 'red'
    case 'replace':
      return 'yellow'
    default:
      return 'gray'
  }
}

// Format timestamps for display
function formatTimestamp(timestamp: string): string {
  if (!timestamp) return 'N/A'

  try {
    const date = new Date(timestamp)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch {
    return 'Invalid date'
  }
}

// Strip SHA digests and long hashes from Terraform resource addresses for readability
function formatResourceAddress(address: string): string {
  if (!address) return '-'
  // Replace SHA256 digests (64 hex chars) with a short label
  return address.replace(/sha256:[a-f0-9]{64}/gi, 'sha256:...')
    .replace(/[a-f0-9]{64}/gi, (match) => match.substring(0, 8) + '...')
}

// Fetch data on mount
onMounted(() => {
  fetchDriftData()
})

// Re-fetch when props change
watch(
  () => [props.accountId, props.days],
  () => {
    unappliedPage.value = 1
    stateComparison.value = null
    stateError.value = null
    fetchDriftData()
  }
)
</script>
