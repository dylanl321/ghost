<template>
  <UCard>
    <template #header>
      <div class="flex justify-between items-center">
        <div class="text-lg font-semibold">Deployment Health</div>
        <UBadge
          v-if="healthData"
          :color="healthColor"
          variant="soft"
          size="sm"
        >
          {{ healthData.healthRating.charAt(0).toUpperCase() + healthData.healthRating.slice(1) }}
        </UBadge>
      </div>
    </template>

    <CenteredLoadingSpinner v-if="loading" />
    <div v-else-if="error" class="text-center py-4 text-red-400 text-sm">
      {{ error }}
    </div>
    <div v-else-if="!healthData" class="text-center py-8 text-gray-400">
      No deployment data available
    </div>
    <div v-else class="space-y-4">
      <!-- Health Score + Factors -->
      <div class="flex items-start gap-6">
        <!-- Score circle -->
        <div class="flex-shrink-0 text-center">
          <div
            class="w-20 h-20 rounded-full flex items-center justify-center border-4"
            :class="healthBorderClass"
          >
            <span class="text-2xl font-bold" :class="healthTextClass">{{ healthData.healthScore }}</span>
          </div>
          <div class="text-xs text-gray-400 mt-1">Health Score</div>
        </div>

        <!-- Factor breakdown -->
        <div class="flex-1 grid grid-cols-2 gap-3">
          <div class="bg-gray-800/50 rounded-lg p-3">
            <div class="text-xs text-gray-400">Latest Pipeline</div>
            <div class="font-semibold mt-1">
              <UBadge
                :color="healthData.factors.latestPipelineStatus === 'success' ? 'green' : healthData.factors.latestPipelineStatus === 'unknown' ? 'gray' : 'red'"
                variant="soft"
                size="xs"
              >
                {{ formatStatus(healthData.factors.latestPipelineStatus) }}
              </UBadge>
            </div>
          </div>
          <div class="bg-gray-800/50 rounded-lg p-3">
            <div class="text-xs text-gray-400">Apply Rate</div>
            <div class="font-semibold mt-1" :class="healthData.factors.planSuccessRate >= 90 ? 'text-green-400' : healthData.factors.planSuccessRate >= 70 ? 'text-yellow-400' : 'text-red-400'">
              {{ healthData.factors.planSuccessRate }}%
            </div>
          </div>
          <div class="bg-gray-800/50 rounded-lg p-3">
            <div class="text-xs text-gray-400">Recurring Errors</div>
            <div class="font-semibold mt-1" :class="healthData.factors.recurringErrorCount === 0 ? 'text-green-400' : 'text-orange-400'">
              {{ healthData.factors.recurringErrorCount }}
            </div>
          </div>
          <div class="bg-gray-800/50 rounded-lg p-3">
            <div class="text-xs text-gray-400">Unapplied Resources</div>
            <div class="font-semibold mt-1" :class="healthData.factors.unappliedResourceCount === 0 ? 'text-green-400' : 'text-orange-400'">
              {{ healthData.factors.unappliedResourceCount }}
            </div>
          </div>
        </div>
      </div>

      <!-- Recurring Errors Section -->
      <div v-if="healthData.recurringErrors.length > 0" class="border-t border-gray-700 pt-4">
        <div class="flex justify-between items-center mb-3">
          <h4 class="text-sm font-semibold text-gray-300">Recurring Errors</h4>
          <UBadge color="orange" variant="soft" size="xs">
            {{ healthData.recurringErrors.length }} pattern{{ healthData.recurringErrors.length === 1 ? '' : 's' }}
          </UBadge>
        </div>

        <div class="space-y-2">
          <div
            v-for="(err, idx) in paginatedErrors"
            :key="idx"
            class="bg-gray-800/50 rounded-lg p-3"
          >
            <div class="flex items-start justify-between gap-4">
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1">
                  <UBadge :color="getSeverityColor(err.error_severity)" variant="soft" size="xs">
                    {{ err.error_severity }}
                  </UBadge>
                  <span class="text-sm text-gray-300">{{ err.error_category }}</span>
                </div>
                <div class="text-xs text-gray-400 truncate" :title="err.error_message">
                  {{ err.error_message }}
                </div>
                <div class="text-xs text-gray-500 mt-1">
                  {{ err.occurrence_count }}x across {{ err.affected_pipelines }} pipeline{{ err.affected_pipelines === 1 ? '' : 's' }}
                  &middot; Last seen {{ formatTimestamp(err.last_seen) }}
                </div>
              </div>
              <UButton
                size="xs"
                color="gray"
                variant="ghost"
                icon="i-heroicons-globe-alt"
                :loading="crossAccountLoading === idx"
                @click="checkCrossAccount(err, idx)"
              >
                Check Other Accounts
              </UButton>
            </div>

            <!-- Cross-account results (inline) -->
            <div v-if="crossAccountResults[idx]" class="mt-3 border-t border-gray-700 pt-3">
              <div class="text-xs text-gray-400 mb-2">
                Found in {{ crossAccountResults[idx].length }} account{{ crossAccountResults[idx].length === 1 ? '' : 's' }}
              </div>
              <div class="space-y-1 max-h-40 overflow-y-auto">
                <div
                  v-for="acct in crossAccountResults[idx]"
                  :key="acct.account_id"
                  class="flex justify-between text-xs px-2 py-1 rounded bg-gray-900/50"
                >
                  <NuxtLink :to="`/account/${acct.account_id}`" class="text-blue-400 hover:text-blue-300">
                    {{ acct.account_name || acct.account_id }}
                  </NuxtLink>
                  <span class="text-gray-400">{{ acct.occurrence_count }}x &middot; {{ formatTimestamp(acct.last_seen) }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Error pagination -->
        <div v-if="healthData.recurringErrors.length > errorPageSize" class="flex justify-end mt-3">
          <UPagination
            v-model="errorPage"
            :page-count="errorPageSize"
            :total="healthData.recurringErrors.length"
          />
        </div>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import type { AccountDeploymentHealth, CrossAccountError, RecurringErrorPattern } from '#shared/types/pipelines'

const props = defineProps<{
  accountId: string
  days: number
}>()

const { fetchAccountHealth } = usePipelineData()
const loading = ref(true)
const error = ref<string | null>(null)
const healthData = ref<AccountDeploymentHealth | null>(null)

// Error pagination
const errorPage = ref(1)
const errorPageSize = 5

const paginatedErrors = computed(() => {
  if (!healthData.value) return []
  const start = (errorPage.value - 1) * errorPageSize
  return healthData.value.recurringErrors.slice(start, start + errorPageSize)
})

// Cross-account error comparison
const crossAccountLoading = ref<number | null>(null)
const crossAccountResults = ref<Record<number, CrossAccountError[]>>({})

// Health display helpers
const healthColor = computed(() => {
  if (!healthData.value) return 'gray'
  switch (healthData.value.healthRating) {
    case 'healthy': return 'green'
    case 'warning': return 'yellow'
    case 'critical': return 'red'
    default: return 'gray'
  }
})

const healthBorderClass = computed(() => {
  if (!healthData.value) return 'border-gray-600'
  switch (healthData.value.healthRating) {
    case 'healthy': return 'border-green-500'
    case 'warning': return 'border-yellow-500'
    case 'critical': return 'border-red-500'
    default: return 'border-gray-600'
  }
})

const healthTextClass = computed(() => {
  if (!healthData.value) return 'text-gray-400'
  switch (healthData.value.healthRating) {
    case 'healthy': return 'text-green-400'
    case 'warning': return 'text-yellow-400'
    case 'critical': return 'text-red-400'
    default: return 'text-gray-400'
  }
})

async function fetchHealthData() {
  loading.value = true
  error.value = null
  crossAccountResults.value = {}

  try {
    healthData.value = await fetchAccountHealth(props.accountId, props.days)
  } catch (err: any) {
    error.value = err.message || 'Failed to load deployment health'
  } finally {
    loading.value = false
  }
}

async function checkCrossAccount(err: RecurringErrorPattern, idx: number) {
  crossAccountLoading.value = idx

  try {
    const params = new URLSearchParams({
      error_category: err.error_category,
      error_message: err.error_message.substring(0, 100),
      days: String(props.days)
    })
    const result = await $fetch<any>(`/api/pipelines/error-cross-account?${params}`)

    if (result.success) {
      crossAccountResults.value[idx] = result.data || []
    }
  } catch {
    // Silently fail - cross-account check is supplementary
  } finally {
    crossAccountLoading.value = null
  }
}

function formatStatus(status: string): string {
  return status
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function getSeverityColor(severity: string): string {
  switch (severity?.toLowerCase()) {
    case 'critical': return 'red'
    case 'high': return 'orange'
    case 'medium': return 'yellow'
    case 'low': return 'blue'
    default: return 'gray'
  }
}

function formatTimestamp(ts: string): string {
  if (!ts) return 'N/A'
  try {
    const date = new Date(ts)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffHours / 24)
    if (diffDays > 0) return `${diffDays}d ago`
    if (diffHours > 0) return `${diffHours}h ago`
    return 'Recently'
  } catch {
    return ts
  }
}

// Fetch on mount and when props change
watch(() => [props.accountId, props.days], () => {
  fetchHealthData()
}, { immediate: true })
</script>
