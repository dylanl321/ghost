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
      <UTable
        :rows="filteredRepositories"
        :columns="columns"
        :loading="loading"
        class="w-full"
      >
        <!-- Repository Column -->
        <template #repository-data="{ row }">
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-folder" class="text-gray-400 flex-shrink-0" />
            <div class="min-w-0">
              <div class="font-medium text-sm truncate">{{ row.repository }}</div>
              <div class="text-xs text-gray-400 truncate">{{ row.accounts.length }} account(s)</div>
            </div>
          </div>
        </template>

        <!-- Total Runs Column -->
        <template #totalRuns-data="{ row }">
          <span class="font-semibold">{{ row.totalRuns }}</span>
        </template>

        <!-- Success Rate Column -->
        <template #successRate-data="{ row }">
          <div class="flex items-center gap-2">
            <div class="flex-1">
              <div class="h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  class="h-full bg-green-500"
                  :style="{ width: `${row.successRate}%` }"
                ></div>
              </div>
            </div>
            <span class="text-sm font-semibold w-12 text-right">{{ row.successRate }}%</span>
          </div>
        </template>

        <!-- Last Run Column -->
        <template #lastRun-data="{ row }">
          <span class="text-sm text-gray-400">{{ formatDate(row.lastRun) }}</span>
        </template>

        <!-- Actions Column -->
        <template #actions-data="{ row }">
          <UButton
            v-if="row.projectUrl"
            icon="i-heroicons-arrow-top-right-on-square"
            size="xs"
            color="gray"
            variant="ghost"
            :to="row.projectUrl"
            target="_blank"
            title="View in GitLab"
          />
        </template>
      </UTable>

      <!-- Pagination (if needed) -->
      <div v-if="filteredRepositories.length > 20" class="mt-4 flex justify-center">
        <p class="text-sm text-gray-400">Showing top 20 repositories</p>
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

// Table columns
const columns = [
  { key: 'repository', label: 'Repository', sortable: true },
  { key: 'totalRuns', label: 'Total Runs', sortable: true },
  { key: 'successRate', label: 'Success Rate', sortable: true },
  { key: 'lastRun', label: 'Last Run', sortable: true },
  { key: 'actions', label: '' }
]

// Aggregate timeline data by repository
const repositories = computed(() => {
  if (!props.timelineData?.length) return []

  // Group by repository path
  const repoMap = new Map<string, {
    repository: string
    projectUrl: string | null
    totalRuns: number
    successfulRuns: number
    failedRuns: number
    lastRun: string
    accounts: Set<string>
  }>()

  props.timelineData.forEach(run => {
    const repoPath = run.repository?.fullPath || 'unknown'
    const projectUrl = run.repository ? getProjectUrl(run.repository) : null

    if (!repoMap.has(repoPath)) {
      repoMap.set(repoPath, {
        repository: repoPath,
        projectUrl,
        totalRuns: 0,
        successfulRuns: 0,
        failedRuns: 0,
        lastRun: run.timestamp_start,
        accounts: new Set()
      })
    }

    const repo = repoMap.get(repoPath)!
    repo.totalRuns++

    if (run.status === 'success') {
      repo.successfulRuns++
    } else if (run.status === 'failure' || run.status === 'partial_failure') {
      repo.failedRuns++
    }

    // Track latest run
    if (run.timestamp_start > repo.lastRun) {
      repo.lastRun = run.timestamp_start
    }

    // Track accounts (handle both array and string formats from Athena)
    if (run.accounts_processed) {
      if (Array.isArray(run.accounts_processed)) {
        run.accounts_processed.forEach(accountId => {
          repo.accounts.add(accountId)
        })
      } else if (typeof run.accounts_processed === 'string') {
        // Handle comma-separated string
        run.accounts_processed.split(',').forEach(accountId => {
          repo.accounts.add(accountId.trim())
        })
      }
    }
  })

  // Convert to array and calculate success rate
  return Array.from(repoMap.values()).map(repo => ({
    ...repo,
    accounts: Array.from(repo.accounts),
    successRate: repo.totalRuns > 0
      ? Math.round((repo.successfulRuns / repo.totalRuns) * 100)
      : 0
  })).sort((a, b) => b.totalRuns - a.totalRuns) // Sort by total runs descending
})

// Filter repositories based on search query
const filteredRepositories = computed(() => {
  if (!searchQuery.value) {
    return repositories.value.slice(0, 20) // Limit to top 20
  }

  const query = searchQuery.value.toLowerCase()
  return repositories.value
    .filter(repo => repo.repository.toLowerCase().includes(query))
    .slice(0, 20)
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
