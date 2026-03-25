<template>
  <div class="space-y-6 p-6">
    <!-- Page Header -->
    <UCard>
      <div class="flex gap-2 items-center justify-between">
        <div>
          <h1 class="font-semibold text-2xl mb-2">GitLab Repositories</h1>
          <p class="text-sm text-gray-400">
            Pipeline activity grouped by repository across all accounts
          </p>
        </div>
        <div class="flex gap-2 items-center">
          <!-- Search -->
          <UInput
            v-model="searchQuery"
            icon="i-heroicons-magnifying-glass"
            placeholder="Search repositories..."
            class="w-64"
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
      <template #title>Loading Repository Data</template>
      <template #description>
        Querying pipeline data from AWS Athena...
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
      <template #title>Failed to Load Repository Data</template>
      <template #description>{{ error }}</template>
    </UAlert>

    <!-- Repository Grid -->
    <div v-if="!loading && !error" class="space-y-4">
      <!-- Summary Stats -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <UCard>
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-400">Total Repositories</p>
              <p class="text-2xl font-bold mt-1">{{ repositories.length }}</p>
            </div>
            <UIcon name="i-heroicons-folder" class="w-8 h-8 text-purple-500" />
          </div>
        </UCard>

        <UCard>
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-400">Total Pipeline Runs</p>
              <p class="text-2xl font-bold mt-1">{{ formatNumber(totalRuns) }}</p>
            </div>
            <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 text-blue-500" />
          </div>
        </UCard>

        <UCard>
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-400">Avg Success Rate</p>
              <p class="text-2xl font-bold mt-1">{{ formatPercentage(avgSuccessRate) }}</p>
            </div>
            <UIcon name="i-heroicons-check-circle" class="w-8 h-8 text-green-500" />
          </div>
        </UCard>

        <UCard>
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-400">Active Accounts</p>
              <p class="text-2xl font-bold mt-1">{{ uniqueAccountsCount }}</p>
            </div>
            <UIcon name="i-heroicons-building-office" class="w-8 h-8 text-orange-500" />
          </div>
        </UCard>
      </div>

      <!-- Repository Cards -->
      <div class="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        <UCard
          v-for="repo in filteredRepositories"
          :key="repo.fullPath"
          class="hover:ring-2 hover:ring-primary-500 transition-all cursor-pointer"
          @click="navigateToRepository(repo)"
        >
          <div class="space-y-4">
            <!-- Repository Header -->
            <div class="flex items-start justify-between">
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1">
                  <UIcon name="i-heroicons-folder" class="text-gray-400 flex-shrink-0" />
                  <h3 class="font-semibold text-white truncate">{{ repo.project }}</h3>
                </div>
                <p class="text-xs text-gray-400 truncate">{{ repo.group }}</p>
              </div>
              <UBadge :color="getSuccessRateColor(repo.successRate)" variant="soft" size="sm">
                {{ repo.successRate }}%
              </UBadge>
            </div>

            <!-- Metrics -->
            <div class="grid grid-cols-3 gap-3 text-sm">
              <div>
                <p class="text-gray-400 text-xs">Total Runs</p>
                <p class="font-semibold text-white">{{ repo.totalRuns }}</p>
              </div>
              <div>
                <p class="text-gray-400 text-xs">Accounts</p>
                <p class="font-semibold text-white">{{ repo.accounts.length }}</p>
              </div>
              <div>
                <p class="text-gray-400 text-xs">Avg Duration</p>
                <p class="font-semibold text-white">{{ formatDuration(repo.avgDuration) }}</p>
              </div>
            </div>

            <!-- Progress Bar -->
            <div class="space-y-1">
              <div class="flex items-center justify-between text-xs">
                <span class="text-green-400">{{ repo.successfulRuns }} successful</span>
                <span class="text-red-400">{{ repo.failedRuns }} failed</span>
              </div>
              <div class="h-2 bg-gray-700 rounded-full overflow-hidden flex">
                <div
                  class="bg-green-500"
                  :style="{ width: `${(repo.successfulRuns / repo.totalRuns) * 100}%` }"
                ></div>
                <div
                  class="bg-red-500"
                  :style="{ width: `${(repo.failedRuns / repo.totalRuns) * 100}%` }"
                ></div>
              </div>
            </div>

            <!-- Last Run -->
            <div class="flex items-center justify-between text-xs border-t border-gray-700 pt-3">
              <span class="text-gray-400">Last run:</span>
              <span class="text-gray-300">{{ formatRelativeTime(repo.lastRun) }}</span>
            </div>
          </div>
        </UCard>
      </div>

      <!-- Empty State -->
      <div v-if="filteredRepositories.length === 0" class="text-center py-12">
        <UIcon name="i-heroicons-magnifying-glass" class="w-12 h-12 text-gray-500 mx-auto mb-4" />
        <p class="text-gray-400">No repositories found matching "{{ searchQuery }}"</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { formatDistanceToNow } from 'date-fns'
import type { GitLabRepoInfo } from '~/shared/types/pipelines'
import { parseGitLabUrl } from '~/utils/gitlab-url-parser'

const logger = createLogger('Index')

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

const searchQuery = ref('')
const loading = ref(true)
const error = ref<string | null>(null)
const repositories = ref<any[]>([])

// Fetch repository data
async function fetchRepositories() {
  loading.value = true
  error.value = null

  try {
    const response = await fetch(`/api/pipelines/global-timeline?days=${selectedDays.value}&limit=2000`)

    if (!response.ok) {
      throw new Error('Failed to fetch repository data')
    }

    const result = await response.json()

    if (!result.success) {
      throw new Error(result.message || 'Failed to fetch repository data')
    }

    logger.info('Total pipeline runs fetched:', result.data.length)

    // Group by repository
    const repoMap = new Map<string, any>()

    result.data.forEach((run: any) => {
      const repoInfo = parseGitLabUrl(run.job_url)
      if (!repoInfo) return

      const key = repoInfo.fullPath

      if (!repoMap.has(key)) {
        repoMap.set(key, {
          ...repoInfo,
          totalRuns: 0,
          successfulRuns: 0,
          failedRuns: 0,
          lastRun: run.timestamp_start,
          accounts: new Set<string>(),
          totalDuration: 0
        })
      }

      const repo = repoMap.get(key)!
      repo.totalRuns++

      if (run.status === 'success') {
        repo.successfulRuns++
      } else if (run.status === 'failure' || run.status === 'partial_failure') {
        repo.failedRuns++
      }

      if (run.timestamp_start > repo.lastRun) {
        repo.lastRun = run.timestamp_start
      }

      repo.totalDuration += run.duration_total_seconds || 0

      // Track accounts
      if (run.accounts_processed) {
        if (Array.isArray(run.accounts_processed)) {
          run.accounts_processed.forEach((acc: string) => repo.accounts.add(acc))
        } else if (typeof run.accounts_processed === 'string') {
          run.accounts_processed.split(',').forEach((acc: string) => repo.accounts.add(acc.trim()))
        }
      }
    })

    // Convert to array and calculate metrics
    repositories.value = Array.from(repoMap.values()).map(repo => ({
      ...repo,
      accounts: Array.from(repo.accounts),
      successRate: repo.totalRuns > 0
        ? Math.round((repo.successfulRuns / repo.totalRuns) * 100)
        : 0,
      avgDuration: repo.totalRuns > 0
        ? Math.round(repo.totalDuration / repo.totalRuns)
        : 0
    })).sort((a, b) => b.totalRuns - a.totalRuns)

  } catch (err: any) {
    logger.error('Error fetching repository data:', err)
    error.value = err.message || 'An unexpected error occurred'
  } finally {
    loading.value = false
  }
}

// Computed properties
const filteredRepositories = computed(() => {
  if (!searchQuery.value) return repositories.value

  const query = searchQuery.value.toLowerCase()
  return repositories.value.filter(repo =>
    repo.fullPath.toLowerCase().includes(query) ||
    repo.project.toLowerCase().includes(query) ||
    repo.group.toLowerCase().includes(query)
  )
})

const totalRuns = computed(() =>
  repositories.value.reduce((sum, repo) => sum + repo.totalRuns, 0)
)

const avgSuccessRate = computed(() => {
  if (repositories.value.length === 0) return 0
  const sum = repositories.value.reduce((acc, repo) => acc + repo.successRate, 0)
  return Math.round(sum / repositories.value.length)
})

const uniqueAccountsCount = computed(() => {
  const allAccounts = new Set<string>()
  repositories.value.forEach(repo => {
    repo.accounts.forEach((acc: string) => allAccounts.add(acc))
  })
  return allAccounts.size
})

// Watch for time range changes
watch(selectedDays, () => {
  fetchRepositories()
})

// Initial load
onMounted(() => {
  fetchRepositories()
})

// Navigation - use project name for cleaner URLs
function navigateToRepository(repo: any) {
  navigateTo(`/admin/pipelines/${repo.project}`)
}

// Formatting helpers
function formatNumber(num: number): string {
  return num.toLocaleString()
}

function formatPercentage(num: number): string {
  return `${num}%`
}

// Use date formatter composable for timezone-aware formatting
const { formatDurationShort, formatRelativeTime: formatRelativeTimeWithTz } = useDateFormatter()

function formatDuration(seconds: number): string {
  return formatDurationShort(seconds)
}

function formatRelativeTime(timestamp: string): string {
  return formatRelativeTimeWithTz(timestamp)
}

function getSuccessRateColor(rate: number): 'green' | 'yellow' | 'orange' | 'red' {
  if (rate >= 90) return 'green'
  if (rate >= 70) return 'yellow'
  if (rate >= 50) return 'orange'
  return 'red'
}
</script>
