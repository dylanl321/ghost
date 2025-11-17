<template>
  <div class="space-y-6 p-6">
    <!-- Breadcrumbs -->
    <div class="flex items-center gap-2 text-sm text-gray-400">
      <NuxtLink to="/admin/pipelines" class="hover:text-white">Pipelines</NuxtLink>
      <UIcon name="i-heroicons-chevron-right" class="w-4 h-4" />
      <NuxtLink to="/admin/pipelines/repositories" class="hover:text-white">Repositories</NuxtLink>
      <UIcon name="i-heroicons-chevron-right" class="w-4 h-4" />
      <span class="text-white">{{ repositoryPath }}</span>
    </div>

    <!-- Repository Header -->
    <UCard>
      <div class="flex gap-4 items-start justify-between">
        <div class="flex items-start gap-4">
          <UIcon name="i-heroicons-folder" class="w-12 h-12 text-purple-500 flex-shrink-0" />
          <div>
            <h1 class="font-semibold text-2xl mb-1">{{ projectName }}</h1>
            <p class="text-sm text-gray-400 mb-3">{{ groupName }}</p>
            <a
              v-if="projectUrl"
              :href="projectUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1"
            >
              <UIcon name="i-heroicons-arrow-top-right-on-square" class="w-4 h-4" />
              View in GitLab
            </a>
          </div>
        </div>
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
    </UCard>

    <!-- Loading Alert -->
    <UAlert
      v-if="loading"
      color="blue"
      icon="i-heroicons-clock"
      variant="soft"
    >
      <template #title>Loading Repository Data</template>
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

    <!-- Dashboard Content -->
    <div v-if="!loading && !error" class="space-y-4">
      <!-- Summary Stats -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <UCard>
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-400">Total Runs</p>
              <p class="text-2xl font-bold mt-1">{{ repositoryData.totalRuns }}</p>
            </div>
            <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 text-blue-500" />
          </div>
        </UCard>

        <UCard>
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-400">Success Rate</p>
              <p class="text-2xl font-bold mt-1">{{ formatPercentage(repositoryData.successRate) }}</p>
            </div>
            <UIcon name="i-heroicons-check-circle" class="w-8 h-8 text-green-500" />
          </div>
        </UCard>

        <UCard>
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-400">Accounts</p>
              <p class="text-2xl font-bold mt-1">{{ repositoryData.accounts?.length || 0 }}</p>
            </div>
            <UIcon name="i-heroicons-building-office" class="w-8 h-8 text-purple-500" />
          </div>
        </UCard>

        <UCard>
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-400">Avg Duration</p>
              <p class="text-2xl font-bold mt-1">{{ formatDuration(repositoryData.avgDuration) }}</p>
            </div>
            <UIcon name="i-heroicons-clock" class="w-8 h-8 text-orange-500" />
          </div>
        </UCard>
      </div>

      <!-- Pipeline Runs Timeline -->
      <UCard>
        <template #header>
          <div class="flex justify-between items-center">
            <h3 class="font-semibold text-lg">Recent Pipeline Runs</h3>
            <UBadge color="gray" variant="soft">
              {{ pipelineRuns.length }} runs
            </UBadge>
          </div>
        </template>

        <div v-if="pipelineRuns.length === 0" class="text-center py-8 text-gray-400">
          No pipeline runs found for this repository
        </div>
        <UTable v-else :rows="pipelineRuns" :columns="columns">
          <!-- Status -->
          <template #status-data="{ row }">
            <UBadge :color="getStatusColor(row.status)" variant="soft" size="sm">
              {{ formatStatus(row.status) }}
            </UBadge>
          </template>

          <!-- Pipeline ID -->
          <template #pipeline_id-data="{ row }">
            <NuxtLink
              :to="`/admin/pipelines/${encodedRepoId}/${row.pipeline_id}`"
              class="text-blue-400 hover:text-blue-300 font-mono text-xs"
            >
              #{{ row.pipeline_id }}
            </NuxtLink>
          </template>

          <!-- Job Name -->
          <template #job_name-data="{ row }">
            <div class="flex items-center gap-2">
              <span>{{ row.job_name }}</span>
              <a
                v-if="row.job_url"
                :href="row.job_url"
                target="_blank"
                rel="noopener noreferrer"
                class="text-blue-400 hover:text-blue-300"
              >
                <UIcon name="i-heroicons-arrow-top-right-on-square" class="w-4 h-4" />
              </a>
            </div>
          </template>

          <!-- Duration -->
          <template #duration_total_seconds-data="{ row }">
            {{ formatDuration(row.duration_total_seconds) }}
          </template>

          <!-- Timestamp -->
          <template #timestamp_start-data="{ row }">
            <div class="text-sm">
              <div>{{ formatDate(row.timestamp_start) }}</div>
              <div class="text-gray-400 text-xs">{{ formatTime(row.timestamp_start) }}</div>
            </div>
          </template>

          <!-- Account Count -->
          <template #account_count-data="{ row }">
            <UBadge color="gray" variant="subtle" size="sm">
              {{ row.account_count }}
            </UBadge>
          </template>

          <!-- Commit Author -->
          <template #commit_author-data="{ row }">
            <span class="text-sm text-gray-300">{{ row.commit_author || 'N/A' }}</span>
          </template>
        </UTable>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
import { parseGitLabUrl } from '~/utils/gitlab-url-parser'

// Admin-only access control
definePageMeta({
  middleware: 'auth-permission',
  permission: 'admin.logs'
})

const route = useRoute()
const repoId = route.params.repoId as string
const encodedRepoId = computed(() => encodeURIComponent(repoId))
const repositoryPath = decodeURIComponent(repoId)

// Parse repository info
const parts = repositoryPath.split('/')
const projectName = parts[parts.length - 1]
const groupName = parts.slice(0, -1).join('/')
const projectUrl = ref<string | null>(null)

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

const loading = ref(true)
const error = ref<string | null>(null)
const repositoryData = ref<any>({})
const pipelineRuns = ref<any[]>([])

// Table columns
const columns = [
  { key: 'status', label: 'Status', sortable: true },
  { key: 'pipeline_id', label: 'Pipeline', sortable: false },
  { key: 'job_name', label: 'Job', sortable: false },
  { key: 'timestamp_start', label: 'Started', sortable: true },
  { key: 'duration_total_seconds', label: 'Duration', sortable: true },
  { key: 'account_count', label: 'Accounts', sortable: true },
  { key: 'commit_author', label: 'Author', sortable: false }
]

// Fetch repository data
async function fetchRepositoryData() {
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

    // Filter runs for this repository
    const filteredRuns = result.data.filter((run: any) => {
      const repoInfo = parseGitLabUrl(run.job_url)
      return repoInfo?.fullPath === repositoryPath
    })

    console.log('Repository runs found:', filteredRuns.length, 'for path:', repositoryPath)

    pipelineRuns.value = filteredRuns

    // Calculate repository metrics
    let totalRuns = filteredRuns.length
    let successfulRuns = 0
    let failedRuns = 0
    let totalDuration = 0
    const accountsSet = new Set<string>()

    filteredRuns.forEach((run: any) => {
      if (run.status === 'success') successfulRuns++
      else if (run.status === 'failure' || run.status === 'partial_failure') failedRuns++

      totalDuration += run.duration_total_seconds || 0

      // Track accounts
      if (run.accounts_processed) {
        if (Array.isArray(run.accounts_processed)) {
          run.accounts_processed.forEach((acc: string) => accountsSet.add(acc))
        } else if (typeof run.accounts_processed === 'string') {
          run.accounts_processed.split(',').forEach((acc: string) => accountsSet.add(acc.trim()))
        }
      }

      // Get project URL from first run
      if (!projectUrl.value && run.job_url) {
        const repoInfo = parseGitLabUrl(run.job_url)
        if (repoInfo) {
          const url = new URL(repoInfo.url)
          projectUrl.value = `${url.origin}/${repoInfo.fullPath}`
        }
      }
    })

    repositoryData.value = {
      totalRuns,
      successfulRuns,
      failedRuns,
      successRate: totalRuns > 0 ? Math.round((successfulRuns / totalRuns) * 100) : 0,
      avgDuration: totalRuns > 0 ? Math.round(totalDuration / totalRuns) : 0,
      accounts: Array.from(accountsSet)
    }

  } catch (err: any) {
    console.error('Error fetching repository data:', err)
    error.value = err.message || 'An unexpected error occurred'
  } finally {
    loading.value = false
  }
}

// Watch for time range changes
watch(selectedDays, () => {
  fetchRepositoryData()
})

// Initial load
onMounted(() => {
  fetchRepositoryData()
})

// Formatting helpers
function formatPercentage(num: number): string {
  return `${num}%`
}

function formatDuration(seconds: number): string {
  if (!seconds) return '0m'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return `${hours}h ${remainingMinutes}m`
}

function formatDate(timestamp: string): string {
  if (!timestamp) return 'N/A'
  const date = new Date(timestamp)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

function formatTime(timestamp: string): string {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit'
  })
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'success':
      return 'green'
    case 'failure':
    case 'partial_failure':
      return 'red'
    default:
      return 'gray'
  }
}

function formatStatus(status: string): string {
  return status
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}
</script>
