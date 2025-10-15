<template>
  <div class="py-8 px-4 max-w-7xl mx-auto space-y-6">

    <!-- Header -->
    <div class="flex justify-between items-center">
      <div>
        <h1 class="text-2xl font-bold">Application Logs</h1>
        <p class="text-sm text-gray-600 dark:text-gray-400">View and filter application logs</p>
      </div>

      <UButton
        icon="i-heroicons-arrow-path"
        color="gray"
        :loading="loading"
        @click="fetchLogs"
      >
        Refresh
      </UButton>
    </div>

    <!-- Filters -->
    <UCard class="space-y-4">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <UInput
          v-model="searchQuery"
          icon="i-heroicons-magnifying-glass-20-solid"
          placeholder="Search logs..."
          class="sm:w-1/3"
        />

        <div class="flex items-center gap-2">
          <USelect
            v-model="timeRange"
            :options="[
              { label: 'Last 1 Hour', value: '1h' },
              { label: 'Last 1 Day', value: '1d' },
              { label: 'Last 1 Week', value: '1w' },
            ]"
            class="sm:w-40"
            @change="fetchLogs"
          />
          <span class="text-sm text-gray-500">
            {{ filteredLogs.length }} result{{ filteredLogs.length !== 1 ? 's' : '' }}
          </span>
        </div>
      </div>

      <!-- Metrics -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <UCard variant="soft">
          <div class="text-sm text-gray-400">User logins</div>
          <p class="text-2xl font-bold">{{ logins }}</p>
        </UCard>

        <UCard variant="soft">
          <div class="text-sm text-gray-400">Unique users</div>
          <p class="text-2xl font-bold">{{ uniqueUsers }}</p>
        </UCard>

        <UCard variant="soft">
          <div class="text-sm text-gray-400">Pages visited</div>
          <p class="text-2xl font-bold">{{ pagesVisited }}</p>
        </UCard>

        <UCard variant="soft" color="red">
          <div class="text-sm text-gray-400">Errors</div>
          <p class="text-2xl font-bold">{{ errorCount }}</p>
        </UCard>
      </div>
    </UCard>

    <!-- Logs Table -->
    <UCard>
      <div v-if="loading" class="py-8 flex justify-center">
        <UIcon name="i-heroicons-arrow-path" class="animate-spin w-6 h-6 text-gray-500" />
      </div>

      <UTable
        v-else
        :rows="filteredLogs"
        :columns="columns"
        class="text-sm"
      >
        <template #timestamp-data="{ row }">
          <span class="text-gray-500">{{ formatTimestamp(row.timestamp) }}</span>
        </template>

        <template #message-data="{ row, index }">
          <div>
            <p :class="{ 'log-line-clamp': !expandedLogs[index] && row.message.startsWith('Error') }">
              {{ row.message }}
            </p>
            <UButton
              v-if="row.message.startsWith('Error')"
              variant="link"
              size="xs"
              @click="toggleExpand(index)"
            >
              {{ expandedLogs[index] ? 'Show Less' : 'Show More' }}
            </UButton>
          </div>
        </template>
      </UTable>
    </UCard>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'

interface CloudWatchLog {
  eventId: string
  ingestionTime: number
  logStreamName: string
  message: string
  timestamp: number
}

const logs = ref<CloudWatchLog[]>([])
const searchQuery = ref('')
const loading = ref(false)
const expandedLogs = ref<boolean[]>([])
const timeRange = ref<'1h' | '1d' | '1w'>('1h')

const columns = [
  { key: 'timestamp', label: 'Timestamp', class: 'w-40' },
  { key: 'message', label: 'Message' },
]

const timeRangeMap = {
  '1h': 3600,
  '1d': 86400,
  '1w': 604800,
}

async function fetchLogs() {
  loading.value = true
  try {
    const duration = timeRangeMap[timeRange.value]
    const res = await fetch(`/api/logging/activity-logs?durationInSeconds=${duration}`)
    const data = await res.json()

    if (data.error) throw new Error(data.error)
    logs.value = data
    expandedLogs.value = new Array(data.length).fill(false)
  } catch (err) {
    console.error('Error fetching logs:', err)
  } finally {
    loading.value = false
  }
}

function toggleExpand(index: number) {
  expandedLogs.value[index] = !expandedLogs.value[index]
}

const filteredLogs = computed(() => {
  if (!searchQuery.value) return logs.value
  return logs.value.filter(log =>
    log.message.toLowerCase().includes(searchQuery.value.toLowerCase())
  )
})

const logins = computed(() => logs.value.filter(l => l.message.startsWith('Login - USER:')).length)
const pagesVisited = computed(() => logs.value.filter(l => l.message.startsWith('Navigation - USER:')).length)
const uniqueUsers = computed(() => {
  const users = new Set<string>()
  logs.value.forEach(l => {
    const match = l.message.match(/USER:([\w.@-]+)/)
    if (match) users.add(match[1])
  })
  return users.size
})
const errorCount = computed(() => logs.value.filter(l => l.message.startsWith('Error -')).length)

function formatTimestamp(timestamp: number) {
  const d = new Date(timestamp)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

onMounted(async () => {
  const saved = localStorage.getItem('timeRange')
  const allowed = ['1h', '1d', '1w'] as const
  timeRange.value = allowed.includes(saved as any) ? (saved as any) : '1h'
  await fetchLogs()
})

watch(timeRange, (val) => localStorage.setItem('timeRange', val))
</script>

<style scoped>
.log-line-clamp {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 1;
  overflow: hidden;
}
</style>
