<template>
  <!-- Show indicator if there are active jobs OR recent completions -->
  <UPopover v-if="activeJobCount > 0 || recentCompletions.length > 0" :popper="{ placement: 'top-end' }">
    <button
      class="flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors cursor-pointer group"
      :class="activeJobCount > 0 
        ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-900/50' 
        : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/50'"
    >
      <UIcon 
        :name="activeJobCount > 0 ? 'i-heroicons-arrow-path' : 'i-heroicons-check-circle'" 
        class="w-3.5 h-3.5"
        :class="{ 'animate-spin': activeJobCount > 0 }"
      />
      <span class="font-medium text-xs">
        <template v-if="activeJobCount > 0">
          {{ activeJobCount }} {{ activeJobCount === 1 ? 'query' : 'queries' }} running
        </template>
        <template v-else>
          {{ recentCompletions.length }} recent
        </template>
      </span>
      <UIcon name="i-heroicons-chevron-up" class="w-3 h-3 opacity-50 group-hover:opacity-100 transition-opacity" />
    </button>

    <template #panel>
      <div class="p-4 w-96 max-h-[500px] overflow-y-auto">
        <!-- Active Queries Section -->
        <div v-if="activeJobCount > 0" class="mb-4">
          <div class="flex items-center justify-between mb-3">
            <h4 class="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <UIcon name="i-heroicons-cpu-chip" class="w-4 h-4 text-purple-500" />
              Active Queries
            </h4>
            <UBadge color="purple" size="xs">{{ activeJobCount }}</UBadge>
          </div>

          <div class="space-y-3">
            <div
              v-for="job in activeJobsList"
              :key="job.jobId"
              class="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800"
            >
              <!-- Query Text -->
              <p class="text-sm text-gray-900 dark:text-white font-medium mb-2 line-clamp-2">
                "{{ job.userMessage }}"
              </p>

              <!-- Progress -->
              <div class="flex items-center gap-2 mb-2">
                <UIcon name="i-heroicons-arrow-path" class="w-3.5 h-3.5 animate-spin text-purple-500" />
                <span class="text-xs text-gray-600 dark:text-gray-400 flex-1">
                  {{ job.progress || 'Processing...' }}
                </span>
                <span v-if="job.progressPercent" class="text-xs font-medium text-purple-600 dark:text-purple-400">
                  {{ job.progressPercent }}%
                </span>
              </div>

              <!-- Progress Bar -->
              <div class="w-full h-1.5 bg-purple-200 dark:bg-purple-800 rounded-full overflow-hidden mb-2">
                <div
                  class="h-full bg-gradient-to-r from-purple-500 to-purple-600 transition-all duration-300"
                  :style="{ width: `${job.progressPercent || 5}%` }"
                />
              </div>

              <!-- Tools Being Used -->
              <div v-if="job.toolsCalled && job.toolsCalled.length > 0" class="flex flex-wrap gap-1 mb-2">
                <span
                  v-for="tool in job.toolsCalled"
                  :key="tool"
                  class="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                >
                  <UIcon name="i-heroicons-wrench-screwdriver" class="w-2.5 h-2.5" />
                  {{ tool }}
                </span>
              </div>

              <!-- Time elapsed -->
              <div class="flex items-center justify-between pt-2 border-t border-purple-200 dark:border-purple-700">
                <span class="text-[10px] text-gray-500 dark:text-gray-400">
                  Started {{ formatTimeAgo(job.timestamp) }}
                </span>
                <NuxtLink
                  to="/chat"
                  class="text-[10px] text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1"
                >
                  View in Chat
                  <UIcon name="i-heroicons-arrow-right" class="w-2.5 h-2.5" />
                </NuxtLink>
              </div>
            </div>
          </div>
        </div>

        <!-- Divider between sections -->
        <div v-if="activeJobCount > 0 && recentCompletions.length > 0" class="border-t border-gray-200 dark:border-gray-700 my-3" />

        <!-- Recent Completions Section -->
        <div v-if="recentCompletions.length > 0">
          <div class="flex items-center justify-between mb-3">
            <h4 class="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <UIcon name="i-heroicons-clock" class="w-4 h-4 text-gray-500" />
              Recent Queries
            </h4>
            <button 
              @click="clearHistory"
              class="text-[10px] text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              Clear
            </button>
          </div>

          <div class="space-y-2">
            <div
              v-for="(item, idx) in recentCompletions"
              :key="idx"
              class="p-2.5 rounded-lg border"
              :class="item.success 
                ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800' 
                : 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800'"
            >
              <div class="flex items-start gap-2">
                <UIcon 
                  :name="item.success ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'" 
                  class="w-4 h-4 flex-shrink-0 mt-0.5"
                  :class="item.success ? 'text-green-500' : 'text-red-500'"
                />
                <div class="flex-1 min-w-0">
                  <p class="text-xs text-gray-900 dark:text-white font-medium line-clamp-1">
                    "{{ item.job.userMessage }}"
                  </p>
                  <p v-if="item.response" class="text-[10px] text-gray-500 dark:text-gray-400 line-clamp-1 mt-0.5">
                    {{ item.response }}
                  </p>
                  <div class="flex items-center justify-between mt-1">
                    <span class="text-[10px] text-gray-400 dark:text-gray-500">
                      {{ formatTimeAgo(item.completedAt) }}
                    </span>
                    <NuxtLink
                      to="/chat"
                      class="text-[10px] text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      View
                    </NuxtLink>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Empty State -->
        <div v-if="activeJobCount === 0 && recentCompletions.length === 0" class="text-center py-4">
          <UIcon name="i-heroicons-inbox" class="w-8 h-8 text-gray-400 mx-auto mb-2" />
          <p class="text-sm text-gray-500 dark:text-gray-400">No queries</p>
        </div>

        <!-- Footer -->
        <div class="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
          <p class="text-[10px] text-gray-500 dark:text-gray-400 text-center">
            Queries continue running in the background even if you navigate away
          </p>
        </div>
      </div>
    </template>
  </UPopover>
</template>

<script setup lang="ts">
import { useBackgroundPolling, type PendingJob } from '~/composables/useBackgroundPolling'

const backgroundPolling = useBackgroundPolling()

const activeJobCount = computed(() => backgroundPolling.activeJobCount.value)

const activeJobsList = computed(() => {
  return Array.from(backgroundPolling.activeJobs.value.values())
    .filter(job => job.status === 'polling')
    .sort((a, b) => b.timestamp - a.timestamp)
})

const recentCompletions = computed(() => {
  return backgroundPolling.recentCompletions.value
})

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  
  if (seconds < 60) return 'just now'
  if (seconds < 120) return '1 min ago'
  if (seconds < 3600) return `${Math.floor(seconds / 60)} mins ago`
  if (seconds < 7200) return '1 hour ago'
  return `${Math.floor(seconds / 3600)} hours ago`
}

function clearHistory() {
  backgroundPolling.clearRecentCompletions()
}
</script>

<style scoped>
.line-clamp-1 {
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
