<template>
  <div class="space-y-4">
    <!-- Time range selector and org analytics link -->
    <div class="flex justify-between items-center">
      <div class="flex items-center gap-4">
        <div class="text-sm text-gray-400">
          Showing pipeline data for the last <strong class="text-white">{{ selectedDays }} days</strong>
        </div>
        <!-- Admin-only organization analytics link -->
        <ClientOnly>
          <NuxtLink
            v-if="isAdmin"
            to="/admin/pipelines"
            class="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1"
          >
            <UIcon name="i-heroicons-chart-bar" class="w-4 h-4" />
            View Organization Analytics
          </NuxtLink>
        </ClientOnly>
      </div>
      <UButtonGroup size="sm">
        <UButton
          :color="selectedDays === 7 ? 'primary' : 'gray'"
          :variant="selectedDays === 7 ? 'solid' : 'ghost'"
          @click="selectedDays = 7"
        >
          7 Days
        </UButton>
        <UButton
          :color="selectedDays === 30 ? 'primary' : 'gray'"
          :variant="selectedDays === 30 ? 'solid' : 'ghost'"
          @click="selectedDays = 30"
        >
          30 Days
        </UButton>
        <UButton
          :color="selectedDays === 90 ? 'primary' : 'gray'"
          :variant="selectedDays === 90 ? 'solid' : 'ghost'"
          @click="selectedDays = 90"
        >
          90 Days
        </UButton>
      </UButtonGroup>
    </div>

    <!-- Error message -->
    <UAlert
      v-if="error"
      color="red"
      icon="i-heroicons-exclamation-triangle"
      variant="solid"
      :close-button="{ icon: 'i-heroicons-x-mark', color: 'white', variant: 'link' }"
      @close="error = null"
    >
      <template #title>Failed to load pipeline data</template>
      <template #description>{{ error }}</template>
    </UAlert>

    <!-- Row 1: Deployment Health (full width) -->
    <PipelinesAccountDeploymentHealth
      :account-id="accountId"
      :days="selectedDays"
    />

    <!-- Row 2: Success Chart (2 col) + Summary Stats (1 col) -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div class="lg:col-span-2">
        <PipelineSuccessChart
          :daily-metrics="summaryData?.dailyMetrics || []"
          :loading="loading"
        />
      </div>

      <!-- Summary Stats Card -->
      <UCard class="lg:col-span-1">
        <template #header>
          <div class="text-lg font-semibold">Summary</div>
        </template>

        <CenteredLoadingSpinner v-if="loading" />
        <div v-else-if="summaryData?.summary" class="space-y-4">
          <div>
            <div class="text-gray-400 text-sm mb-1">Pipeline Runs</div>
            <div class="text-2xl font-bold text-white">
              {{ summaryData.summary.totalRuns }}
            </div>
            <div class="text-sm text-gray-400 mt-1">
              <span class="text-green-400">{{ summaryData.summary.successfulRuns }} pipelines</span>,
              <span class="text-red-400">{{ summaryData.summary.failedRuns }} failed</span>
            </div>
          </div>

          <div class="border-t border-gray-700 pt-3">
            <div class="text-gray-400 text-sm mb-1">Account Results</div>
            <div class="text-xl font-semibold">
              <span class="text-green-400">{{ summaryData.summary.successfulAccounts || 0 }}</span> /
              <span class="text-red-400">{{ summaryData.summary.failedAccounts || 0 }}</span>
            </div>
            <div class="text-xs text-gray-400 mt-1">
              {{ summaryData.summary.accountSuccessRate ? summaryData.summary.accountSuccessRate.toFixed(1) : 0 }}% success rate
            </div>
          </div>

          <div class="border-t border-gray-700 pt-3">
            <div class="text-gray-400 text-sm mb-1">Avg Duration</div>
            <div class="text-xl font-semibold text-white">
              {{ formatDuration(summaryData.summary.avgDurationSeconds) }}
            </div>
          </div>

          <div class="border-t border-gray-700 pt-3">
            <div class="text-gray-400 text-sm mb-1">Total Changes</div>
            <div class="text-xl font-semibold text-blue-400">
              {{ summaryData.summary.totalChanges }}
            </div>
          </div>

          <div class="border-t border-gray-700 pt-3">
            <div class="text-gray-400 text-sm mb-1">Most Recent Run</div>
            <div v-if="summaryData.summary.recentRuns && summaryData.summary.recentRuns.length > 0" class="text-sm">
              <div class="text-white font-medium">{{ summaryData.summary.recentRuns[0].job_name }}</div>
              <div class="text-gray-400 text-xs">{{ formatRelativeTime(summaryData.summary.recentRuns[0].timestamp_start) }}</div>
            </div>
            <div v-else class="text-sm text-gray-400">No runs found</div>
          </div>
        </div>
        <div v-else class="text-center py-8 text-gray-400">
          No data available
        </div>
      </UCard>
    </div>

    <!-- Row 3: Planned vs Applied (full width) -->
    <PipelinesPlannedVsAppliedPanel
      :account-id="accountId"
      :days="selectedDays"
      :repo-names="repoNames"
    />

    <!-- Row 4: Resource Changes (1.5 col) + Error Distribution (1.5 col) -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <ResourceChangeChart
        :resource-breakdown="summaryData?.summary.resourceBreakdown || []"
        :loading="loading"
      />

      <ErrorDistributionChart
        :error-breakdown="summaryData?.summary.errorBreakdown || []"
        :loading="loading"
      />
    </div>

    <!-- Row 5: Resource Search (full width) -->
    <PipelinesResourceSearchPanel
      :account-id="accountId"
    />

    <!-- Row 6: Pipeline Timeline Table with pagination (full width) -->
    <PipelineTimeline
      :pipeline-runs="summaryData?.summary.recentRuns || []"
      :loading="loading"
    />
  </div>
</template>

<script setup lang="ts">
import PipelinesAccountDeploymentHealth from '~/components/pipelines/AccountDeploymentHealth.vue'
import PipelinesPlannedVsAppliedPanel from '~/components/pipelines/PlannedVsAppliedPanel.vue'
import PipelinesResourceSearchPanel from '~/components/pipelines/ResourceSearchPanel.vue'
import { parseGitLabUrl } from '~/utils/gitlab-url-parser'

const props = defineProps<{
  accountId: string
}>()

const { isAdmin } = useUserRoles()
const { fetchAccountSummary } = usePipelineData()
const selectedDays = ref(7)
const loading = ref(true)
const error = ref<string | null>(null)
const summaryData = ref<any>(null)

// Extract unique repo names from recent pipeline runs for the state comparison dropdown
const repoNames = computed<string[]>(() => {
  const runs = summaryData.value?.summary?.recentRuns
  if (!runs?.length) return []
  const names = new Set<string>()
  for (const run of runs) {
    const parsed = parseGitLabUrl(run.job_url)
    if (parsed?.project) names.add(parsed.project)
  }
  return Array.from(names).sort()
})

// Fetch pipeline summary data
async function fetchPipelineData() {
  loading.value = true
  error.value = null

  try {
    summaryData.value = await fetchAccountSummary(props.accountId, selectedDays.value, 'commercial')
  } catch (err: any) {
    console.error('Error fetching pipeline data:', err)
    error.value = err.message || 'An unexpected error occurred'
  } finally {
    loading.value = false
  }
}

// Watch for days change and refetch
watch(selectedDays, () => {
  fetchPipelineData()
})

// Fetch on mount
onMounted(() => {
  fetchPipelineData()
})

// Helper functions
function formatDuration(seconds: number): string {
  if (!seconds) return 'N/A'

  const mins = Math.floor(seconds / 60)
  const hours = Math.floor(mins / 60)

  if (hours > 0) {
    return `${hours}h ${mins % 60}m`
  }
  if (mins > 0) {
    return `${mins}m ${seconds % 60}s`
  }
  return `${seconds}s`
}

function formatRelativeTime(timestamp: string): string {
  if (!timestamp) return 'N/A'

  const date = new Date(timestamp)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffDays > 0) {
    return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`
  }
  if (diffHours > 0) {
    return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`
  }
  if (diffMins > 0) {
    return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`
  }
  return 'Just now'
}
</script>
