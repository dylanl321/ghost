<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
          Strands Agent Logs
        </h3>
        <p class="text-sm text-gray-500 dark:text-gray-400">
          CloudWatch logs from Strands ECS service
        </p>
      </div>
      <div class="flex gap-2">
        <UButton
          icon="i-heroicons-arrow-path"
          label="Refresh"
          color="gray"
          variant="outline"
          :loading="loading"
          @click="fetchLogs"
        />
        <UButton
          icon="i-heroicons-arrow-down-tray"
          label="Export"
          color="gray"
          variant="outline"
          @click="exportLogs"
        />
      </div>
    </div>

    <!-- Filters -->
    <UCard>
      <div class="space-y-4">
        <!-- Time Range and Container Selection -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Time Range
            </label>
            <USelect
              v-model="timeRange"
              :options="timeRangeOptions"
              @change="handleTimeRangeChange"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Container
            </label>
            <USelect
              v-model="selectedContainer"
              :options="containerOptions"
              :loading="loadingContainers"
              @change="fetchLogs"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Log Level
            </label>
            <USelect
              v-model="logLevel"
              :options="logLevelOptions"
              @change="applyFilters"
            />
          </div>
        </div>

        <!-- Search and Filter Pattern -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <UInput
            v-model="searchQuery"
            icon="i-heroicons-magnifying-glass"
            placeholder="Search logs..."
            @input="applyFilters"
          />
          <UInput
            v-model="filterPattern"
            icon="i-heroicons-funnel"
            placeholder="CloudWatch filter pattern (advanced)"
            @keyup.enter="fetchLogs"
          >
            <template #trailing>
              <UButton
                icon="i-heroicons-funnel"
                color="gray"
                variant="link"
                size="xs"
                :disabled="!filterPattern"
                @click="fetchLogs"
              />
            </template>
          </UInput>
        </div>

        <!-- Stats -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t border-gray-200 dark:border-gray-700">
          <div>
            <div class="text-xs text-gray-500 dark:text-gray-400">Total Logs</div>
            <div class="text-lg font-semibold text-gray-900 dark:text-white">
              {{ filteredLogs.length }}
            </div>
          </div>
          <div>
            <div class="text-xs text-gray-500 dark:text-gray-400">Errors</div>
            <div class="text-lg font-semibold text-red-600 dark:text-red-400">
              {{ errorCount }}
            </div>
          </div>
          <div>
            <div class="text-xs text-gray-500 dark:text-gray-400">Warnings</div>
            <div class="text-lg font-semibold text-yellow-600 dark:text-yellow-400">
              {{ warningCount }}
            </div>
          </div>
          <div>
            <div class="text-xs text-gray-500 dark:text-gray-400">Info</div>
            <div class="text-lg font-semibold text-blue-600 dark:text-blue-400">
              {{ infoCount }}
            </div>
          </div>
        </div>
      </div>
    </UCard>

    <!-- Loading State -->
    <div v-if="loading" class="flex justify-center py-12">
      <div class="text-center">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto mb-4"></div>
        <p class="text-gray-500 dark:text-gray-400">Loading logs...</p>
      </div>
    </div>

    <!-- Error State -->
    <UAlert
      v-if="error"
      icon="i-heroicons-exclamation-triangle"
      color="red"
      variant="soft"
      :title="error"
      :close-button="{ icon: 'i-heroicons-x-mark-20-solid', color: 'red', variant: 'link' }"
      @close="error = null"
    />

    <!-- Logs Table -->
    <UCard v-if="!loading && filteredLogs.length > 0">
      <div class="overflow-x-auto">
        <div class="space-y-1">
          <div
            v-for="(log, idx) in paginatedLogs"
            :key="log.eventId || idx"
            class="flex gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors border-b border-gray-100 dark:border-gray-800 last:border-0"
            :class="{
              'bg-red-50 dark:bg-red-900/10': log.level === 'ERROR',
              'bg-yellow-50 dark:bg-yellow-900/10': log.level === 'WARN',
            }"
          >
            <!-- Timestamp -->
            <div class="flex-shrink-0 w-40">
              <div class="text-xs font-mono text-gray-500 dark:text-gray-400">
                {{ formatTimestamp(log.timestamp) }}
              </div>
              <div class="text-xs text-gray-400 dark:text-gray-500">
                {{ formatRelativeTime(log.timestamp) }}
              </div>
            </div>

            <!-- Level Badge -->
            <div class="flex-shrink-0">
              <UBadge
                :color="getLevelColor(log.level)"
                size="xs"
                class="font-mono"
              >
                {{ log.level }}
              </UBadge>
            </div>

            <!-- Message -->
            <div class="flex-1 min-w-0">
              <div
                v-if="!log.isJSON"
                class="text-sm font-mono text-gray-900 dark:text-white break-words whitespace-pre-wrap"
              >
                {{ log.message }}
              </div>
              <div v-else class="space-y-2">
                <div class="text-sm text-gray-900 dark:text-white">
                  {{ log.parsedJSON.message || 'Structured log entry' }}
                </div>
                <button
                  @click="toggleExpand(idx)"
                  class="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {{ expandedLogs[idx] ? 'Hide' : 'Show' }} Details
                </button>
                <div
                  v-if="expandedLogs[idx]"
                  class="mt-2 p-3 bg-gray-900 dark:bg-gray-950 rounded-lg overflow-x-auto"
                >
                  <pre class="text-xs text-gray-300 dark:text-gray-400">{{ JSON.stringify(log.parsedJSON, null, 2) }}</pre>
                </div>
              </div>

              <!-- Log Stream Name -->
              <div class="mt-1 text-xs text-gray-400 dark:text-gray-500">
                Stream: {{ log.logStreamName }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Pagination -->
      <div v-if="totalPages > 1" class="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
        <div class="flex justify-between items-center">
          <div class="text-sm text-gray-500 dark:text-gray-400">
            Showing {{ (currentPage - 1) * pageSize + 1 }}-{{ Math.min(currentPage * pageSize, filteredLogs.length) }} of {{ filteredLogs.length }}
          </div>
          <div class="flex gap-2">
            <UButton
              icon="i-heroicons-chevron-left"
              color="gray"
              variant="outline"
              size="sm"
              :disabled="currentPage === 1"
              @click="currentPage--"
            />
            <UButton
              v-for="page in visiblePages"
              :key="page"
              :label="String(page)"
              :color="page === currentPage ? 'primary' : 'gray'"
              :variant="page === currentPage ? 'solid' : 'outline'"
              size="sm"
              @click="currentPage = page"
            />
            <UButton
              icon="i-heroicons-chevron-right"
              color="gray"
              variant="outline"
              size="sm"
              :disabled="currentPage === totalPages"
              @click="currentPage++"
            />
          </div>
        </div>
      </div>
    </UCard>

    <!-- Empty State -->
    <UCard v-if="!loading && filteredLogs.length === 0">
      <div class="text-center py-12">
        <UIcon name="i-heroicons-document-text" class="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <p class="text-gray-500 dark:text-gray-400">
          No logs found for the selected time range and filters
        </p>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
interface LogEvent {
  timestamp: number
  logStreamName: string
  message: string
  eventId: string
  level: string
  parsedJSON: any
  isJSON: boolean
}

const loading = ref(false)
const loadingContainers = ref(false)
const error = ref<string | null>(null)
const logs = ref<LogEvent[]>([])
const expandedLogs = ref<Record<number, boolean>>({})

// Filters
const timeRange = ref('1h')
const selectedContainer = ref('agent')
const logLevel = ref('all')
const searchQuery = ref('')
const filterPattern = ref('')

// Pagination
const currentPage = ref(1)
const pageSize = 50

// Available containers
const availableContainers = ref<string[]>([])

// Time range options
const timeRangeOptions = [
  { label: 'Last 15 minutes', value: '15m' },
  { label: 'Last 1 hour', value: '1h' },
  { label: 'Last 6 hours', value: '6h' },
  { label: 'Last 24 hours', value: '24h' },
  { label: 'Last 7 days', value: '7d' }
]

// Log level options
const logLevelOptions = [
  { label: 'All Levels', value: 'all' },
  { label: 'Errors Only', value: 'ERROR' },
  { label: 'Warnings', value: 'WARN' },
  { label: 'Info', value: 'INFO' },
  { label: 'Debug', value: 'DEBUG' }
]

// Container options (computed from available containers)
const containerOptions = computed(() => {
  return availableContainers.value.map(container => ({
    label: container,
    value: container
  }))
})

// Filtered logs based on search and level
const filteredLogs = computed(() => {
  let filtered = logs.value

  // Filter by log level
  if (logLevel.value !== 'all') {
    filtered = filtered.filter(log => log.level === logLevel.value)
  }

  // Filter by search query
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    filtered = filtered.filter(log => {
      return (
        log.message.toLowerCase().includes(query) ||
        log.logStreamName.toLowerCase().includes(query) ||
        (log.isJSON && JSON.stringify(log.parsedJSON).toLowerCase().includes(query))
      )
    })
  }

  return filtered
})

// Paginated logs
const paginatedLogs = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  const end = start + pageSize
  return filteredLogs.value.slice(start, end)
})

// Pagination calculations
const totalPages = computed(() => Math.ceil(filteredLogs.value.length / pageSize))
const visiblePages = computed(() => {
  const pages: number[] = []
  const maxVisible = 5
  let start = Math.max(1, currentPage.value - Math.floor(maxVisible / 2))
  let end = Math.min(totalPages.value, start + maxVisible - 1)

  if (end - start < maxVisible - 1) {
    start = Math.max(1, end - maxVisible + 1)
  }

  for (let i = start; i <= end; i++) {
    pages.push(i)
  }

  return pages
})

// Log counts
const errorCount = computed(() => logs.value.filter(l => l.level === 'ERROR').length)
const warningCount = computed(() => logs.value.filter(l => l.level === 'WARN').length)
const infoCount = computed(() => logs.value.filter(l => l.level === 'INFO').length)

// Load available containers on mount
onMounted(async () => {
  await loadContainers()
  await fetchLogs()
})

// Load available containers
async function loadContainers() {
  loadingContainers.value = true
  try {
    const response = await $fetch('/api/admin/streaming/log-groups')
    if (response.success) {
      availableContainers.value = response.containers || ['agent']
      // Set default if not already set
      if (!selectedContainer.value && availableContainers.value.length > 0) {
        selectedContainer.value = availableContainers.value[0]
      }
    }
  } catch (e: any) {
    console.error('Error loading containers:', e)
    // Use default
    availableContainers.value = ['agent']
  } finally {
    loadingContainers.value = false
  }
}

// Fetch logs from API
async function fetchLogs() {
  loading.value = true
  error.value = null

  try {
    const { startTime, endTime } = getTimeRange(timeRange.value)

    const params: Record<string, any> = {
      startTime: startTime.toString(),
      endTime: endTime.toString(),
      containers: selectedContainer.value,
      limit: '1000'
    }

    if (filterPattern.value) {
      params.filterPattern = filterPattern.value
    }

    const response = await $fetch('/api/admin/streaming/logs', { params })

    if (response.success) {
      logs.value = response.logs
      currentPage.value = 1 // Reset to first page
    } else {
      throw new Error(response.error || 'Failed to fetch logs')
    }
  } catch (e: any) {
    error.value = e.data?.message || e.message || 'Failed to fetch logs'
    console.error('Error fetching logs:', e)
  } finally {
    loading.value = false
  }
}

// Handle time range change
function handleTimeRangeChange() {
  currentPage.value = 1
  fetchLogs()
}

// Apply filters (for client-side filtering)
function applyFilters() {
  currentPage.value = 1
}

// Get time range in milliseconds
function getTimeRange(range: string): { startTime: number; endTime: number } {
  const now = Date.now()
  let startTime: number

  switch (range) {
    case '15m':
      startTime = now - 15 * 60 * 1000
      break
    case '1h':
      startTime = now - 60 * 60 * 1000
      break
    case '6h':
      startTime = now - 6 * 60 * 60 * 1000
      break
    case '24h':
      startTime = now - 24 * 60 * 60 * 1000
      break
    case '7d':
      startTime = now - 7 * 24 * 60 * 60 * 1000
      break
    default:
      startTime = now - 60 * 60 * 1000 // Default to 1 hour
  }

  return { startTime, endTime: now }
}

// Format timestamp
function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  const ms = String(date.getMilliseconds()).padStart(3, '0')

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${ms}`
}

// Format relative time
function formatRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days}d ago`
  if (hours > 0) return `${hours}h ago`
  if (minutes > 0) return `${minutes}m ago`
  return `${seconds}s ago`
}

// Get color for log level
function getLevelColor(level: string): string {
  switch (level) {
    case 'ERROR':
      return 'red'
    case 'WARN':
      return 'yellow'
    case 'INFO':
      return 'blue'
    case 'DEBUG':
      return 'gray'
    default:
      return 'gray'
  }
}

// Toggle expand for JSON logs
function toggleExpand(idx: number) {
  expandedLogs.value[idx] = !expandedLogs.value[idx]
}

// Export logs to JSON file
function exportLogs() {
  const dataStr = JSON.stringify(filteredLogs.value, null, 2)
  const dataBlob = new Blob([dataStr], { type: 'application/json' })
  const url = URL.createObjectURL(dataBlob)
  const link = document.createElement('a')
  link.href = url
  link.download = `strands-logs-${Date.now()}.json`
  link.click()
  URL.revokeObjectURL(url)
}
</script>
