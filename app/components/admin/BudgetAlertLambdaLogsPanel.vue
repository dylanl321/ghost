<template>
  <div class="space-y-6">
    <!-- Header & Filters -->
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-lg font-semibold">Lambda Execution Logs</h2>
            <p class="text-sm text-gray-400">CloudWatch logs from {{ logConfig?.logGroup || 'budget-alert-system-prod' }}</p>
          </div>
          <div class="flex items-center gap-3">
            <USelect v-model="timeRange" :options="timeRangeOptions" class="w-40" />
            <USelect v-model="logLevel" :options="logLevelOptions" class="w-32" />
            <UButton
              color="gray"
              variant="ghost"
              icon="i-heroicons-arrow-path"
              :loading="loading"
              @click="fetchLogs"
            >
              Refresh
            </UButton>
          </div>
        </div>
      </template>

      <!-- Stats Row -->
      <div v-if="!loading && logs.length > 0" class="grid grid-cols-4 gap-4 mb-4">
        <div class="text-center p-3 bg-gray-800 rounded-lg">
          <p class="text-2xl font-bold">{{ logs.length }}</p>
          <p class="text-xs text-gray-400">Total Events</p>
        </div>
        <div class="text-center p-3 bg-red-900/20 rounded-lg">
          <p class="text-2xl font-bold text-red-400">{{ errorCount }}</p>
          <p class="text-xs text-gray-400">Errors</p>
        </div>
        <div class="text-center p-3 bg-yellow-900/20 rounded-lg">
          <p class="text-2xl font-bold text-yellow-400">{{ warnCount }}</p>
          <p class="text-xs text-gray-400">Warnings</p>
        </div>
        <div class="text-center p-3 bg-blue-900/20 rounded-lg">
          <p class="text-2xl font-bold text-blue-400">{{ infoCount }}</p>
          <p class="text-xs text-gray-400">Info</p>
        </div>
      </div>

      <!-- Search -->
      <UInput
        v-model="searchQuery"
        placeholder="Filter logs..."
        icon="i-heroicons-magnifying-glass"
        class="mb-4"
      />
    </UCard>

    <!-- Logs List -->
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <div class="text-lg font-semibold">Log Events</div>
          <UBadge color="emerald" variant="subtle">{{ filteredLogs.length }} events</UBadge>
        </div>
      </template>

      <!-- Loading State -->
      <div v-if="loading" class="flex items-center justify-center py-12">
        <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 text-gray-400 animate-spin" />
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="flex flex-col items-center justify-center py-12 text-center">
        <UIcon name="i-heroicons-exclamation-circle" class="w-12 h-12 text-red-500 mb-4" />
        <p class="text-gray-400 mb-4">{{ error }}</p>
        <UButton color="gray" @click="fetchLogs">Try Again</UButton>
      </div>

      <!-- Empty State -->
      <div v-else-if="filteredLogs.length === 0" class="flex flex-col items-center justify-center py-12 text-center">
        <UIcon name="i-heroicons-document-text" class="w-12 h-12 text-gray-500 mb-4" />
        <p class="text-gray-400">No log events found for the selected time range</p>
      </div>

      <!-- Logs List -->
      <div v-else class="space-y-2 max-h-[600px] overflow-y-auto">
        <div
          v-for="log in paginatedLogs"
          :key="log.eventId"
          class="p-3 rounded-lg border border-gray-700 hover:border-gray-600 transition-colors"
          :class="getLogBgClass(log.level)"
        >
          <div class="flex items-start gap-3">
            <!-- Level Icon -->
            <UIcon
              :name="getLogLevelIcon(log.level)"
              class="w-5 h-5 flex-shrink-0 mt-0.5"
              :class="getLogLevelColor(log.level)"
            />

            <!-- Content -->
            <div class="flex-1 min-w-0">
              <!-- Header -->
              <div class="flex items-center gap-2 mb-1">
                <span class="text-xs text-gray-500">{{ log.timestampFormatted }}</span>
                <UBadge :color="getLogLevelBadgeColor(log.level)" variant="subtle" size="xs">
                  {{ log.level }}
                </UBadge>
                <span v-if="log.invocationId" class="text-xs text-gray-600">
                  Invocation: {{ log.invocationId }}
                </span>
              </div>

              <!-- Message -->
              <div class="font-mono text-sm whitespace-pre-wrap break-all">
                <template v-if="log.isJSON && log.parsedJSON">
                  <pre class="text-xs bg-gray-900 p-2 rounded overflow-x-auto">{{ JSON.stringify(log.parsedJSON, null, 2) }}</pre>
                </template>
                <template v-else>
                  {{ log.message }}
                </template>
              </div>
            </div>

            <!-- Expand Button -->
            <UButton
              v-if="log.message.length > 200"
              color="gray"
              variant="ghost"
              size="xs"
              icon="i-heroicons-arrows-pointing-out"
              @click="expandLog(log)"
            />
          </div>
        </div>
      </div>

      <!-- Pagination -->
      <div v-if="filteredLogs.length > 0" class="flex justify-end items-center mt-4 pt-4 border-t border-gray-700">
        <UPagination
          v-model="page"
          :page-count="pageCount"
          :total="filteredLogs.length"
        />
      </div>
    </UCard>

    <!-- Log Detail Modal -->
    <USlideover v-model="showLogModal" :ui="{ width: 'max-w-3xl' }">
      <div class="flex flex-col h-full">
        <div class="flex items-center justify-between p-4 border-b border-gray-700">
          <h3 class="text-lg font-semibold">Log Details</h3>
          <UButton
            color="gray"
            variant="ghost"
            icon="i-heroicons-x-mark"
            @click="showLogModal = false"
          />
        </div>
        <div v-if="selectedLog" class="flex-1 overflow-auto p-4">
          <div class="space-y-4">
            <div>
              <p class="text-sm text-gray-400 mb-1">Timestamp</p>
              <p class="font-mono">{{ selectedLog.timestampFormatted }}</p>
            </div>
            <div>
              <p class="text-sm text-gray-400 mb-1">Level</p>
              <UBadge :color="getLogLevelBadgeColor(selectedLog.level)" variant="subtle">
                {{ selectedLog.level }}
              </UBadge>
            </div>
            <div>
              <p class="text-sm text-gray-400 mb-1">Log Stream</p>
              <p class="font-mono text-xs break-all">{{ selectedLog.logStreamName }}</p>
            </div>
            <div>
              <p class="text-sm text-gray-400 mb-1">Message</p>
              <pre class="font-mono text-sm bg-gray-900 p-4 rounded-lg overflow-x-auto whitespace-pre-wrap">{{ selectedLog.message }}</pre>
            </div>
            <div v-if="selectedLog.isJSON && selectedLog.parsedJSON">
              <p class="text-sm text-gray-400 mb-1">Parsed JSON</p>
              <pre class="font-mono text-sm bg-gray-900 p-4 rounded-lg overflow-x-auto">{{ JSON.stringify(selectedLog.parsedJSON, null, 2) }}</pre>
            </div>
          </div>
        </div>
      </div>
    </USlideover>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'

interface LogEvent {
  timestamp: number
  timestampFormatted: string
  logStreamName: string
  message: string
  eventId: string
  level: string
  parsedJSON: any | null
  isJSON: boolean
  invocationId?: string
}

// State
const loading = ref(false)
const error = ref<string | null>(null)
const logs = ref<LogEvent[]>([])
const logConfig = ref<any>(null)

// Filters
const timeRange = ref('24h')
const logLevel = ref('ALL')
const searchQuery = ref('')

// Pagination
const page = ref(1)
const pageCount = 50

// Modal
const showLogModal = ref(false)
const selectedLog = ref<LogEvent | null>(null)

// Filter options
const timeRangeOptions = [
  { label: 'Last 1 hour', value: '1h' },
  { label: 'Last 6 hours', value: '6h' },
  { label: 'Last 24 hours', value: '24h' },
  { label: 'Last 3 days', value: '3d' },
  { label: 'Last 7 days', value: '7d' },
]

const logLevelOptions = [
  { label: 'All Levels', value: 'ALL' },
  { label: 'Errors Only', value: 'ERROR' },
  { label: 'Warnings', value: 'WARN' },
  { label: 'Info', value: 'INFO' },
  { label: 'Debug', value: 'DEBUG' },
]

// Computed
const filteredLogs = computed(() => {
  return logs.value.filter((log) => {
    // Search filter
    if (searchQuery.value) {
      const query = searchQuery.value.toLowerCase()
      if (!log.message.toLowerCase().includes(query)) {
        return false
      }
    }
    return true
  })
})

const paginatedLogs = computed(() => {
  const start = (page.value - 1) * pageCount
  return filteredLogs.value.slice(start, start + pageCount)
})

const errorCount = computed(() => logs.value.filter(l => l.level === 'ERROR').length)
const warnCount = computed(() => logs.value.filter(l => l.level === 'WARN').length)
const infoCount = computed(() => logs.value.filter(l => l.level === 'INFO').length)

// Methods
function getTimeRangeMs(range: string): number {
  const hour = 60 * 60 * 1000
  const day = 24 * hour
  switch (range) {
    case '1h': return hour
    case '6h': return 6 * hour
    case '24h': return day
    case '3d': return 3 * day
    case '7d': return 7 * day
    default: return day
  }
}

function getLogLevelIcon(level: string): string {
  switch (level) {
    case 'ERROR': return 'i-heroicons-x-circle'
    case 'WARN': return 'i-heroicons-exclamation-triangle'
    case 'INFO': return 'i-heroicons-information-circle'
    case 'DEBUG': return 'i-heroicons-bug-ant'
    default: return 'i-heroicons-document-text'
  }
}

function getLogLevelColor(level: string): string {
  switch (level) {
    case 'ERROR': return 'text-red-400'
    case 'WARN': return 'text-yellow-400'
    case 'INFO': return 'text-blue-400'
    case 'DEBUG': return 'text-gray-400'
    default: return 'text-gray-400'
  }
}

function getLogLevelBadgeColor(level: string): string {
  switch (level) {
    case 'ERROR': return 'red'
    case 'WARN': return 'yellow'
    case 'INFO': return 'blue'
    case 'DEBUG': return 'gray'
    default: return 'gray'
  }
}

function getLogBgClass(level: string): string {
  switch (level) {
    case 'ERROR': return 'bg-red-900/10'
    case 'WARN': return 'bg-yellow-900/10'
    default: return 'bg-gray-800/50'
  }
}

function expandLog(log: LogEvent) {
  selectedLog.value = log
  showLogModal.value = true
}

async function fetchLogs() {
  loading.value = true
  error.value = null

  try {
    const now = Date.now()
    const startTime = now - getTimeRangeMs(timeRange.value)

    const res = await $fetch<{ success: boolean; data: any }>('/api/admin/budget-alerts/lambda-logs', {
      query: {
        startTime: startTime.toString(),
        endTime: now.toString(),
        logLevel: logLevel.value,
        limit: '1000',
      },
    })

    if (res.success && res.data) {
      logs.value = res.data.logs || []
      logConfig.value = res.data.config || null
    } else {
      throw new Error('Failed to fetch logs')
    }
  } catch (err: any) {
    console.error('Failed to fetch Lambda logs:', err)
    error.value = err.message || 'Failed to load Lambda logs'
  } finally {
    loading.value = false
  }
}

// Reset page when filters change
watch([searchQuery], () => {
  page.value = 1
})

// Refetch when time range or level changes
watch([timeRange, logLevel], () => {
  page.value = 1
  fetchLogs()
})

// Load on mount
onMounted(() => {
  fetchLogs()
})
</script>
