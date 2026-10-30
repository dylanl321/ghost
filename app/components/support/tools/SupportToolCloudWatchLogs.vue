<template>
  <div class="space-y-4">
    <!-- Mode Toggle -->
    <div class="flex items-center gap-2">
      <UButton :color="mode === 'manual' ? 'primary' : 'gray'" size="xs" @click="mode = 'manual'">
        <Icon name="i-heroicons-command-line" class="w-3.5 h-3.5 mr-1" />
        Manual Query
      </UButton>
      <UButton :color="mode === 'ai' ? 'primary' : 'gray'" size="xs" @click="mode = 'ai'">
        <Icon name="i-heroicons-sparkles" class="w-3.5 h-3.5 mr-1" />
        AI Assist
      </UButton>
    </div>

    <!-- Manual Mode -->
    <div v-if="mode === 'manual'" class="space-y-4">
      <div v-if="!supportContext.isAccountReady.value" class="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3">
        <Icon name="i-heroicons-information-circle" class="w-4 h-4 inline mr-1" />
        Select an account in the context bar above to browse log groups.
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SupportLogGroupSelector v-model="logGroup" placeholder="Select or enter log group" />
        <UInput v-model="filterPattern" placeholder="Filter pattern (e.g., ERROR, { $.statusCode = 500 })" />
      </div>
      <div class="flex gap-4 flex-wrap items-center">
        <USelect v-model="timeRange" :options="timeRangeOptions" class="w-40" />
        <UButton color="primary" :loading="loading" :disabled="!logGroup || !supportContext.isAccountReady.value" @click="searchLogs">
          <Icon name="i-heroicons-magnifying-glass" class="w-4 h-4 mr-1" />
          Search
        </UButton>
        <div class="flex items-center gap-2 text-xs text-gray-400">
          <Icon name="i-heroicons-light-bulb" class="w-3.5 h-3.5" />
          <span>Supports CloudWatch filter pattern syntax and JSON field matching.</span>
        </div>
      </div>
    </div>

    <!-- AI Mode -->
    <div v-else class="space-y-4">
      <UTextarea v-model="aiQuery" placeholder="Describe what you're looking for (e.g., 'Show errors for user john@example.com in the last 24 hours')" :rows="2" />
      <UButton color="primary" :loading="aiLoading" :disabled="!aiQuery.trim()" @click="generateLogFilter">
        <Icon name="i-heroicons-sparkles" class="w-4 h-4 mr-1" />
        Generate Filter
      </UButton>

      <div v-if="generatedFilter" class="bg-gray-100 dark:bg-gray-800 rounded-lg p-3 space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Generated Filter Pattern:</span>
          <UButton size="xs" variant="ghost" @click="copyToClipboard(generatedFilter)">
            <Icon name="i-heroicons-clipboard" class="w-4 h-4" />
          </UButton>
        </div>
        <pre class="text-sm text-gray-600 dark:text-gray-400 font-mono">{{ generatedFilter }}</pre>
        <p v-if="filterExplanation" class="text-xs text-gray-500 italic">{{ filterExplanation }}</p>
        <UButton size="sm" @click="filterPattern = generatedFilter; mode = 'manual'">
          Use This Filter
        </UButton>
      </div>
    </div>

    <!-- Results -->
    <div v-if="results.length > 0" class="space-y-2">
      <div class="flex items-center justify-between">
        <div class="text-sm text-gray-600 dark:text-gray-400">
          Found {{ results.length }} log entries
          <span v-if="hasMore" class="text-blue-600">(more available)</span>
        </div>
        <UButton size="xs" variant="ghost" color="gray" @click="exportLogs">
          <Icon name="i-heroicons-arrow-down-tray" class="w-4 h-4 mr-1" />
          Export
        </UButton>
      </div>
      <div class="max-h-96 overflow-y-auto space-y-2">
        <div v-for="(log, index) in results" :key="index" class="bg-gray-100 dark:bg-gray-800 rounded p-2 text-xs">
          <div class="flex items-center gap-2 mb-1">
            <span class="text-gray-500">{{ formatTimestamp(log.timestamp) }}</span>
            <span class="px-1.5 py-0.5 rounded text-xs font-medium" :class="getLogLevelClass(log.level)">{{ log.level }}</span>
            <span class="text-gray-500 truncate">{{ log.logStreamName }}</span>
          </div>
          <pre class="whitespace-pre-wrap text-gray-700 dark:text-gray-300 font-mono">{{ log.message }}</pre>
        </div>
      </div>
      <UButton v-if="hasMore && nextToken" variant="outline" size="sm" :loading="loadingMore" @click="loadMoreLogs">
        Load More
      </UButton>
    </div>

    <div v-if="error" class="bg-red-50 dark:bg-red-900/20 rounded-lg p-4">
      <div class="flex items-center gap-2 text-red-600 dark:text-red-400">
        <Icon name="i-heroicons-exclamation-triangle" class="w-5 h-5" />
        <span>{{ error }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const toast = useToast()
const supportContext = useSupportContext()

const timeRangeOptions = [
  { label: 'Last 1 hour', value: '1h' },
  { label: 'Last 6 hours', value: '6h' },
  { label: 'Last 24 hours', value: '24h' },
  { label: 'Last 7 days', value: '7d' },
  { label: 'Last 30 days', value: '30d' }
]

const mode = ref<'manual' | 'ai'>('manual')
const logGroup = ref('')
const filterPattern = ref('')
const timeRange = ref('24h')
const aiQuery = ref('')
const generatedFilter = ref('')
const filterExplanation = ref('')
const loading = ref(false)
const aiLoading = ref(false)
const loadingMore = ref(false)
const results = ref<any[]>([])
const hasMore = ref(false)
const nextToken = ref('')
const error = ref('')

function getTimeRangeMs(range: string): number {
  const map: Record<string, number> = { '1h': 3600000, '6h': 21600000, '24h': 86400000, '7d': 604800000, '30d': 2592000000 }
  return map[range] || map['24h']
}

function formatTimestamp(ts: number): string { return new Date(ts).toLocaleString() }

function getLogLevelClass(level: string): string {
  const classes: Record<string, string> = {
    'ERROR': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    'FATAL': 'bg-red-200 text-red-900 dark:bg-red-800 dark:text-red-100',
    'WARN': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    'INFO': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    'DEBUG': 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
    'UNKNOWN': 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
  }
  return classes[level] || classes['UNKNOWN']
}

async function searchLogs() {
  if (!logGroup.value || !supportContext.isAccountReady.value) { error.value = 'Log group and account selection are required'; return }
  loading.value = true; error.value = ''; results.value = []; nextToken.value = ''
  const now = Date.now()
  try {
    const response = await $fetch('/api/support/cloudwatch-logs', {
      params: { logGroup: logGroup.value, accountId: supportContext.state.accountId, filterPattern: filterPattern.value || undefined, environment: supportContext.state.environment, startTime: now - getTimeRangeMs(timeRange.value), endTime: now, limit: 100 }
    })
    const data = (response as any).data
    results.value = data.logs || []; hasMore.value = data.hasMore; nextToken.value = data.nextToken || ''
  } catch (err: any) {
    error.value = err.data?.error?.message || err.message || 'Failed to search logs'
  } finally { loading.value = false }
}

async function loadMoreLogs() {
  if (!nextToken.value) return
  loadingMore.value = true
  try {
    const response = await $fetch('/api/support/cloudwatch-logs', {
      params: { logGroup: logGroup.value, accountId: supportContext.state.accountId, filterPattern: filterPattern.value || undefined, environment: supportContext.state.environment, nextToken: nextToken.value, limit: 100 }
    })
    const data = (response as any).data
    results.value.push(...(data.logs || [])); hasMore.value = data.hasMore; nextToken.value = data.nextToken || ''
  } catch (err: any) {
    error.value = err.data?.error?.message || err.message || 'Failed to load more logs'
  } finally { loadingMore.value = false }
}

async function generateLogFilter() {
  if (!aiQuery.value.trim()) { error.value = 'Please describe what you want to find'; return }
  aiLoading.value = true; error.value = ''
  try {
    const response = await $fetch('/api/support/ai-query-generator', { method: 'POST', body: { naturalLanguageQuery: aiQuery.value, queryType: 'cloudwatch' } })
    const data = (response as any).data
    generatedFilter.value = data.generatedQuery; filterExplanation.value = data.explanation
  } catch (err: any) {
    error.value = err.data?.error?.message || err.message || 'Failed to generate filter'
  } finally { aiLoading.value = false }
}

function exportLogs() {
  if (!results.value.length) return
  const blob = new Blob([JSON.stringify(results.value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = `cloudwatch-logs-${Date.now()}.json`; a.click()
  URL.revokeObjectURL(url)
  toast.add({ title: 'Logs exported', icon: 'i-heroicons-arrow-down-tray', color: 'green', timeout: 2000 })
}
</script>
