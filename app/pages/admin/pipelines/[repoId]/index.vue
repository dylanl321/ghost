<template>
  <div class="container mx-auto max-w-7xl space-y-6 px-6 py-8">
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
        <div class="flex gap-2 items-center">
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
              <p class="text-sm text-gray-400">Pipeline Success Rate</p>
              <p class="text-2xl font-bold mt-1">{{ formatPercentage(repositoryData.successRate) }}</p>
              <p class="text-xs text-gray-500 mt-1">
                {{ repositoryData.successfulRuns }} / {{ repositoryData.totalRuns }} runs
              </p>
            </div>
            <UIcon name="i-heroicons-check-circle" class="w-8 h-8 text-green-500" />
          </div>
        </UCard>

        <UCard>
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-400">Total Accounts</p>
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

      <!-- Account-Level Breakdown -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <UCard>
          <div class="flex items-center justify-between">
            <div class="flex-1">
              <p class="text-sm text-gray-400">Successful Accounts</p>
              <p class="text-2xl font-bold mt-1 text-green-400">
                {{ repositoryData.accountStats?.successful || 0 }}
              </p>
              <p class="text-xs text-gray-500 mt-1">Plans applied successfully</p>
            </div>
            <UIcon name="i-heroicons-check-badge" class="w-8 h-8 text-green-500" />
          </div>
        </UCard>

        <UCard>
          <div class="flex items-center justify-between">
            <div class="flex-1">
              <p class="text-sm text-gray-400">Failed Accounts</p>
              <p class="text-2xl font-bold mt-1 text-red-400">
                {{ repositoryData.accountStats?.failed || 0 }}
              </p>
              <p class="text-xs text-gray-500 mt-1">Plans failed to apply</p>
            </div>
            <UIcon name="i-heroicons-x-circle" class="w-8 h-8 text-red-500" />
          </div>
        </UCard>

        <UCard>
          <div class="flex items-center justify-between">
            <div class="flex-1">
              <p class="text-sm text-gray-400">Total Unique Accounts</p>
              <p class="text-2xl font-bold mt-1">
                {{ repositoryData.accountStats?.total || 0 }}
              </p>
              <p class="text-xs text-gray-500 mt-1">
                Accounts processed by this repository
              </p>
            </div>
            <UIcon name="i-heroicons-building-office-2" class="w-8 h-8 text-blue-500" />
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
              :to="`/admin/pipelines/${projectName}/${row.pipeline_id}`"
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
            <UTooltip
              v-if="row.account_count === 0"
              text="This pipeline run targeted all accounts"
            >
              <UBadge color="blue" variant="subtle" size="sm">
                All
              </UBadge>
            </UTooltip>
            <UBadge v-else color="gray" variant="subtle" size="sm">
              {{ row.account_count }}
            </UBadge>
          </template>

          <!-- Commit Author -->
          <template #commit_author-data="{ row }">
            <PipelinesAuthorBadge
              v-if="row.commit_author"
              :author-field="row.commit_author"
              :show-contact-icons="false"
              :max-name-length="20"
            />
            <span v-else class="text-sm text-gray-400">Unknown</span>
          </template>
        </UTable>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
import { parseGitLabUrl } from '~/utils/gitlab-url-parser'
import PipelinesAuthorSelector from '~/components/pipelines/AuthorSelector.vue'
import PipelinesAuthorBadge from '~/components/pipelines/AuthorBadge.vue'

const logger = createLogger('Index')

// Admin-only access control
definePageMeta({
  keepalive: false,
  layout: 'admin',
  middleware: 'auth-permission',
  permission: 'admin.logs'
})

const route = useRoute()
const repoId = route.params.repoId as string
const projectName = repoId // Now using project name directly as the URL parameter
const groupName = ref<string>('')
const fullRepositoryPath = ref<string>('')
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

// Author filter
const selectedAuthor = ref<string | null>(null)

const loading = ref(true)
const error = ref<string | null>(null)
const repositoryData = ref<any>({})
const allPipelineRuns = ref<any[]>([])

// Filter pipeline runs by author
const pipelineRuns = computed(() => {
  if (!selectedAuthor.value) {
    return allPipelineRuns.value
  }

  return allPipelineRuns.value.filter((run: any) => {
    if (!run.commit_author) return false
    return run.commit_author.toLowerCase().includes(selectedAuthor.value!.toLowerCase())
  })
})

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

    // Filter runs for this repository by project name
    const filteredRuns = result.data.filter((run: any) => {
      const repoInfo = parseGitLabUrl(run.job_url)
      return repoInfo?.project === projectName
    })

    logger.info('Repository runs found:', filteredRuns.length, 'for project:', projectName)

    // Extract group name and full path from first matching run
    if (filteredRuns.length > 0) {
      const firstRepoInfo = parseGitLabUrl(filteredRuns[0].job_url)
      if (firstRepoInfo) {
        groupName.value = firstRepoInfo.group
        fullRepositoryPath.value = firstRepoInfo.fullPath
      }
    }

    allPipelineRuns.value = filteredRuns

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

    // Calculate account-level stats based on actual account processing
    // Count how many times each account was processed successfully vs failed
    const accountSuccessCounts = new Map<string, { success: number, failure: number }>()

    filteredRuns.forEach((run: any) => {
      if (run.accounts_processed && Array.isArray(run.accounts_processed)) {
        run.accounts_processed.forEach((acc: string) => {
          if (!accountSuccessCounts.has(acc)) {
            accountSuccessCounts.set(acc, { success: 0, failure: 0 })
          }
          const counts = accountSuccessCounts.get(acc)!
          if (run.status === 'success') {
            counts.success++
          } else if (run.status === 'failure' || run.status === 'partial_failure') {
            counts.failure++
          }
        })
      }
    })

    // Determine account status: if they have more successes than failures, count as successful
    let successfulAccounts = 0
    let failedAccounts = 0
    accountSuccessCounts.forEach((counts) => {
      if (counts.success > counts.failure) {
        successfulAccounts++
      } else if (counts.failure > 0) {
        failedAccounts++
      }
    })

    const totalAccounts = accountsSet.size

    repositoryData.value = {
      totalRuns,
      successfulRuns,
      failedRuns,
      successRate: totalRuns > 0 ? Math.round((successfulRuns / totalRuns) * 100) : 0,
      avgDuration: totalRuns > 0 ? Math.round(totalDuration / totalRuns) : 0,
      accounts: Array.from(accountsSet),
      accountStats: {
        successful: successfulAccounts,
        failed: failedAccounts,
        total: totalAccounts,
        successRate: totalAccounts > 0 ? Math.round((successfulAccounts / totalAccounts) * 100) : 0
      }
    }

  } catch (err: any) {
    logger.error('Error fetching repository data:', err)
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

// Use date formatter composable for timezone-aware formatting
const { formatDateOnly, formatTimeOnly, formatDurationShort } = useDateFormatter()

function formatDuration(seconds: number): string {
  return formatDurationShort(seconds)
}

function formatDate(timestamp: string): string {
  return formatDateOnly(timestamp)
}

function formatTime(timestamp: string): string {
  return formatTimeOnly(timestamp)
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
