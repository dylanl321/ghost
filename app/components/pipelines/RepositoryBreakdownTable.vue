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

            <div class="flex items-center justify-between w-full">
              <div class="flex items-center gap-3 min-w-0 flex-1">
                <UIcon name="i-heroicons-folder" class="text-purple-400 flex-shrink-0 w-5 h-5" />
                <div class="min-w-0 flex-1">
                  <div class="font-medium text-white truncate">{{ item.repository }}</div>
                  <div class="text-xs text-gray-400">{{ item.accounts.length }} accounts</div>
                </div>
              </div>
              <div class="flex items-center gap-4 flex-shrink-0">
                <div class="text-right">
                  <div class="text-sm font-semibold text-white">{{ item.totalRuns }} runs</div>
                  <div class="text-xs text-gray-400">{{ item.successRate }}% success</div>
                </div>
                <div class="w-24">
                  <div class="h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      class="h-full bg-green-500"
                      :style="{ width: `${item.successRate}%` }"
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
                <div class="text-xs text-gray-400">Success Rate</div>
                <div class="text-lg font-semibold text-green-400">{{ item.successRate }}%</div>
              </div>
              <div>
                <div class="text-xs text-gray-400">Total Runs</div>
                <div class="text-lg font-semibold text-white">{{ item.totalRuns }}</div>
              </div>
              <div>
                <div class="text-xs text-gray-400">Accounts</div>
                <div class="text-lg font-semibold text-white">{{ item.accounts.length }}</div>
              </div>
              <div>
                <div class="text-xs text-gray-400">Last Run</div>
                <div class="text-sm font-semibold text-gray-300">{{ formatDate(item.lastRun) }}</div>
              </div>
            </div>

            <!-- Actions -->
            <div class="flex gap-2">
              <UButton
                :to="`/admin/pipelines/${encodeURIComponent(item.repository)}`"
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

// Create accordion items from repositories
const accordionItems = computed(() => {
  return filteredRepositories.value.map(repo => ({
    label: repo.repository,
    repository: repo.repository,
    totalRuns: repo.totalRuns,
    successRate: repo.successRate,
    lastRun: repo.lastRun,
    accounts: repo.accounts,
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
