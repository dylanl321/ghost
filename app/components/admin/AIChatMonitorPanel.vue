<script setup lang="ts">
import type { AdminThreadSummary, ChatThread, ChatRequestLog, CloudWatchLogEntry } from '#shared/types/chat-threads'

// Composable
const {
  metrics,
  threads,
  selectedThread,
  requestLogs,
  cloudWatchLogs,
  loading,
  error,
  autoRefresh,
  refreshInterval,
  fetchMetrics,
  fetchThreads,
  fetchThreadDetails,
  fetchRequestLogs,
  fetchCloudWatchLogs,
  startAutoRefresh,
  stopAutoRefresh,
  exportAsJSON,
  exportAsCSV,
  formatTimestamp,
  formatDuration
} = useAIChatMonitoring()

// State
const activeTab = ref(0) // 0 = overview, 1 = threads, 2 = cloudwatch, 3 = requests
const selectedPeriod = ref<'24h' | '7d' | '30d' | 'all'>('7d')
const selectedLogLevel = ref('ALL')
const includeHealthChecks = ref(false) // Default: hide health check logs
const userFilter = ref('')
const accountFilter = ref('')
const expandedThreadId = ref<string | null>(null)
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
    case 2: // cloudwatch
      await fetchCloudWatchLogs({
        period: selectedPeriod.value,
        logLevel: selectedLogLevel.value,
        includeHealthChecks: includeHealthChecks.value
      })
      break
    case 3: // requests
      await fetchRequestLogs({
        userId: userFilter.value || undefined,
        period: selectedPeriod.value
      })
      break
  }
}

async function handleThreadClick(threadId: string) {
  if (expandedThreadId.value === threadId) {
    expandedThreadId.value = null
    selectedThread.value = null
  } else {
    expandedThreadId.value = threadId
    await fetchThreadDetails(threadId)
  }
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
  if (activeTab.value === 2) { // cloudwatch
    exportAsJSON(cloudWatchLogs.value, `cloudwatch-logs-${Date.now()}.json`)
  } else if (activeTab.value === 3) { // requests
    exportAsJSON(requestLogs.value, `request-logs-${Date.now()}.json`)
  }
}

// Lifecycle
onMounted(() => {
  loadData()
})

watch([activeTab, selectedPeriod], () => {
  loadData()
})

watch([selectedLogLevel, includeHealthChecks], () => {
  if (activeTab.value === 2) { // cloudwatch tab
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
    <div v-if="metrics" class="grid grid-cols-1 md:grid-cols-4 gap-4">
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

          <!-- Expanded Thread Details -->
          <UCard v-if="selectedThread && expandedThreadId">
            <template #header>
              <div class="flex items-center justify-between">
                <h3 class="text-lg font-semibold">Thread Details: {{ selectedThread.title }}</h3>
                <UButton
                  icon="i-heroicons-x-mark"
                  size="xs"
                  variant="ghost"
                  @click="expandedThreadId = null"
                />
              </div>
            </template>

            <div class="space-y-3">
              <div class="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span class="text-gray-500 dark:text-gray-400">User:</span>
                  <span class="ml-2 font-medium">{{ selectedThread.userId }}</span>
                </div>
                <div>
                  <span class="text-gray-500 dark:text-gray-400">Created:</span>
                  <span class="ml-2 font-medium">{{ new Date(selectedThread.createdAt).toLocaleString() }}</span>
                </div>
                <div>
                  <span class="text-gray-500 dark:text-gray-400">Session ID:</span>
                  <span class="ml-2 font-mono text-xs">{{ selectedThread.sessionId || 'N/A' }}</span>
                </div>
                <div>
                  <span class="text-gray-500 dark:text-gray-400">Messages:</span>
                  <span class="ml-2 font-medium">{{ selectedThread.messageCount }}</span>
                </div>
              </div>

              <div class="border-t dark:border-gray-700 pt-3">
                <h4 class="text-sm font-semibold mb-2">Conversation</h4>
                <div class="space-y-2 max-h-96 overflow-y-auto">
                  <div
                    v-for="(message, idx) in selectedThread.messages"
                    :key="idx"
                    class="p-3 rounded-lg"
                    :class="message.role === 'user' ? 'bg-blue-50 dark:bg-blue-900/20' : 'bg-gray-50 dark:bg-gray-800'"
                  >
                    <div class="flex items-center justify-between mb-1">
                      <span class="text-xs font-semibold uppercase">{{ message.role }}</span>
                      <span class="text-xs text-gray-500">{{ new Date(message.timestamp).toLocaleString() }}</span>
                    </div>
                    <p class="text-sm whitespace-pre-wrap">{{ message.content }}</p>
                    <div v-if="message.metadata" class="mt-2 flex gap-2">
                      <UBadge v-if="message.metadata.accountId" size="xs" color="gray">
                        {{ message.metadata.accountId }}
                      </UBadge>
                      <UBadge v-if="message.metadata.mcpType" size="xs" :color="message.metadata.mcpType === 'permanent' ? 'green' : 'yellow'">
                        {{ message.metadata.mcpType }}
                      </UBadge>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </UCard>
        </div>
      </div>

      <!-- CloudWatch Logs Tab -->
      <div v-else-if="activeTab === 2">
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
      <div v-else-if="activeTab === 3">
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
  </div>
</template>
