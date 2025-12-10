<template>
  <div class="space-y-6">
    <!-- Quick Health Check -->
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold">Quick Health Check</h3>
          <UBadge
            v-if="healthStatus"
            :color="healthStatus.success ? 'green' : 'red'"
            variant="subtle"
          >
            {{ healthStatus.success ? 'Healthy' : 'Unhealthy' }}
          </UBadge>
        </div>
      </template>

      <div class="space-y-4">
        <p class="text-sm text-gray-600 dark:text-gray-400">
          Quick connectivity test to verify Strands agent is reachable and responding.
        </p>

        <div class="flex gap-3">
          <UButton
            color="primary"
            :loading="healthCheckRunning"
            @click="runHealthCheck"
          >
            Run Health Check
          </UButton>

          <UButton
            v-if="healthStatus"
            color="gray"
            variant="ghost"
            @click="healthStatus = null"
          >
            Clear
          </UButton>
        </div>

        <!-- Health Check Results -->
        <div v-if="healthStatus" class="border dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-900">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <div class="text-sm text-gray-600 dark:text-gray-400">Status</div>
              <div class="font-semibold">{{ healthStatus.status }}</div>
            </div>
            <div>
              <div class="text-sm text-gray-600 dark:text-gray-400">Response Time</div>
              <div class="font-semibold">{{ healthStatus.duration }}ms</div>
            </div>
            <div class="col-span-2">
              <div class="text-sm text-gray-600 dark:text-gray-400">Endpoint</div>
              <div class="text-xs font-mono">{{ healthStatus.endpoint }}</div>
            </div>
          </div>
        </div>

        <div v-if="healthError" class="border border-red-200 dark:border-red-900 rounded-lg p-4 bg-red-50 dark:bg-red-950">
          <div class="text-sm text-red-800 dark:text-red-200">
            <strong>Error:</strong> {{ healthError }}
          </div>
        </div>
      </div>
    </UCard>

    <!-- Full Streaming Test -->
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold">Full Streaming Test</h3>
          <UBadge
            v-if="streamTestResult"
            :color="streamTestResult.success ? 'green' : 'orange'"
            variant="subtle"
          >
            {{ streamTestResult.success ? 'Success' : 'Issues Detected' }}
          </UBadge>
        </div>
      </template>

      <div class="space-y-4">
        <p class="text-sm text-gray-600 dark:text-gray-400">
          Comprehensive test of SSE streaming with event tracking and detailed logging.
        </p>

        <!-- Test Configuration -->
        <div class="space-y-3">
          <div>
            <label class="block text-sm font-medium mb-1">Test Query</label>
            <UInput
              v-model="testQuery"
              placeholder="Enter test query (e.g., 'List AWS accounts')"
              :disabled="streamTestRunning"
            />
          </div>

          <div>
            <label class="block text-sm font-medium mb-1">Account ID (Optional)</label>
            <UInput
              v-model="testAccountId"
              placeholder="12-digit account ID"
              :disabled="streamTestRunning"
            />
          </div>
        </div>

        <div class="flex gap-3">
          <UButton
            color="primary"
            :loading="streamTestRunning"
            @click="runStreamTest"
          >
            Run Stream Test
          </UButton>

          <UButton
            v-if="streamTestResult"
            color="gray"
            variant="ghost"
            @click="clearStreamTest"
          >
            Clear Results
          </UButton>
        </div>

        <!-- Stream Test Results -->
        <div v-if="streamTestResult" class="space-y-4">
          <!-- Summary Stats -->
          <div class="border dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-900">
            <h4 class="font-semibold mb-3">Test Summary</h4>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div class="text-sm text-gray-600 dark:text-gray-400">Duration</div>
                <div class="font-semibold">{{ streamTestResult.duration }}ms</div>
              </div>
              <div>
                <div class="text-sm text-gray-600 dark:text-gray-400">Chunks</div>
                <div class="font-semibold">{{ streamTestResult.stats.chunkCount }}</div>
              </div>
              <div>
                <div class="text-sm text-gray-600 dark:text-gray-400">Events</div>
                <div class="font-semibold">{{ streamTestResult.stats.eventCount }}</div>
              </div>
              <div>
                <div class="text-sm text-gray-600 dark:text-gray-400">Data Size</div>
                <div class="font-semibold">{{ formatBytes(streamTestResult.stats.totalBytes) }}</div>
              </div>
            </div>
          </div>

          <!-- Warnings -->
          <div v-if="streamTestResult.warnings?.length" class="border border-orange-200 dark:border-orange-900 rounded-lg p-4 bg-orange-50 dark:bg-orange-950">
            <h4 class="font-semibold text-orange-800 dark:text-orange-200 mb-2">Warnings</h4>
            <ul class="list-disc list-inside text-sm text-orange-700 dark:text-orange-300 space-y-1">
              <li v-for="(warning, idx) in streamTestResult.warnings" :key="idx">
                {{ warning }}
              </li>
            </ul>
          </div>

          <!-- Event Types -->
          <div class="border dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-900">
            <h4 class="font-semibold mb-3">Event Types Received</h4>
            <div class="flex flex-wrap gap-2">
              <UBadge
                v-for="(count, type) in streamTestResult.stats.eventTypes"
                :key="type"
                :color="getEventTypeColor(type)"
                variant="subtle"
              >
                {{ type }}: {{ count }}
              </UBadge>
            </div>
          </div>

          <!-- Events Timeline -->
          <div class="border dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-900">
            <h4 class="font-semibold mb-3">Events Timeline</h4>
            <div class="space-y-2 max-h-60 overflow-y-auto">
              <div
                v-for="(event, idx) in streamTestResult.events"
                :key="idx"
                class="text-sm font-mono bg-white dark:bg-gray-800 p-2 rounded border dark:border-gray-700"
              >
                <div class="flex items-center justify-between mb-1">
                  <UBadge :color="getEventTypeColor(event.type)" size="xs">
                    {{ event.type }}
                  </UBadge>
                  <span class="text-xs text-gray-500">{{ formatTime(event.timestamp) }}</span>
                </div>
                <div v-if="event.dataPreview" class="text-xs text-gray-600 dark:text-gray-400 truncate">
                  {{ event.dataPreview }}
                </div>
              </div>
            </div>
          </div>

          <!-- Detailed Logs -->
          <div class="border dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-900">
            <div class="flex items-center justify-between mb-3">
              <h4 class="font-semibold">Detailed Logs</h4>
              <UButton
                size="xs"
                color="gray"
                variant="ghost"
                @click="showAllLogs = !showAllLogs"
              >
                {{ showAllLogs ? 'Show Less' : 'Show All' }}
              </UButton>
            </div>
            <div class="space-y-1 max-h-96 overflow-y-auto">
              <div
                v-for="(log, idx) in displayedLogs"
                :key="idx"
                class="text-xs font-mono p-2 rounded"
                :class="getLogColor(log.level)"
              >
                <div class="flex items-start gap-2">
                  <span class="text-gray-500 shrink-0">{{ formatTime(log.timestamp) }}</span>
                  <span :class="getLogLevelColor(log.level)" class="font-semibold shrink-0">
                    [{{ log.level.toUpperCase() }}]
                  </span>
                  <span class="flex-1">{{ log.message }}</span>
                </div>
                <div v-if="log.data && showAllLogs" class="mt-1 pl-32 text-gray-600 dark:text-gray-400">
                  {{ JSON.stringify(log.data, null, 2) }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Stream Test Error -->
        <div v-if="streamTestError" class="border border-red-200 dark:border-red-900 rounded-lg p-4 bg-red-50 dark:bg-red-950">
          <div class="text-sm text-red-800 dark:text-red-200">
            <strong>Error:</strong> {{ streamTestError }}
          </div>
        </div>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
const healthCheckRunning = ref(false)
const healthStatus = ref<any>(null)
const healthError = ref<string | null>(null)

const streamTestRunning = ref(false)
const streamTestResult = ref<any>(null)
const streamTestError = ref<string | null>(null)
const testQuery = ref('List AWS accounts')
const testAccountId = ref('')
const showAllLogs = ref(false)

const displayedLogs = computed(() => {
  if (!streamTestResult.value?.logs) return []
  return showAllLogs.value
    ? streamTestResult.value.logs
    : streamTestResult.value.logs.slice(0, 10)
})

async function runHealthCheck() {
  healthCheckRunning.value = true
  healthStatus.value = null
  healthError.value = null

  try {
    const response = await $fetch('/api/admin/strands-test/health')
    healthStatus.value = response
  } catch (error: any) {
    healthError.value = error.data?.error || error.message || 'Health check failed'
  } finally {
    healthCheckRunning.value = false
  }
}

async function runStreamTest() {
  streamTestRunning.value = true
  streamTestResult.value = null
  streamTestError.value = null

  try {
    const response = await $fetch('/api/admin/strands-test/stream', {
      method: 'POST',
      body: {
        query: testQuery.value,
        accountIdentifier: testAccountId.value || undefined
      }
    })
    streamTestResult.value = response
  } catch (error: any) {
    streamTestError.value = error.data?.error || error.message || 'Stream test failed'
    // If we have logs/events in the error data, show them
    if (error.data?.logs || error.data?.events) {
      streamTestResult.value = {
        success: false,
        logs: error.data.logs || [],
        events: error.data.events || [],
        stats: {
          chunkCount: 0,
          totalBytes: 0,
          eventCount: error.data.events?.length || 0,
          eventTypes: {}
        },
        warnings: ['Test failed with error']
      }
    }
  } finally {
    streamTestRunning.value = false
  }
}

function clearStreamTest() {
  streamTestResult.value = null
  streamTestError.value = null
  showAllLogs.value = false
}

function getEventTypeColor(type: string): string {
  const colors: Record<string, string> = {
    status: 'blue',
    tool_call: 'purple',
    response: 'green',
    complete: 'emerald',
    error: 'red',
    disambiguation: 'yellow'
  }
  return colors[type] || 'gray'
}

function getLogColor(level: string): string {
  const colors: Record<string, string> = {
    info: 'bg-white dark:bg-gray-800',
    warn: 'bg-orange-50 dark:bg-orange-950',
    error: 'bg-red-50 dark:bg-red-950'
  }
  return colors[level] || 'bg-white dark:bg-gray-800'
}

function getLogLevelColor(level: string): string {
  const colors: Record<string, string> = {
    info: 'text-blue-600 dark:text-blue-400',
    warn: 'text-orange-600 dark:text-orange-400',
    error: 'text-red-600 dark:text-red-400'
  }
  return colors[level] || 'text-gray-600 dark:text-gray-400'
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString()
}
</script>
