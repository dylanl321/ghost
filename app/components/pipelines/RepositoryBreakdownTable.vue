<template>
  <UCard>
    <template #header>
      <div class="flex justify-between items-center">
        <h3 class="font-semibold">Repository Breakdown</h3>
        <UInput
          v-model="searchQuery"
          icon="i-heroicons-magnifying-glass"
          placeholder="Search repositories..."
          class="w-64"
        />
      </div>
    </template>

    <CenteredLoadingSpinner v-if="loading" />
    <div v-else-if="!timelineData || timelineData.length === 0" class="text-center py-8 text-gray-400">
      No repository data available
    </div>
    <div v-else>
      <UAccordion
        :items="accordionItems"
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

            <div class="flex items-center gap-3 w-full">
              <UIcon name="i-heroicons-folder" class="text-purple-400 flex-shrink-0 w-5 h-5" />
              <div class="min-w-0 flex-1 text-left">
                <div class="font-medium text-white truncate">{{ item.repository }}</div>
                <div class="text-xs text-gray-400 truncate">{{ item.fullPath }}</div>
              </div>
              <div class="flex items-center gap-4 flex-shrink-0 ml-auto">
                <div class="text-right">
                  <div class="text-sm font-semibold">
                    <span class="text-green-400">{{ item.successfulRuns }}</span> /
                    <span class="text-red-400">{{ item.failedRuns }}</span>
                  </div>
                  <div class="text-xs text-gray-400">{{ item.pipelineSuccessRate }}% pipeline success</div>
                </div>
                <div class="w-24">
                  <div class="h-2 bg-gray-700 rounded-full overflow-hidden flex">
                    <div
                      class="h-full bg-green-500"
                      :style="{ width: `${item.pipelineSuccessRate}%` }"
                    ></div>
                    <div
                      class="h-full bg-red-500"
                      :style="{ width: `${item.totalRuns > 0 ? (item.failedRuns / item.totalRuns) * 100 : 0}%` }"
                    ></div>
                  </div>
                </div>
              </div>
            </div>
          </UButton>
        </template>

        <template #item="{ item }">
          <div class="space-y-3 p-4 bg-gray-800/50 rounded-lg">
            <!-- Quick Stats -->
            <div class="grid grid-cols-4 gap-4 pb-3 border-b border-gray-700">
              <div>
                <div class="text-xs text-gray-400">Successful Runs</div>
                <div class="text-lg font-semibold text-green-400">{{ item.successfulRuns }}</div>
              </div>
              <div>
                <div class="text-xs text-gray-400">Failed Runs</div>
                <div class="text-lg font-semibold text-red-400">{{ item.failedRuns }}</div>
              </div>
              <div>
                <div class="text-xs text-gray-400">Unique Accounts</div>
                <div class="text-lg font-semibold text-white">{{ item.totalAccounts }}</div>
              </div>
              <div>
                <div class="text-xs text-gray-400">Pipeline Success Rate</div>
                <div class="text-lg font-semibold text-gray-300">{{ item.pipelineSuccessRate }}%</div>
              </div>
            </div>

            <!-- Actions -->
            <div class="flex gap-2">
              <UButton
                :to="`/admin/pipelines/${item.repository}`"
                color="primary"
                size="sm"
                icon="i-heroicons-chart-bar"
              >
                View Repository Details
              </UButton>
              <UButton
                v-if="item.projectUrl"
                :to="item.projectUrl"
                target="_blank"
                color="gray"
                size="sm"
                icon="i-heroicons-arrow-top-right-on-square"
              >
                Open in GitLab
              </UButton>
            </div>
          </div>
        </template>
      </UAccordion>

      <!-- Pagination -->
      <div v-if="filteredRepositories.length > repoPageSize" class="mt-4 flex justify-between items-center">
        <div class="text-sm text-gray-400">
          Showing {{ (repoPage - 1) * repoPageSize + 1 }}-{{ Math.min(repoPage * repoPageSize, filteredRepositories.length) }} of {{ filteredRepositories.length }} repositories
        </div>
        <UPagination
          v-model="repoPage"
          :page-count="repoPageSize"
          :total="filteredRepositories.length"
        />
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import { formatDistanceToNow } from 'date-fns'
import type { GitLabRepoInfo } from '~/shared/types/pipelines'
import { getProjectUrl } from '~/utils/gitlab-url-parser'

interface TimelineItem {
  repository?: GitLabRepoInfo | null
  status: string
  timestamp_start: string
  accounts_processed: string[]
}

const props = defineProps<{
  timelineData: TimelineItem[]
  loading: boolean
}>()

const searchQuery = ref('')

// Aggregate timeline data by repository with account-level success/failure tracking
const repositories = computed(() => {
  if (!props.timelineData?.length) return []

  // Group by repository project name (for cleaner URLs)
  const repoMap = new Map<string, {
    repository: string // Project name for URLs
    fullPath: string // Full repository path for display
    projectUrl: string | null
    totalRuns: number
    lastRun: string
    accounts: Set<string>
  }>()

  props.timelineData.forEach(run => {
    const projectName = run.repository?.project || 'unknown'
    const repoFullPath = run.repository?.fullPath || 'unknown'
    const projectUrl = run.repository ? getProjectUrl(run.repository) : null

    if (!repoMap.has(projectName)) {
      repoMap.set(projectName, {
        repository: projectName, // Use project name for URLs
        fullPath: repoFullPath, // Keep full path for display
        projectUrl,
        totalRuns: 0,
        lastRun: run.timestamp_start,
        accounts: new Set()
      })
    }

    const repo = repoMap.get(projectName)!
    repo.totalRuns++

    // Track latest run
    if (run.timestamp_start > repo.lastRun) {
      repo.lastRun = run.timestamp_start
    }

    // Track accounts (handle both array and string formats from Athena)
    if (run.accounts_processed) {
      const accountIds = Array.isArray(run.accounts_processed)
        ? run.accounts_processed
        : run.accounts_processed.split(',').map(id => id.trim())

      accountIds.forEach(accountId => {
        repo.accounts.add(accountId)
      })
    }
  })

  // Compute pipeline-level success rates from actual timeline data per repository
  return Array.from(repoMap.values()).map(repo => {
    const totalAccounts = repo.accounts.size

    // Count pipeline runs by status for this repo
    const repoRuns = props.timelineData.filter(run =>
      (run.repository?.project || 'unknown') === repo.repository
    )
    const successfulRuns = repoRuns.filter(r => r.status === 'success').length
    const failedRuns = repoRuns.filter(r => r.status === 'failure' || r.status === 'partial_failure').length
    const pipelineSuccessRate = repo.totalRuns > 0
      ? Math.round((successfulRuns / repo.totalRuns) * 100)
      : 0

    return {
      ...repo,
      totalAccounts,
      successfulRuns,
      failedRuns,
      pipelineSuccessRate
    }
  }).sort((a, b) => b.totalRuns - a.totalRuns) // Sort by total runs descending
})

// Filter repositories based on search query (no longer hard-limited to 20)
const filteredRepositories = computed(() => {
  if (!searchQuery.value) {
    return repositories.value
  }

  const query = searchQuery.value.toLowerCase()
  return repositories.value
    .filter(repo => repo.repository.toLowerCase().includes(query))
})

// Pagination
const repoPage = ref(1)
const repoPageSize = 20

const paginatedRepositories = computed(() => {
  const start = (repoPage.value - 1) * repoPageSize
  return filteredRepositories.value.slice(start, start + repoPageSize)
})

// Reset page when search changes
watch(searchQuery, () => {
  repoPage.value = 1
})

// Create accordion items from paginated repositories
const accordionItems = computed(() => {
  return paginatedRepositories.value.map(repo => ({
    label: repo.repository,
    repository: repo.repository, // Project name for URLs
    fullPath: repo.fullPath, // Full path for display
    totalRuns: repo.totalRuns,
    totalAccounts: repo.totalAccounts,
    successfulRuns: repo.successfulRuns,
    failedRuns: repo.failedRuns,
    pipelineSuccessRate: repo.pipelineSuccessRate,
    lastRun: repo.lastRun,
    projectUrl: repo.projectUrl,
    slot: 'item',
    defaultOpen: false
  }))
})

// Format date helper
function formatDate(dateStr: string): string {
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true })
  } catch {
    return 'Unknown'
  }
}
</script>
