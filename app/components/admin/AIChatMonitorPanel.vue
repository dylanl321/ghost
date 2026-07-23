<script setup lang="ts">
import type { AdminThreadSummary, ChatThread, ChatRequestLog, CloudWatchLogEntry } from '#shared/types/chat-threads'

// Composable
const {
  metrics,
  threads,
  selectedThread,
  requestLogs,
  cloudWatchLogs,
  asyncJobs,
  loading,
  error,
  autoRefresh,
  refreshInterval,
  fetchMetrics,
  fetchThreads,
  fetchThreadDetails,
  fetchRequestLogs,
  fetchCloudWatchLogs,
  fetchAsyncJobs,
  startAutoRefresh,
  stopAutoRefresh,
  exportAsJSON,
  exportAsCSV,
  formatTimestamp,
  formatDuration
} = useAIChatMonitoring()

// State
const activeTab = ref(0) // 0 = overview, 1 = threads, 2 = async, 3 = cloudwatch, 4 = requests
const selectedPeriod = ref<'24h' | '7d' | '30d' | 'all'>('7d')
const selectedLogLevel = ref('ALL')
const includeHealthChecks = ref(false) // Default: hide health check logs
const userFilter = ref('')
const accountFilter = ref('')
const statusFilter = ref('ALL') // For async jobs filtering
const showThreadModal = ref(false)
const expandedRequestId = ref<string | null>(null)
const expandedLogIndex = ref<number | null>(null)

// Computed
const logLevelOptions = ['ALL', 'INFO', 'WARN', 'ERROR', 'DEBUG']

// Methods
async function loadData() {
  switch (activeTab.value) {
    case 0: // overview
      await Promise.all([
        fetchMetrics(selectedPeriod.value),
        fetchThreads({ period: selectedPeriod.value })
      ])
      break
    case 1: // threads
      await fetchThreads({
        userId: userFilter.value || undefined,
        accountId: accountFilter.value || undefined,
        period: selectedPeriod.value
      })
      break
    case 2: // async jobs
      await fetchAsyncJobs({
        userId: userFilter.value || undefined,
        status: statusFilter.value !== 'ALL' ? statusFilter.value : undefined,
        period: selectedPeriod.value
      })
      break
    case 3: // cloudwatch
      await fetchCloudWatchLogs({
        period: selectedPeriod.value,
        logLevel: selectedLogLevel.value,
        includeHealthChecks: includeHealthChecks.value
      })
      break
    case 4: // requests
      await fetchRequestLogs({
        userId: userFilter.value || undefined,
        period: selectedPeriod.value
      })
      break
  }
}

async function handleThreadClick(threadId: string) {
  await fetchThreadDetails(threadId)
  showThreadModal.value = true
}

function closeThreadModal() {
  showThreadModal.value = false
  selectedThread.value = null
}

function toggleAutoRefresh() {
  if (autoRefresh.value) {
    stopAutoRefresh()
  } else {
    startAutoRefresh(loadData)
  }
}

function handleExportMetrics() {
  if (metrics.value) {
    exportAsJSON(metrics.value, `chat-metrics-${selectedPeriod.value}-${Date.now()}.json`)
  }
}

function handleExportThreads() {
  exportAsCSV(
    threads.value.map(t => ({
      threadId: t.threadId,
      userId: t.userId,
      title: t.title,
      messageCount: t.messageCount,
      lastMessageAt: t.lastMessageAt,
      isShared: t.isShared,
      isPinned: t.isPinned,
      isArchived: t.isArchived
    })),
    `chat-threads-${Date.now()}.csv`
  )
}

function handleExportLogs() {
  if (activeTab.value === 2) { // async jobs
    exportAsJSON(asyncJobs.value, `async-jobs-${Date.now()}.json`)
  } else if (activeTab.value === 3) { // cloudwatch
    exportAsJSON(cloudWatchLogs.value, `cloudwatch-logs-${Date.now()}.json`)
  } else if (activeTab.value === 4) { // requests
    exportAsJSON(requestLogs.value, `request-logs-${Date.now()}.json`)
  }
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text)
  // TODO: Future - Add toast notification for copy success
}

// Lifecycle
onMounted(() => {
  loadData()
})

watch([activeTab, selectedPeriod], () => {
  loadData()
})

watch([selectedLogLevel, includeHealthChecks], () => {
  if (activeTab.value === 3) { // cloudwatch tab
    fetchCloudWatchLogs({
      period: selectedPeriod.value,
      logLevel: selectedLogLevel.value,
      includeHealthChecks: includeHealthChecks.value
    })
  }
})

// Cleanup
onUnmounted(() => {
  stopAutoRefresh()
})
</script>

<template>
  <div class="flex flex-col h-full space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-2xl font-bold text-gray-900 dark:text-white">
          AI Chat Monitor
        </h2>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Monitor AI chat activity, view raw requests, and analyze CloudWatch logs
        </p>
      </div>

      <!-- Auto-refresh controls -->
      <div class="flex items-center gap-3">
        <UButton
          :icon="autoRefresh ? 'i-heroicons-pause' : 'i-heroicons-arrow-path'"
          :color="autoRefresh ? 'orange' : 'primary'"
          @click="toggleAutoRefresh"
        >
          {{ autoRefresh ? 'Stop' : 'Start' }} Auto-Refresh
        </UButton>

        <USelect
          v-model="selectedPeriod"
          :options="[
            { label: 'Last 24 Hours', value: '24h' },
            { label: 'Last 7 Days', value: '7d' },
            { label: 'Last 30 Days', value: '30d' },
            { label: 'All Time', value: 'all' }
          ]"
          option-attribute="label"
          value-attribute="value"
          class="w-40"
        />
      </div>
    </div>

    <!-- Metrics Cards (always visible) -->
    <div v-if="metrics" class="grid grid-cols-1 md:grid-cols-6 gap-4">
      <UCard>
        <div class="space-y-2">
          <p class="text-sm text-gray-500 dark:text-gray-400">Total Queries</p>
          <p class="text-3xl font-bold text-gray-900 dark:text-white">
            {{ metrics.totalQueries.toLocaleString() }}
          </p>
          <p class="text-xs text-gray-400">
            {{ metrics.totalThreads }} threads
          </p>
        </div>
      </UCard>

      <UCard>
        <div class="space-y-2">
          <p class="text-sm text-gray-500 dark:text-gray-400">Unique Users</p>
          <p class="text-3xl font-bold text-gray-900 dark:text-white">
            {{ metrics.uniqueUsers }}
          </p>
          <p class="text-xs text-gray-400">
            Avg {{ metrics.averageMessagesPerThread.toFixed(1) }} msgs/thread
          </p>
        </div>
      </UCard>

      <UCard>
        <div class="space-y-2">
          <p class="text-sm text-gray-500 dark:text-gray-400">Avg Response Time</p>
          <p class="text-3xl font-bold text-gray-900 dark:text-white">
            {{ metrics.averageResponseTime ? `${metrics.averageResponseTime.toFixed(1)}s` : 'N/A' }}
          </p>
          <p class="text-xs text-gray-400">
            Error rate: {{ metrics.errorRate.toFixed(1) }}%
          </p>
        </div>
      </UCard>

      <UCard>
        <div class="space-y-2">
          <p class="text-sm text-gray-500 dark:text-gray-400">MCP Distribution</p>
          <div class="space-y-1">
            <div class="flex justify-between text-xs">
              <span class="text-gray-600 dark:text-gray-400">Permanent:</span>
              <span class="font-semibold">{{ metrics.mcpTypeDistribution.permanent }}</span>
            </div>
            <div class="flex justify-between text-xs">
              <span class="text-gray-600 dark:text-gray-400">Temporary:</span>
              <span class="font-semibold">{{ metrics.mcpTypeDistribution.temporary }}</span>
            </div>
          </div>
        </div>
      </UCard>

      <UCard>
        <div class="space-y-2">
          <p class="text-sm text-gray-500 dark:text-gray-400">Async Jobs</p>
          <div class="space-y-1">
            <div class="flex justify-between text-xs">
              <span class="text-gray-600 dark:text-gray-400">Running:</span>
              <span class="font-semibold text-blue-600">{{ metrics.asyncJobsRunning }}</span>
            </div>
            <div class="flex justify-between text-xs">
              <span class="text-gray-600 dark:text-gray-400">Complete:</span>
              <span class="font-semibold text-green-600">{{ metrics.asyncJobsComplete }}</span>
            </div>
            <div class="flex justify-between text-xs">
              <span class="text-gray-600 dark:text-gray-400">Errored:</span>
              <span class="font-semibold text-red-600">{{ metrics.asyncJobsErrored }}</span>
            </div>
          </div>
          <!-- TODO: Future - Add click to filter async jobs by status -->
        </div>
      </UCard>

      <UCard>
        <div class="space-y-2">
          <p class="text-sm text-gray-500 dark:text-gray-400">Query Stats</p>
          <div class="space-y-1">
            <div class="flex justify-between text-xs">
              <span class="text-gray-600 dark:text-gray-400">Cancelled:</span>
              <span class="font-semibold">{{ metrics.cancelledQueriesCount }}</span>
            </div>
            <div class="flex justify-between text-xs">
              <span class="text-gray-600 dark:text-gray-400">With Reasoning:</span>
              <span class="font-semibold">{{ metrics.reasoningUsageRate.toFixed(1) }}%</span>
            </div>
            <div class="flex justify-between text-xs">
              <span class="text-gray-600 dark:text-gray-400">Avg Async:</span>
              <span class="font-semibold">{{ metrics.averageAsyncDuration ? `${metrics.averageAsyncDuration.toFixed(1)}s` : 'N/A' }}</span>
            </div>
          </div>
          <!-- TODO: Future - Add trend indicators -->
        </div>
      </UCard>
    </div>

    <!-- Error Display -->
    <UAlert
      v-if="error"
      color="red"
      variant="soft"
      :title="error"
      :close-button="{ icon: 'i-heroicons-x-mark-20-solid', color: 'red', variant: 'link' }"
      @close="error = null"
    />

    <!-- Tabs -->
    <UTabs
      v-model="activeTab"
      :items="[
        { label: 'Overview', icon: 'i-heroicons-chart-bar' },
        { label: 'Threads', icon: 'i-heroicons-chat-bubble-left-right' },
        { label: 'Async Jobs', icon: 'i-heroicons-clock' },
        { label: 'CloudWatch Logs', icon: 'i-heroicons-server' },
        { label: 'Raw Requests', icon: 'i-heroicons-code-bracket' }
      ]"
      class="w-full"
    />

    <!-- Tab Content -->
    <div class="mt-6">
      <!-- Overview Tab -->
      <div v-if="activeTab === 0">
        <div class="space-y-6 py-4">
          <!-- Top Users -->
          <UCard>
            <template #header>
              <div class="flex items-center justify-between">
                <h3 class="text-lg font-semibold">Top Users</h3>
                <UButton
                  icon="i-heroicons-arrow-down-tray"
                  size="xs"
                  variant="ghost"
                  @click="handleExportMetrics"
                >
                  Export
                </UButton>
              </div>
            </template>

            <UTable
              v-if="metrics"
              :rows="metrics.topUsers"
              :columns="[
                { key: 'userId', label: 'User' },
                { key: 'threadCount', label: 'Threads' },
                { key: 'messageCount', label: 'Messages' }
              ]"
            />
          </UCard>

          <!-- Top Accounts -->
          <UCard>
            <template #header>
              <h3 class="text-lg font-semibold">Top Accounts Queried</h3>
            </template>

            <UTable
              v-if="metrics"
              :rows="metrics.topAccounts"
              :columns="[
                { key: 'accountId', label: 'Account ID' },
                { key: 'queryCount', label: 'Query Count' }
              ]"
            />
          </UCard>
        </div>
      </div>

      <!-- Threads Tab -->
      <div v-else-if="activeTab === 1">
        <div class="space-y-4 py-4">
          <!-- Filters -->
          <div class="flex gap-3">
            <UInput
              v-model="userFilter"
              icon="i-heroicons-magnifying-glass"
              placeholder="Filter by user email..."
              class="flex-1"
              @update:model-value="loadData"
            />
            <UInput
              v-model="accountFilter"
              icon="i-heroicons-hashtag"
              placeholder="Filter by account ID..."
              class="flex-1"
              @update:model-value="loadData"
            />
            <UButton
              icon="i-heroicons-arrow-down-tray"
              @click="handleExportThreads"
            >
              Export
            </UButton>
          </div>

          <!-- Threads Table -->
          <UCard>
            <UTable
              :rows="threads"
              :columns="[
                { key: 'userId', label: 'User' },
                { key: 'title', label: 'Title' },
                { key: 'messageCount', label: 'Messages' },
                { key: 'lastMessageAt', label: 'Last Activity' },
                { key: 'actions', label: '' }
              ]"
              :loading="loading"
            >
              <template #title-data="{ row }">
                <div class="flex items-center gap-2">
                  <span>{{ row.title }}</span>
                  <UBadge v-if="row.isShared" color="blue" size="xs">Shared</UBadge>
                  <UBadge v-if="row.isPinned" color="yellow" size="xs">Pinned</UBadge>
                </div>
              </template>

              <template #lastMessageAt-data="{ row }">
                {{ new Date(row.lastMessageAt).toLocaleString() }}
              </template>

              <template #actions-data="{ row }">
                <UButton
                  icon="i-heroicons-eye"
                  size="xs"
                  variant="ghost"
                  @click="handleThreadClick(row.threadId)"
                />
              </template>
            </UTable>
          </UCard>

        </div>
      </div>

      <!-- Async Jobs Tab -->
      <div v-else-if="activeTab === 2">
        <div class="space-y-4 py-4">
          <!-- Filters -->
          <div class="flex gap-3">
            <UInput
              v-model="userFilter"
              icon="i-heroicons-magnifying-glass"
              placeholder="Filter by user email..."
              class="flex-1"
              @update:model-value="loadData"
            />
            <USelect
              v-model="statusFilter"
              :options="['ALL', 'queued', 'running', 'complete', 'error']"
              class="w-40"
              @update:model-value="loadData"
            />
            <UButton
              icon="i-heroicons-arrow-down-tray"
              @click="handleExportLogs"
            >
              Export
            </UButton>
            <!-- TODO: Future - Add date range picker -->
            <!-- TODO: Future - Add bulk actions (retry failed jobs) -->
          </div>

          <!-- Jobs Table -->
          <UCard>
            <UTable
              :rows="asyncJobs"
              :columns="[
                { key: 'createdAt', label: 'Created' },
                { key: 'userId', label: 'User' },
                { key: 'jobId', label: 'Job ID' },
                { key: 'status', label: 'Status' },
                { key: 'progress', label: 'Progress' },
                { key: 'duration', label: 'Duration' }
              ]"
              :loading="loading"
            >
              <template #createdAt-data="{ row }">
                {{ formatTimestamp(row.createdAt) }}
              </template>

              <template #jobId-data="{ row }">
                <code class="text-xs">{{ row.jobId.substring(0, 8) }}...</code>
              </template>

              <template #status-data="{ row }">
                <UBadge
                  :color="row.status === 'complete' ? 'green' : row.status === 'error' ? 'red' : row.status === 'canceled' ? 'orange' : row.status === 'running' ? 'blue' : 'gray'"
                  size="xs"
                >
                  {{ row.status.toUpperCase() }}
                </UBadge>
              </template>

              <template #progress-data="{ row }">
                <div v-if="row.status === 'running'" class="flex items-center gap-2">
                  <div class="w-32 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div
                      class="bg-blue-600 h-2 rounded-full transition-all"
                      :style="{ width: `${row.progressPercent || 0}%` }"
                    ></div>
                  </div>
                  <span class="text-xs">{{ row.progressPercent || 0 }}%</span>
                </div>
                <span v-else-if="row.error" class="text-xs text-red-600 dark:text-red-400 truncate max-w-xs">
                  {{ row.error }}
                </span>
                <span v-else class="text-xs text-gray-500">
                  {{ row.currentStep || '-' }}
                </span>
              </template>

              <template #duration-data="{ row }">
                <span v-if="row.duration" class="text-xs">
                  {{ formatDuration(row.duration * 1000) }}
                </span>
                <span v-else-if="row.status === 'running'" class="text-xs text-blue-600">
                  In progress...
                </span>
                <span v-else class="text-xs text-gray-400">-</span>
              </template>
            </UTable>
            <!-- TODO: Future - Add expandable row details showing toolsCalled -->
            <!-- TODO: Future - Add link to thread if threadId exists -->
          </UCard>
        </div>
      </div>

      <!-- CloudWatch Logs Tab -->
      <div v-else-if="activeTab === 3">
        <div class="space-y-4 py-4">
          <!-- Filters -->
          <div class="flex gap-3 items-center">
            <USelect
              v-model="selectedLogLevel"
              :options="logLevelOptions"
              class="w-40"
            />
            <UCheckbox
              v-model="includeHealthChecks"
              label="Include health checks"
            />
            <UButton
              icon="i-heroicons-arrow-down-tray"
              @click="handleExportLogs"
            >
              Export
            </UButton>
          </div>

          <!-- Logs Table -->
          <UCard>
            <UTable
              :rows="cloudWatchLogs"
              :columns="[
                { key: 'timestamp', label: 'Timestamp' },
                { key: 'level', label: 'Level' },
                { key: 'message', label: 'Message' },
                { key: 'actions', label: '' }
              ]"
              :loading="loading"
            >
              <template #timestamp-data="{ row }">
                {{ row.timestamp ? formatTimestamp(row.timestamp) : 'N/A' }}
              </template>

              <template #level-data="{ row }">
                <UBadge
                  :color="row.level === 'ERROR' ? 'red' : row.level === 'WARN' ? 'yellow' : 'gray'"
                  size="xs"
                >
                  {{ row.level }}
                </UBadge>
              </template>

              <template #message-data="{ row, index }">
                <div class="max-w-2xl truncate">{{ row.message }}</div>
              </template>

              <template #actions-data="{ row, index }">
                <UButton
                  icon="i-heroicons-chevron-down"
                  size="xs"
                  variant="ghost"
                  @click="expandedLogIndex = expandedLogIndex === index ? null : index"
                />
              </template>
            </UTable>

            <!-- Expanded Log Details -->
            <div v-if="expandedLogIndex !== null && cloudWatchLogs[expandedLogIndex]" class="mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <pre class="text-xs overflow-x-auto">{{ cloudWatchLogs[expandedLogIndex].isJSON ? JSON.stringify(cloudWatchLogs[expandedLogIndex].parsedJSON, null, 2) : cloudWatchLogs[expandedLogIndex].message }}</pre>
            </div>
          </UCard>
        </div>
      </div>

      <!-- Raw Requests Tab -->
      <div v-else-if="activeTab === 4">
        <div class="space-y-4 py-4">
          <!-- Filters -->
          <div class="flex gap-3">
            <UInput
              v-model="userFilter"
              icon="i-heroicons-magnifying-glass"
              placeholder="Filter by user email..."
              class="flex-1"
              @update:model-value="loadData"
            />
            <UButton
              icon="i-heroicons-arrow-down-tray"
              @click="handleExportLogs"
            >
              Export
            </UButton>
          </div>

          <!-- Requests Table -->
          <UCard>
            <UTable
              :rows="requestLogs"
              :columns="[
                { key: 'timestamp', label: 'Timestamp' },
                { key: 'userId', label: 'User' },
                { key: 'requestId', label: 'Request ID' },
                { key: 'response', label: 'Status' },
                { key: 'actions', label: '' }
              ]"
              :loading="loading"
            >
              <template #timestamp-data="{ row }">
                {{ formatTimestamp(row.timestamp) }}
              </template>

              <template #requestId-data="{ row }">
                <code class="text-xs">{{ row.requestId }}</code>
              </template>

              <template #response-data="{ row }">
                <div v-if="row.error" class="flex items-center gap-2">
                  <UBadge color="red" size="xs">Error</UBadge>
                  <span class="text-xs">{{ formatDuration(row.error.responseTimeMs || 0) }}</span>
                </div>
                <div v-else-if="row.response" class="flex items-center gap-2">
                  <UBadge color="green" size="xs">Success</UBadge>
                  <span class="text-xs">{{ formatDuration(row.response.responseTimeMs || 0) }}</span>
                </div>
                <UBadge v-else color="gray" size="xs">Pending</UBadge>
              </template>

              <template #actions-data="{ row }">
                <UButton
                  icon="i-heroicons-chevron-down"
                  size="xs"
                  variant="ghost"
                  @click="expandedRequestId = expandedRequestId === row.requestId ? null : row.requestId"
                />
              </template>
            </UTable>

            <!-- Expanded Request Details -->
            <template v-for="log in requestLogs" :key="log.requestId">
              <div
                v-if="expandedRequestId === log.requestId"
                class="mt-4 space-y-3"
              >
                <div v-if="log.request" class="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <h4 class="text-sm font-semibold mb-2">Request</h4>
                  <pre class="text-xs overflow-x-auto">{{ JSON.stringify(log.request, null, 2) }}</pre>
                </div>

                <div v-if="log.response" class="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <h4 class="text-sm font-semibold mb-2">Response</h4>
                  <pre class="text-xs overflow-x-auto">{{ JSON.stringify(log.response, null, 2) }}</pre>
                </div>

                <div v-if="log.error" class="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
                  <h4 class="text-sm font-semibold mb-2">Error</h4>
                  <pre class="text-xs overflow-x-auto">{{ JSON.stringify(log.error, null, 2) }}</pre>
                </div>
              </div>
            </template>
          </UCard>
        </div>
      </div>
    </div>

    <!-- Thread Details Modal -->
    <UModal v-model="showThreadModal" :ui="{ width: 'sm:max-w-4xl' }">
      <UCard v-if="selectedThread">
        <template #header>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <UIcon name="i-heroicons-chat-bubble-left-right" class="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h3 class="text-lg font-semibold text-gray-900 dark:text-white">{{ selectedThread.title }}</h3>
                <p class="text-sm text-gray-500 dark:text-gray-400">{{ selectedThread.userId }}</p>
              </div>
            </div>
            <UButton
              icon="i-heroicons-x-mark"
              color="gray"
              variant="ghost"
              @click="closeThreadModal"
            />
          </div>
        </template>

        <div class="space-y-4">
          <!-- Thread Info Grid -->
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div class="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <p class="text-xs text-gray-500 dark:text-gray-400">Created</p>
              <p class="text-sm font-medium text-gray-900 dark:text-white">{{ new Date(selectedThread.createdAt).toLocaleString() }}</p>
            </div>
            <div class="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <p class="text-xs text-gray-500 dark:text-gray-400">Messages</p>
              <p class="text-sm font-medium text-gray-900 dark:text-white">{{ selectedThread.messageCount }}</p>
            </div>
            <div class="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <p class="text-xs text-gray-500 dark:text-gray-400">Session ID</p>
              <p class="text-xs font-mono text-gray-900 dark:text-white truncate">{{ selectedThread.sessionId || 'N/A' }}</p>
            </div>
            <div class="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <p class="text-xs text-gray-500 dark:text-gray-400">Status</p>
              <div class="flex gap-1 mt-1">
                <UBadge v-if="selectedThread.isShared" color="blue" size="xs">Shared</UBadge>
                <UBadge v-if="selectedThread.isPinned" color="yellow" size="xs">Pinned</UBadge>
                <UBadge v-if="selectedThread.isArchived" color="gray" size="xs">Archived</UBadge>
                <UBadge v-if="!selectedThread.isShared && !selectedThread.isPinned && !selectedThread.isArchived" color="green" size="xs">Active</UBadge>
              </div>
            </div>
          </div>

          <!-- Share Info Section -->
          <div v-if="selectedThread.isShared" class="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm font-medium text-blue-900 dark:text-blue-100">Shared Thread</p>
                <code class="text-xs bg-blue-100 dark:bg-blue-800 px-2 py-1 rounded mt-1 inline-block">
                  {{ selectedThread.shortUrl || selectedThread.shareId }}
                </code>
              </div>
              <UButton
                icon="i-heroicons-clipboard"
                size="sm"
                color="blue"
                variant="soft"
                @click="copyToClipboard(selectedThread.shortUrl || selectedThread.shareId || '')"
              >
                Copy
              </UButton>
            </div>
            <p class="text-xs text-blue-700 dark:text-blue-300 mt-2">
              Shared: {{ new Date(selectedThread.sharedAt || '').toLocaleString() }}
              <span v-if="selectedThread.shareExpiresAt">
                | Expires: {{ new Date(selectedThread.shareExpiresAt).toLocaleString() }}
              </span>
            </p>
          </div>

          <!-- Conversation -->
          <div>
            <h4 class="text-sm font-semibold text-gray-900 dark:text-white mb-3">Conversation</h4>
            <div class="space-y-3 max-h-[50vh] overflow-y-auto pr-2">
              <div
                v-for="(message, idx) in selectedThread.messages"
                :key="idx"
                class="p-3 rounded-lg"
                :class="message.role === 'user' ? 'bg-blue-50 dark:bg-blue-900/20 ml-8' : 'bg-gray-50 dark:bg-gray-800 mr-8'"
              >
                <div class="flex items-center justify-between mb-2">
                  <div class="flex items-center gap-2">
                    <UIcon
                      :name="message.role === 'user' ? 'i-heroicons-user' : 'i-heroicons-sparkles'"
                      class="w-4 h-4"
                      :class="message.role === 'user' ? 'text-blue-600' : 'text-purple-600'"
                    />
                    <span class="text-xs font-semibold uppercase" :class="message.role === 'user' ? 'text-blue-700 dark:text-blue-300' : 'text-purple-700 dark:text-purple-300'">
                      {{ message.role }}
                    </span>
                  </div>
                  <span class="text-xs text-gray-500">{{ new Date(message.timestamp).toLocaleString() }}</span>
                </div>

                <!-- AI Reasoning -->
                <div v-if="message.reasoning" class="mb-2 p-2 bg-purple-50 dark:bg-purple-900/30 rounded border border-purple-200 dark:border-purple-700">
                  <div class="flex items-center gap-1 mb-1">
                    <UIcon name="i-heroicons-light-bulb" class="w-3 h-3 text-purple-600" />
                    <span class="text-xs font-medium text-purple-700 dark:text-purple-300">AI Reasoning</span>
                  </div>
                  <p class="text-xs text-purple-600 dark:text-purple-400 whitespace-pre-wrap">{{ message.reasoning }}</p>
                </div>

                <p class="text-sm whitespace-pre-wrap text-gray-900 dark:text-white">{{ message.content }}</p>

                <!-- Message Status -->
                <div v-if="message.status" class="mt-2 flex items-center gap-2">
                  <UBadge
                    :color="message.status.status === 'error' ? 'red' : message.status.status === 'streaming' ? 'blue' : 'gray'"
                    size="xs"
                  >
                    {{ message.status.status }}
                  </UBadge>
                  <span v-if="message.status.progress" class="text-xs text-gray-500">{{ message.status.progress }}</span>
                </div>

                <!-- Metadata -->
                <div v-if="message.metadata" class="mt-2 flex gap-2 flex-wrap">
                  <UBadge v-if="message.metadata.accountId" size="xs" color="gray">
                    {{ message.metadata.accountId }}
                  </UBadge>
                  <UBadge v-if="message.metadata.mcpType" size="xs" :color="message.metadata.mcpType === 'permanent' ? 'green' : 'yellow'">
                    {{ message.metadata.mcpType }}
                  </UBadge>
                  <UBadge v-if="message.metadata.tokens" size="xs" color="indigo">
                    {{ message.metadata.tokens.input + message.metadata.tokens.output }} tokens
                  </UBadge>
                </div>

                <!-- Suggested Links -->
                <div v-if="message.suggestedLinks && message.suggestedLinks.length > 0" class="mt-2">
                  <p class="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Suggested Links:</p>
                  <div class="flex flex-wrap gap-1">
                    <UBadge
                      v-for="(link, linkIdx) in message.suggestedLinks"
                      :key="linkIdx"
                      size="xs"
                      color="blue"
                      variant="soft"
                    >
                      {{ link.label }}
                    </UBadge>
                  </div>
                </div>

                <!-- Suggested Prompts -->
                <div v-if="message.suggestedPrompts && message.suggestedPrompts.length > 0" class="mt-2">
                  <p class="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Suggested Prompts:</p>
                  <div class="flex flex-wrap gap-1">
                    <UBadge
                      v-for="(prompt, promptIdx) in message.suggestedPrompts"
                      :key="promptIdx"
                      size="xs"
                      color="purple"
                      variant="soft"
                    >
                      {{ prompt.text.substring(0, 50) }}{{ prompt.text.length > 50 ? '...' : '' }}
                    </UBadge>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton color="gray" variant="soft" @click="closeThreadModal">
              Close
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>
