<template>
  <div class="space-y-6 p-6">
    <!-- Page Header -->
    <UCard>
      <div class="flex gap-2 items-center justify-between">
        <div>
          <h1 class="font-semibold text-2xl mb-2">Pipeline Analytics</h1>
          <p class="text-sm text-gray-400">
            Organization-wide GitLab pipeline metrics and trends across all accounts
          </p>
        </div>
        <div class="flex gap-2 items-center">
          <!-- View Repositories Button -->
          <UButton
            to="/admin/pipelines/repositories"
            color="primary"
            variant="soft"
            icon="i-heroicons-folder"
          >
            View Repositories
          </UButton>
          <!-- View Authors Button -->
          <UButton
            to="/admin/pipelines/authors"
            color="primary"
            variant="soft"
            icon="i-heroicons-users"
          >
            View Authors
          </UButton>
          <!-- Author Filter -->
          <PipelinesAuthorSelector
            v-model="selectedAuthor"
            :days="selectedDays"
            environment="govcloud"
          />
          <!-- Time Range Selector -->
          <USelectMenu
            v-model="selectedDays"
            :options="timeRangeOptions"
            value-attribute="value"
            option-attribute="label"
            class="w-40"
          >
            <template #label>
              <UIcon name="i-heroicons-calendar" class="mr-2" />
              {{ selectedDaysLabel }}
            </template>
          </USelectMenu>
        </div>
      </div>
    </UCard>

    <!-- Loading Alert -->
    <UAlert
      v-if="loading"
      color="blue"
      icon="i-heroicons-clock"
      variant="soft"
    >
      <template #title>Loading Pipeline Data</template>
      <template #description>
        Pipeline data is being queried from AWS Athena. This may take 30-60 seconds...
      </template>
    </UAlert>

    <!-- Error Alert -->
    <UAlert
      v-if="error"
      color="red"
      icon="i-heroicons-exclamation-triangle"
      variant="solid"
      :close-button="{ icon: 'i-heroicons-x-mark', color: 'white', variant: 'link' }"
      @close="error = null"
    >
      <template #title>Failed to Load Pipeline Data</template>
      <template #description>{{ error }}</template>
    </UAlert>

    <!-- Dashboard Content -->
    <div v-if="!loading && !error" class="space-y-4">
      <!-- Row 1: Summary Stats -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <!-- Total Runs -->
        <UCard>
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-400">Total Runs</p>
              <p class="text-2xl font-bold mt-1">{{ formatNumber(summary?.total_runs) }}</p>
            </div>
            <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 text-blue-500" />
          </div>
        </UCard>

        <!-- Account Success Rate -->
        <UCard>
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-400">Account Success Rate</p>
              <p class="text-2xl font-bold mt-1">{{ formatPercentage(summary?.account_success_rate) }}</p>
              <p class="text-xs text-gray-500 mt-1">
                {{ formatNumber(summary?.successful_accounts) }} / {{ formatNumber(summary?.total_account_plans) }} accounts
              </p>
            </div>
            <UIcon name="i-heroicons-check-circle" class="w-8 h-8 text-green-500" />
          </div>
        </UCard>

        <!-- Active Accounts -->
        <UCard>
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-400">Active Accounts</p>
              <p class="text-2xl font-bold mt-1">{{ formatNumber(summary?.unique_accounts) }}</p>
            </div>
            <UIcon name="i-heroicons-building-office" class="w-8 h-8 text-purple-500" />
          </div>
        </UCard>

        <!-- Avg Duration -->
        <UCard>
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-400">Avg Duration</p>
              <p class="text-2xl font-bold mt-1">{{ formatDuration(summary?.avg_duration) }}</p>
            </div>
            <UIcon name="i-heroicons-clock" class="w-8 h-8 text-orange-500" />
          </div>
        </UCard>
      </div>

      <!-- Row 1.5: Account-Level Details -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <!-- Successful Accounts -->
        <UCard>
          <div class="flex items-center justify-between">
            <div class="flex-1">
              <p class="text-sm text-gray-400">Successful Accounts</p>
              <p class="text-2xl font-bold mt-1 text-green-400">{{ formatNumber(summary?.successful_accounts) }}</p>
              <p class="text-xs text-gray-500 mt-1">Plans applied successfully</p>
            </div>
            <UIcon name="i-heroicons-check-badge" class="w-8 h-8 text-green-500" />
          </div>
        </UCard>

        <!-- Failed Accounts -->
        <UCard>
          <div class="flex items-center justify-between">
            <div class="flex-1">
              <p class="text-sm text-gray-400">Failed Accounts</p>
              <p class="text-2xl font-bold mt-1 text-red-400">{{ formatNumber(summary?.failed_accounts) }}</p>
              <p class="text-xs text-gray-500 mt-1">Plans failed to apply</p>
            </div>
            <UIcon name="i-heroicons-x-circle" class="w-8 h-8 text-red-500" />
          </div>
        </UCard>

        <!-- Pending Accounts -->
        <UCard>
          <div class="flex items-center justify-between">
            <div class="flex-1">
              <p class="text-sm text-gray-400">Pending Accounts</p>
              <p class="text-2xl font-bold mt-1 text-yellow-400">{{ formatNumber(summary?.pending_accounts) }}</p>
              <p class="text-xs text-gray-500 mt-1">Awaiting application</p>
            </div>
            <UIcon name="i-heroicons-clock" class="w-8 h-8 text-yellow-500" />
          </div>
        </UCard>
      </div>

      <!-- Row 2: Trend Chart (2/3) + Activity Heat Map (1/3) -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div class="lg:col-span-2">
          <PipelinesOrganizationTrendChart
            :daily-metrics="dailyMetrics"
            :loading="loading"
          />
        </div>
        <div class="lg:col-span-1">
          <PipelinesActivityHeatMap
            :heat-map-data="heatMapData"
            :loading="loading"
          />
        </div>
      </div>

      <!-- Row 3: Account Performance (1/2) + Resource Breakdown (1/2) -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PipelinesAccountPerformanceChart
          :account-breakdown="accountBreakdown"
          :loading="loading"
        />
        <UCard>
          <template #header>
            <h3 class="font-semibold">Resource Changes</h3>
          </template>
          <div v-if="resourceBreakdown && resourceBreakdown.length > 0" class="space-y-2">
            <div
              v-for="resource in resourceBreakdown.slice(0, 10)"
              :key="`${resource.resource_type}-${resource.change_action}`"
              class="flex items-center justify-between py-2 border-b border-gray-700 last:border-0"
            >
              <div class="flex items-center gap-2">
                <UBadge
                  :color="getActionColor(resource.change_action)"
                  variant="soft"
                  size="xs"
                >
                  {{ resource.change_action }}
                </UBadge>
                <span class="text-sm text-gray-300">{{ resource.resource_type }}</span>
              </div>
              <span class="text-sm font-semibold text-gray-400">{{ formatNumber(resource.count) }}</span>
            </div>
          </div>
          <div v-else class="text-center py-8 text-gray-400">
            No resource changes in this period
          </div>
        </UCard>
      </div>

      <!-- Row 4: Repository Breakdown Table (Full Width) -->
      <PipelinesRepositoryBreakdownTable
        :timeline-data="filteredTimelineData"
        :loading="loading"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { parseGitLabUrl } from '~/utils/gitlab-url-parser'

// Direct imports of components (Nuxt auto-import not working for subdirectories)
import PipelinesOrganizationTrendChart from '~/components/pipelines/OrganizationTrendChart.vue'
import PipelinesActivityHeatMap from '~/components/pipelines/ActivityHeatMap.vue'
import PipelinesAccountPerformanceChart from '~/components/pipelines/AccountPerformanceChart.vue'
import PipelinesRepositoryBreakdownTable from '~/components/pipelines/RepositoryBreakdownTable.vue'
import PipelinesAuthorSelector from '~/components/pipelines/AuthorSelector.vue'

// Admin-only access control
definePageMeta({
  layout: 'admin',
  middleware: 'auth-permission',
  permission: 'admin.logs'
})

// Time range options
const timeRangeOptions = [
  { label: 'Last 7 Days', value: 7 },
  { label: 'Last 30 Days', value: 30 },
  { label: 'Last 90 Days', value: 90 }
]

const selectedDays = ref(30)
const selectedDaysLabel = computed(() => {
  const option = timeRangeOptions.find(o => o.value === selectedDays.value)
  return option?.label || 'Last 30 Days'
})

// Author filter
const selectedAuthor = ref<string | null>(null)

// Data state
const loading = ref(true)
const error = ref<string | null>(null)
const summary = ref<any>(null)
const dailyMetrics = ref<any[]>([])
const accountBreakdown = ref<any[]>([])
const resourceBreakdown = ref<any[]>([])
const errorBreakdown = ref<any[]>([])
const timelineData = ref<any[]>([])
const heatMapData = ref<any[]>([])

// Fetch pipeline data
async function fetchPipelineData() {
  loading.value = true
  error.value = null

  try {
    // Fetch summary and timeline in parallel
    const [summaryResponse, timelineResponse] = await Promise.all([
      fetch(`/api/pipelines/global-summary?days=${selectedDays.value}`),
      fetch(`/api/pipelines/global-timeline?days=${selectedDays.value}&limit=200`)
    ])

    if (!summaryResponse.ok) {
      throw new Error('Failed to fetch pipeline summary')
    }
    if (!timelineResponse.ok) {
      throw new Error('Failed to fetch pipeline timeline')
    }

    const summaryJson = await summaryResponse.json()
    const timelineJson = await timelineResponse.json()

    // Extract data from responses
    if (summaryJson.success && summaryJson.data) {
      summary.value = summaryJson.data.summary
      dailyMetrics.value = summaryJson.data.dailyMetrics || []
      accountBreakdown.value = summaryJson.data.accountBreakdown || []
      resourceBreakdown.value = summaryJson.data.resourceBreakdown || []
      errorBreakdown.value = summaryJson.data.errorBreakdown || []
    }

    if (timelineJson.success && timelineJson.data) {
      // Parse repository info from job URLs
      timelineData.value = timelineJson.data.map((run: any) => ({
        ...run,
        repository: parseGitLabUrl(run.job_url)
      }))
    }

    // Generate heat map data from daily metrics (simplified)
    heatMapData.value = dailyMetrics.value.slice(0, 30)

  } catch (err: any) {
    console.error('Error fetching pipeline data:', err)
    error.value = err.message || 'An unknown error occurred'
  } finally {
    loading.value = false
  }
}

// Filter timeline data by author
const filteredTimelineData = computed(() => {
  if (!selectedAuthor.value || !timelineData.value) {
    return timelineData.value
  }

  // Filter by author email (case-insensitive partial match)
  return timelineData.value.filter((run: any) => {
    if (!run.commit_author) return false
    return run.commit_author.toLowerCase().includes(selectedAuthor.value!.toLowerCase())
  })
})

// Watch for time range changes and author changes
watch([selectedDays, selectedAuthor], () => {
  fetchPipelineData()
})

// Initial load
onMounted(() => {
  fetchPipelineData()
})

// Formatting helpers
function formatNumber(num: number | undefined): string {
  if (num === undefined || num === null) return '0'
  return num.toLocaleString()
}

function formatPercentage(num: number | undefined): string {
  if (num === undefined || num === null) return '0%'
  return `${num.toFixed(1)}%`
}

function formatDuration(seconds: number | undefined): string {
  if (!seconds) return '0m'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return `${hours}h ${remainingMinutes}m`
}

function getActionColor(action: string): string {
  const actionLower = action.toLowerCase()
  if (actionLower.includes('create')) return 'green'
  if (actionLower.includes('destroy') || actionLower.includes('delete')) return 'red'
  if (actionLower.includes('update') || actionLower.includes('modify')) return 'blue'
  return 'gray'
}
</script>
