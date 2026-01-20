<template>
  <div>
    <!-- Period Selector -->
    <div class="flex items-center justify-between mb-6">
      <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Performance Metrics</h2>
      <div class="flex gap-2">
        <UButton
          v-for="p in periods"
          :key="p.value"
          :color="period === p.value ? 'primary' : 'gray'"
          :variant="period === p.value ? 'solid' : 'soft'"
          size="sm"
          @click="period = p.value; loadData()"
        >
          {{ p.label }}
        </UButton>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="flex items-center justify-center h-64">
      <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-primary-500" />
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="flex items-center justify-center h-64">
      <UCard>
        <div class="text-center p-6">
          <UIcon name="i-heroicons-exclamation-triangle" class="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">Error Loading Metrics</h3>
          <p class="text-gray-600 dark:text-gray-400 mb-4">{{ error }}</p>
          <UButton color="primary" @click="loadData">
            <UIcon name="i-heroicons-arrow-path" class="mr-2" />
            Retry
          </UButton>
        </div>
      </UCard>
    </div>

    <!-- Metrics Content -->
    <div v-else>
      <!-- Overview Cards -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <!-- Total Queries -->
        <UCard>
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-600 dark:text-gray-400">Total Queries</p>
              <p class="text-2xl font-bold text-gray-900 dark:text-white">
                {{ formatNumber(streamingMetrics?.totalStreams || 0) }}
              </p>
              <p class="text-xs text-gray-500 mt-1">
                {{ agentMetrics?.totalQueries || 0 }} backend executions
              </p>
            </div>
            <div class="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-full">
              <UIcon name="i-heroicons-chat-bubble-left-right" class="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
        </UCard>

        <!-- Success Rate -->
        <UCard>
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-600 dark:text-gray-400">Success Rate</p>
              <p class="text-2xl font-bold text-gray-900 dark:text-white">
                {{ formatPercent(streamingMetrics?.completionRate || 0) }}
              </p>
              <p class="text-xs text-gray-500 mt-1">
                {{ formatPercent(agentMetrics?.successRate || 0) }} agent success
              </p>
            </div>
            <div class="p-3 bg-green-100 dark:bg-green-900/30 rounded-full">
              <UIcon name="i-heroicons-check-circle" class="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
          </div>
        </UCard>

        <!-- Avg Response Time -->
        <UCard>
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-600 dark:text-gray-400">Avg Response Time</p>
              <p class="text-2xl font-bold text-gray-900 dark:text-white">
                {{ formatDuration(agentMetrics?.avgExecutionTime || 0) }}
              </p>
              <p class="text-xs text-gray-500 mt-1">
                p95: {{ formatDuration(agentMetrics?.p95ExecutionTime || 0) }}
              </p>
            </div>
            <div class="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-full">
              <UIcon name="i-heroicons-clock" class="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
          </div>
        </UCard>

        <!-- Active Streams -->
        <UCard>
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-600 dark:text-gray-400">Active Streams</p>
              <p class="text-2xl font-bold text-gray-900 dark:text-white">
                {{ activeStreams?.count || 0 }}
              </p>
              <p class="text-xs text-gray-500 mt-1">
                {{ Math.round(streamingMetrics?.reconnectSuccessRate || 0) }}% reconnect rate
              </p>
            </div>
            <div class="p-3 bg-orange-100 dark:bg-orange-900/30 rounded-full">
              <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 text-orange-600 dark:text-orange-400" />
            </div>
          </div>
        </UCard>
      </div>

      <!-- Top Users & Tools -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <!-- Top Users -->
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Top Users</h3>
              <UBadge color="gray">{{ topUsers.length }}</UBadge>
            </div>
          </template>
          <div v-if="topUsers.length === 0" class="text-center py-8 text-gray-500 dark:text-gray-400">
            No user data available
          </div>
          <div v-else class="space-y-3">
            <div
              v-for="(user, idx) in topUsers"
              :key="user.userId"
              class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
            >
              <div class="flex items-center gap-3">
                <span class="text-sm font-semibold text-gray-500 w-6">{{ idx + 1 }}</span>
                <div>
                  <p class="text-sm font-medium text-gray-900 dark:text-white">{{ user.userId }}</p>
                  <p class="text-xs text-gray-500">
                    {{ user.streamCount }} queries
                  </p>
                </div>
              </div>
              <UBadge :color="user.errorRate > 10 ? 'red' : 'green'" variant="subtle">
                {{ formatPercent(100 - user.errorRate) }} success
              </UBadge>
            </div>
          </div>
        </UCard>

        <!-- Top Tools -->
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Most Used Tools</h3>
              <UBadge color="gray">{{ topTools.length }}</UBadge>
            </div>
          </template>
          <div v-if="topTools.length === 0" class="text-center py-8 text-gray-500 dark:text-gray-400">
            No tool usage data available
          </div>
          <div v-else class="space-y-2">
            <div
              v-for="tool in topTools"
              :key="tool.toolName"
              class="p-2"
            >
              <div class="flex items-center justify-between mb-1">
                <span class="text-sm font-medium text-gray-900 dark:text-white">{{ tool.toolName }}</span>
                <span class="text-xs text-gray-500">{{ tool.usageCount }} calls</span>
              </div>
              <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  class="bg-primary-600 h-2 rounded-full"
                  :style="{ width: `${(tool.usageCount / (topTools[0]?.usageCount || 1)) * 100}%` }"
                ></div>
              </div>
            </div>
          </div>
        </UCard>
      </div>

      <!-- Streaming Health -->
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Streaming Health</h3>
            <UBadge :color="(streamingMetrics?.errorRate || 0) < 5 ? 'green' : 'orange'">
              {{ (streamingMetrics?.errorRate || 0) < 5 ? 'Healthy' : 'Warning' }}
            </UBadge>
          </div>
        </template>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <!-- Completion Rate -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <span class="text-sm text-gray-600 dark:text-gray-400">Completion Rate</span>
              <span class="text-sm font-semibold text-gray-900 dark:text-white">
                {{ formatPercent(streamingMetrics?.completionRate || 0) }}
              </span>
            </div>
            <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                class="bg-green-600 h-2 rounded-full"
                :style="{ width: `${streamingMetrics?.completionRate || 0}%` }"
              ></div>
            </div>
          </div>

          <!-- Error Rate -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <span class="text-sm text-gray-600 dark:text-gray-400">Error Rate</span>
              <span class="text-sm font-semibold text-gray-900 dark:text-white">
                {{ formatPercent(streamingMetrics?.errorRate || 0) }}
              </span>
            </div>
            <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                class="bg-red-600 h-2 rounded-full"
                :style="{ width: `${streamingMetrics?.errorRate || 0}%` }"
              ></div>
            </div>
          </div>

          <!-- Stats -->
          <div class="flex gap-4">
            <div class="text-center flex-1">
              <p class="text-xs text-gray-500">Timeout Rate</p>
              <p class="text-lg font-semibold text-gray-900 dark:text-white">{{ formatPercent(streamingMetrics?.timeoutRate || 0) }}</p>
            </div>
            <div class="text-center flex-1">
              <p class="text-xs text-gray-500">Errors</p>
              <p class="text-lg font-semibold text-gray-900 dark:text-white">{{ streamingMetrics?.erroredStreams || 0 }}</p>
            </div>
            <div class="text-center flex-1">
              <p class="text-xs text-gray-500">Avg Duration</p>
              <p class="text-lg font-semibold text-gray-900 dark:text-white">{{ formatDuration(streamingMetrics?.avgDuration || 0) }}</p>
            </div>
          </div>
        </div>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
import type {
  StreamingDashboardMetrics,
  ActiveStreamsResponse
} from '#shared/types/streaming-metrics'
import type {
  StrandsAgentDashboardMetrics
} from '#shared/types/strands-agent-metrics'

const period = ref<'24h' | '7d' | '30d'>('7d')
const loading = ref(true)
const error = ref<string | null>(null)

const streamingMetrics = ref<StreamingDashboardMetrics | null>(null)
const agentMetrics = ref<StrandsAgentDashboardMetrics | null>(null)
const activeStreams = ref<ActiveStreamsResponse | null>(null)
const topUsers = ref<Array<{ userId: string; streamCount: number; avgDuration: number; errorRate: number }>>([])
const topTools = ref<Array<{ toolName: string; usageCount: number }>>([])

const periods = [
  { label: '24 Hours', value: '24h' as const },
  { label: '7 Days', value: '7d' as const },
  { label: '30 Days', value: '30d' as const }
]

const loadData = async () => {
  try {
    loading.value = true
    error.value = null

    const [streamingRes, agentRes, activeRes, usersRes] = await Promise.all([
      $fetch(`/api/admin/streaming/metrics?period=${period.value}`),
      $fetch(`/api/admin/strands-agent/dashboard?period=${period.value}`),
      $fetch('/api/admin/streaming/active'),
      $fetch(`/api/admin/streaming/users?period=${period.value}&limit=10`)
    ])

    streamingMetrics.value = (streamingRes as any).metrics
    agentMetrics.value = (agentRes as any).metrics
    activeStreams.value = activeRes as ActiveStreamsResponse
    topUsers.value = (usersRes as any).users || []

    // Combine top tools
    const streamingTools = streamingMetrics.value?.topTools || []
    const agentTools = agentMetrics.value?.topTools || []

    const toolsMap = new Map<string, number>()
    streamingTools.forEach(t => toolsMap.set(t.toolName, t.usageCount))
    agentTools.forEach(t => {
      const existing = toolsMap.get(t.toolName) || 0
      toolsMap.set(t.toolName, existing + t.usageCount)
    })

    topTools.value = Array.from(toolsMap.entries())
      .map(([toolName, usageCount]) => ({ toolName, usageCount }))
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, 10)

  } catch (err: any) {
    console.error('Error loading metrics:', err)
    error.value = err.message || 'Failed to load metrics'
  } finally {
    loading.value = false
  }
}

const formatNumber = (num: number) => new Intl.NumberFormat().format(num)
const formatPercent = (num: number) => `${num.toFixed(1)}%`
const formatDuration = (ms: number) => {
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}

onMounted(() => {
  loadData()
})
</script>
