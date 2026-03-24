<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Activity Logs</h1>
        <p class="text-sm text-gray-600 dark:text-gray-400">Real-time user activity and system events</p>
      </div>

      <div class="flex items-center gap-2">
        <UButton
          icon="i-heroicons-arrow-path"
          color="gray"
          variant="soft"
          :loading="loading"
          @click="fetchLogs"
        >
          Refresh
        </UButton>
      </div>
    </div>

    <!-- Filters & Stats -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      <!-- Stats Cards -->
      <UCard class="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 border-blue-200 dark:border-blue-800">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wide">Logins</p>
            <p class="text-2xl font-bold text-blue-900 dark:text-blue-100">{{ stats.logins }}</p>
          </div>
          <div class="p-2 bg-blue-500/20 rounded-lg">
            <UIcon name="i-heroicons-arrow-right-on-rectangle" class="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
        </div>
      </UCard>

      <UCard class="bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-900/20 dark:to-emerald-800/20 border-emerald-200 dark:border-emerald-800">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">Active Users</p>
            <p class="text-2xl font-bold text-emerald-900 dark:text-emerald-100">{{ stats.uniqueUsers }}</p>
          </div>
          <div class="p-2 bg-emerald-500/20 rounded-lg">
            <UIcon name="i-heroicons-users" class="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
        </div>
      </UCard>

      <UCard class="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 border-purple-200 dark:border-purple-800">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs font-medium text-purple-600 dark:text-purple-400 uppercase tracking-wide">Page Views</p>
            <p class="text-2xl font-bold text-purple-900 dark:text-purple-100">{{ stats.pageViews }}</p>
          </div>
          <div class="p-2 bg-purple-500/20 rounded-lg">
            <UIcon name="i-heroicons-cursor-arrow-rays" class="w-5 h-5 text-purple-600 dark:text-purple-400" />
          </div>
        </div>
      </UCard>

      <UCard :class="stats.errors > 0
        ? 'bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20 border-red-200 dark:border-red-800'
        : 'bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900/20 dark:to-gray-800/20 border-gray-200 dark:border-gray-700'">
        <div class="flex items-center justify-between">
          <div>
            <p :class="stats.errors > 0
              ? 'text-xs font-medium text-red-600 dark:text-red-400 uppercase tracking-wide'
              : 'text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide'">Errors</p>
            <p :class="stats.errors > 0
              ? 'text-2xl font-bold text-red-900 dark:text-red-100'
              : 'text-2xl font-bold text-gray-900 dark:text-gray-100'">{{ stats.errors }}</p>
          </div>
          <div :class="stats.errors > 0 ? 'p-2 bg-red-500/20 rounded-lg' : 'p-2 bg-gray-500/20 rounded-lg'">
            <UIcon name="i-heroicons-exclamation-triangle" :class="stats.errors > 0
              ? 'w-5 h-5 text-red-600 dark:text-red-400'
              : 'w-5 h-5 text-gray-600 dark:text-gray-400'" />
          </div>
        </div>
      </UCard>

      <UCard class="bg-gradient-to-br from-cyan-50 to-cyan-100 dark:from-cyan-900/20 dark:to-cyan-800/20 border-cyan-200 dark:border-cyan-800">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs font-medium text-cyan-600 dark:text-cyan-400 uppercase tracking-wide">Actions</p>
            <p class="text-2xl font-bold text-cyan-900 dark:text-cyan-100">{{ stats.actions }}</p>
          </div>
          <div class="p-2 bg-cyan-500/20 rounded-lg">
            <UIcon name="i-heroicons-bolt" class="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
          </div>
        </div>
      </UCard>
    </div>

    <!-- Filters -->
    <UCard>
      <div class="flex flex-col sm:flex-row gap-3">
        <UInput
          v-model="searchQuery"
          icon="i-heroicons-magnifying-glass-20-solid"
          placeholder="Search by user, path, or message..."
          class="flex-1"
        />

        <USelectMenu
          v-model="selectedUsers"
          :options="userOptions"
          placeholder="Filter by user"
          multiple
          class="w-full sm:w-48"
        />

        <USelectMenu
          v-model="selectedTypes"
          :options="typeOptions"
          placeholder="Event type"
          multiple
          class="w-full sm:w-40"
        />

        <USelect
          v-model="timeRange"
          :options="timeRangeOptions"
          class="w-full sm:w-36"
          @change="fetchLogs"
        />
      </div>

      <div v-if="selectedUsers.length > 0 || selectedTypes.length > 0" class="mt-3 flex items-center gap-2 flex-wrap">
        <span class="text-xs text-gray-500">Active filters:</span>
        <UBadge
          v-for="user in selectedUsers"
          :key="user"
          color="blue"
          variant="soft"
          class="cursor-pointer"
          @click="selectedUsers = selectedUsers.filter(u => u !== user)"
        >
          {{ user }}
          <UIcon name="i-heroicons-x-mark" class="w-3 h-3 ml-1" />
        </UBadge>
        <UBadge
          v-for="type in selectedTypes"
          :key="type"
          color="purple"
          variant="soft"
          class="cursor-pointer"
          @click="selectedTypes = selectedTypes.filter(t => t !== type)"
        >
          {{ type }}
          <UIcon name="i-heroicons-x-mark" class="w-3 h-3 ml-1" />
        </UBadge>
        <UButton
          v-if="selectedUsers.length > 0 || selectedTypes.length > 0"
          variant="link"
          size="xs"
          color="gray"
          @click="clearFilters"
        >
          Clear all
        </UButton>
      </div>
    </UCard>

    <!-- Activity Timeline -->
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h3 class="font-semibold text-gray-900 dark:text-white">Activity Timeline</h3>
          <span class="text-sm text-gray-500">{{ filteredLogs.length }} events</span>
        </div>
      </template>

      <!-- Loading State -->
      <div v-if="loading" class="py-12 flex flex-col items-center justify-center">
        <UIcon name="i-heroicons-arrow-path" class="animate-spin w-8 h-8 text-primary-500 mb-3" />
        <p class="text-sm text-gray-500">Loading activity logs...</p>
      </div>

      <!-- Empty State -->
      <div v-else-if="filteredLogs.length === 0" class="py-12 text-center">
        <UIcon name="i-heroicons-document-magnifying-glass" class="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <p class="text-gray-600 dark:text-gray-400 font-medium">No activity found</p>
        <p class="text-sm text-gray-500 mt-1">Try adjusting your filters or time range</p>
      </div>

      <!-- Activity List -->
      <div v-else class="divide-y divide-gray-100 dark:divide-gray-800 -mx-4 sm:-mx-6">
        <div
          v-for="(log, index) in filteredLogs"
          :key="log.eventId || index"
          class="px-4 sm:px-6 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
        >
          <div class="flex items-start gap-3">
            <!-- Event Icon -->
            <div :class="getEventIconClass(log.parsed.type, log.parsed)" class="flex-shrink-0 mt-0.5">
              <UIcon :name="getEventIcon(log.parsed.type, log.parsed)" class="w-5 h-5" />
            </div>

            <!-- Event Content -->
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <!-- User Badge -->
                <span
                  v-if="log.parsed.user"
                  class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                >
                  <span class="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                  {{ log.parsed.user }}
                </span>

                <!-- Event Description -->
                <span class="text-sm text-gray-900 dark:text-white font-medium">
                  {{ getEventLabel(log.parsed.type, log.parsed) }}
                </span>

                <!-- Path Badge -->
                <NuxtLink
                  v-if="log.parsed.path"
                  :to="log.parsed.path"
                  class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  <UIcon name="i-heroicons-link" class="w-3 h-3" />
                  {{ formatPath(log.parsed.path) }}
                </NuxtLink>

                <!-- Action Type Badge -->
                <span
                  v-if="log.parsed.actionType"
                  class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300"
                >
                  <UIcon name="i-heroicons-bolt" class="w-3 h-3" />
                  {{ log.parsed.actionType }}
                </span>

                <!-- Action Detail Badge -->
                <span
                  v-if="log.parsed.actionDetail"
                  class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                >
                  {{ log.parsed.actionDetail }}
                </span>

                <!-- Account Badge -->
                <span
                  v-if="log.parsed.accountId"
                  class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                >
                  <UIcon name="i-heroicons-building-office" class="w-3 h-3" />
                  {{ log.parsed.accountId }}
                </span>
              </div>

              <!-- Additional Details -->
              <div v-if="log.parsed.details || log.parsed.error" class="mt-1.5">
                <p v-if="log.parsed.details" class="text-sm text-gray-600 dark:text-gray-400">
                  {{ log.parsed.details }}
                </p>
                <div v-if="log.parsed.error" class="mt-2 p-2 rounded bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                  <p class="text-sm text-red-700 dark:text-red-300 font-mono whitespace-pre-wrap">{{ log.parsed.error }}</p>
                </div>
              </div>

              <!-- Timestamp -->
              <div class="mt-1 flex items-center gap-2 text-xs text-gray-500">
                <UIcon name="i-heroicons-clock" class="w-3.5 h-3.5" />
                <span :title="formatFullTimestamp(log.timestamp)">{{ formatRelativeTime(log.timestamp) }}</span>
                <span class="text-gray-300 dark:text-gray-600">•</span>
                <span>{{ formatFullTimestamp(log.timestamp) }}</span>
              </div>
            </div>

            <!-- Quick Actions -->
            <div class="flex-shrink-0">
              <UDropdown :items="getLogActions(log)" :popper="{ placement: 'bottom-end' }">
                <UButton
                  color="gray"
                  variant="ghost"
                  icon="i-heroicons-ellipsis-vertical"
                  size="xs"
                />
              </UDropdown>
            </div>
          </div>
        </div>
      </div>

      <!-- Load More -->
      <div v-if="filteredLogs.length >= 50" class="mt-4 text-center">
        <UButton variant="soft" color="gray" size="sm">
          Load more events
        </UButton>
      </div>
    </UCard>

    <!-- User Activity Summary -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <!-- Top Users -->
      <UCard>
        <template #header>
          <h3 class="font-semibold text-gray-900 dark:text-white">Most Active Users</h3>
        </template>
        <div v-if="topUsers.length === 0" class="py-4 text-center text-gray-500">
          No user activity data
        </div>
        <div v-else class="space-y-3">
          <div
            v-for="(user, idx) in topUsers"
            :key="user.name"
            class="flex items-center gap-3"
          >
            <span class="w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold"
              :class="idx === 0 ? 'bg-amber-100 text-amber-700' : idx === 1 ? 'bg-gray-200 text-gray-600' : idx === 2 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500'"
            >
              {{ idx + 1 }}
            </span>
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between">
                <span class="font-medium text-gray-900 dark:text-white truncate">{{ user.name }}</span>
                <span class="text-sm text-gray-500">{{ user.count }} actions</span>
              </div>
              <div class="mt-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  class="h-full bg-primary-500 rounded-full"
                  :style="{ width: `${(user.count / (topUsers[0]?.count || 1)) * 100}%` }"
                ></div>
              </div>
            </div>
          </div>
        </div>
      </UCard>

      <!-- Popular Pages -->
      <UCard>
        <template #header>
          <h3 class="font-semibold text-gray-900 dark:text-white">Popular Pages</h3>
        </template>
        <div v-if="topPages.length === 0" class="py-4 text-center text-gray-500">
          No page view data
        </div>
        <div v-else class="space-y-2">
          <div
            v-for="page in topPages"
            :key="page.path"
            class="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <div class="flex items-center gap-2 min-w-0">
              <UIcon :name="getPageIcon(page.path)" class="w-4 h-4 text-gray-400 flex-shrink-0" />
              <NuxtLink :to="page.path" class="text-sm font-mono text-gray-700 dark:text-gray-300 truncate hover:text-primary-600">
                {{ page.path }}
              </NuxtLink>
            </div>
            <UBadge color="gray" variant="soft" size="xs">{{ page.count }}</UBadge>
          </div>
        </div>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
interface CloudWatchLog {
  eventId: string
  ingestionTime: number
  logStreamName: string
  message: string
  timestamp: number
}

interface ParsedLog {
  type: 'login' | 'navigation' | 'error' | 'action' | 'unknown'
  user?: string
  path?: string
  accountId?: string
  details?: string
  error?: string
  actionType?: string // e.g. 'cost.timeframe_change', 'account.favorite'
  actionDetail?: string // e.g. 'timeframe:30d', 'scope:favorites'
}

interface EnrichedLog extends CloudWatchLog {
  parsed: ParsedLog
}

const logs = ref<EnrichedLog[]>([])
const searchQuery = ref('')
const loading = ref(false)
const timeRange = ref<'1h' | '1d' | '1w'>('1h')
const selectedUsers = ref<string[]>([])
const selectedTypes = ref<string[]>([])

const timeRangeOptions = [
  { label: 'Last Hour', value: '1h' },
  { label: 'Last 24 Hours', value: '1d' },
  { label: 'Last 7 Days', value: '1w' },
]

const typeOptions = [
  { label: 'Login', value: 'login' },
  { label: 'Navigation', value: 'navigation' },
  { label: 'Error', value: 'error' },
  { label: 'Action', value: 'action' },
  { label: 'Cost Interaction', value: 'cost' },
  { label: 'Export', value: 'export' },
  { label: 'Favorite', value: 'favorite' },
]

const timeRangeMap = {
  '1h': 3600,
  '1d': 86400,
  '1w': 604800,
}

// Parse a raw log message into structured data
function parseLogMessage(message: string): ParsedLog {
  // Login: "Login - USER:Dylan.Lewis"
  if (message.startsWith('Login - USER:')) {
    const user = message.replace('Login - USER:', '').trim()
    return { type: 'login', user }
  }

  // Navigation: "Navigation - USER:Dylan.Lewis, PATH:/admin/monitoring"
  if (message.startsWith('Navigation - USER:')) {
    const match = message.match(/USER:([\w.@-]+),?\s*PATH:(.+)/)
    if (match) {
      return { type: 'navigation', user: match[1], path: match[2] }
    }
  }

  // Account view: "Account View - USER:Dylan.Lewis, ACCOUNT:123456789012"
  if (message.startsWith('Account View - USER:')) {
    const match = message.match(/USER:([\w.@-]+),?\s*ACCOUNT:(\d+)/)
    if (match) {
      return { type: 'navigation', user: match[1], accountId: match[2], path: `/account/${match[2]}` }
    }
  }

  // Error: "Error - ..."
  if (message.startsWith('Error -') || message.startsWith('Error:')) {
    const userMatch = message.match(/USER:([\w.@-]+)/)
    const errorText = message.replace(/^Error\s*[-:]\s*/, '').replace(/USER:[\w.@-]+,?\s*/, '')
    return { type: 'error', user: userMatch?.[1], error: errorText }
  }

  // Action: structured "Action - USER:..., TYPE:..., DETAIL:..." or legacy "Action - USER:..., ACTION:..."
  if (message.startsWith('Action - USER:')) {
    // New structured format
    const typedMatch = message.match(/USER:([\w.@-]+),?\s*TYPE:([\w.]+)(?:,?\s*DETAIL:(.+))?/)
    if (typedMatch) {
      return {
        type: 'action',
        user: typedMatch[1],
        actionType: typedMatch[2]!,
        actionDetail: typedMatch[3]?.trim(),
        details: formatActionLabel(typedMatch[2]!, typedMatch[3]?.trim())
      }
    }
    // Legacy format
    const legacyMatch = message.match(/USER:([\w.@-]+),?\s*ACTION:(.+)/)
    if (legacyMatch) {
      return { type: 'action', user: legacyMatch[1], details: legacyMatch[2] }
    }
  }

  // Try to extract user from any message
  const genericUserMatch = message.match(/USER:([\w.@-]+)/)
  return {
    type: 'unknown',
    user: genericUserMatch?.[1],
    details: message
  }
}

async function fetchLogs() {
  loading.value = true
  try {
    const duration = timeRangeMap[timeRange.value]
    const res = await fetch(`/api/logging/activity-logs?durationInSeconds=${duration}`)
    const data = await res.json()

    if (!data.success) throw new Error("Unable to fetch logs from server")

    // Parse and enrich logs
    logs.value = (data.data || []).map((log: CloudWatchLog) => ({
      ...log,
      parsed: parseLogMessage(log.message)
    }))
  } catch (err) {
    console.error('Error fetching logs:', err)
  } finally {
    loading.value = false
  }
}

// Computed: unique users for filter dropdown
const userOptions = computed(() => {
  const users = new Set<string>()
  logs.value.forEach(log => {
    if (log.parsed.user) users.add(log.parsed.user)
  })
  return Array.from(users).sort().map(u => ({ label: u, value: u }))
})

// Computed: filtered logs
const filteredLogs = computed(() => {
  let result = logs.value

  // Filter by search query
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(log =>
      log.message.toLowerCase().includes(query) ||
      log.parsed.user?.toLowerCase().includes(query) ||
      log.parsed.path?.toLowerCase().includes(query)
    )
  }

  // Filter by selected users
  if (selectedUsers.value.length > 0) {
    result = result.filter(log => log.parsed.user && selectedUsers.value.includes(log.parsed.user))
  }

  // Filter by selected types (including action subtype filters)
  if (selectedTypes.value.length > 0) {
    result = result.filter(log => {
      if (selectedTypes.value.includes(log.parsed.type)) return true
      // Check action subtype filters (cost, export, favorite)
      if (log.parsed.actionType) {
        const category = log.parsed.actionType.split('.')[0] || ''
        if (category === 'account' && selectedTypes.value.includes('favorite')) return true
        if (selectedTypes.value.includes(category)) return true
      }
      return false
    })
  }

  return result
})

// Computed: stats
const stats = computed(() => ({
  logins: logs.value.filter(l => l.parsed.type === 'login').length,
  uniqueUsers: new Set(logs.value.filter(l => l.parsed.user).map(l => l.parsed.user)).size,
  pageViews: logs.value.filter(l => l.parsed.type === 'navigation').length,
  errors: logs.value.filter(l => l.parsed.type === 'error').length,
  actions: logs.value.filter(l => l.parsed.type === 'action').length,
}))

// Computed: top users
const topUsers = computed(() => {
  const userCounts = new Map<string, number>()
  logs.value.forEach(log => {
    if (log.parsed.user) {
      userCounts.set(log.parsed.user, (userCounts.get(log.parsed.user) || 0) + 1)
    }
  })
  return Array.from(userCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
})

// Computed: top pages
const topPages = computed(() => {
  const pageCounts = new Map<string, number>()
  logs.value.forEach(log => {
    if (log.parsed.path) {
      pageCounts.set(log.parsed.path, (pageCounts.get(log.parsed.path) || 0) + 1)
    }
  })
  return Array.from(pageCounts.entries())
    .map(([path, count]) => ({ path, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
})

function clearFilters() {
  selectedUsers.value = []
  selectedTypes.value = []
}

function getActionIcon(actionType?: string): string {
  if (!actionType) return 'i-heroicons-bolt'
  const category = actionType.split('.')[0]
  switch (category) {
    case 'cost': return 'i-heroicons-currency-dollar'
    case 'export': return 'i-heroicons-arrow-down-tray'
    case 'account': return 'i-heroicons-star'
    case 'dashboard': return 'i-heroicons-squares-2x2'
    case 'search': return 'i-heroicons-magnifying-glass'
    case 'chat': return 'i-heroicons-chat-bubble-left-right'
    default: return 'i-heroicons-bolt'
  }
}

function getActionIconClass(actionType?: string): string {
  const base = 'p-1.5 rounded-lg'
  if (!actionType) return `${base} bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400`
  const category = actionType.split('.')[0]
  switch (category) {
    case 'cost': return `${base} bg-cyan-100 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400`
    case 'export': return `${base} bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400`
    case 'account': return `${base} bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400`
    case 'dashboard': return `${base} bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400`
    case 'search': return `${base} bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400`
    case 'chat': return `${base} bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400`
    default: return `${base} bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400`
  }
}

function getEventIcon(type: string, parsed?: ParsedLog): string {
  if (type === 'action' && parsed?.actionType) return getActionIcon(parsed.actionType)
  switch (type) {
    case 'login': return 'i-heroicons-arrow-right-on-rectangle'
    case 'navigation': return 'i-heroicons-cursor-arrow-rays'
    case 'error': return 'i-heroicons-exclamation-triangle'
    case 'action': return 'i-heroicons-bolt'
    default: return 'i-heroicons-document-text'
  }
}

function getEventIconClass(type: string, parsed?: ParsedLog): string {
  if (type === 'action' && parsed?.actionType) return getActionIconClass(parsed.actionType)
  const base = 'p-1.5 rounded-lg'
  switch (type) {
    case 'login': return `${base} bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400`
    case 'navigation': return `${base} bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400`
    case 'error': return `${base} bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400`
    case 'action': return `${base} bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400`
    default: return `${base} bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400`
  }
}

function getEventLabel(type: string, parsed?: ParsedLog): string {
  if (type === 'action' && parsed?.actionType) {
    const labels: Record<string, string> = {
      'cost.timeframe_change': 'changed cost timeframe',
      'cost.tab_switch': 'switched cost tab',
      'cost.mode_toggle': 'toggled cost mode',
      'cost.tag_drilldown': 'drilled into tag data',
      'cost.account_select': 'selected cost accounts',
      'account.favorite': 'favorited an account',
      'account.unfavorite': 'unfavorited an account',
      'export.csv': 'exported CSV',
      'export.json': 'exported JSON',
      'dashboard.scope_change': 'changed dashboard scope',
      'dashboard.daterange_change': 'changed date range',
      'search.explorer': 'searched accounts',
      'search.cost': 'searched costs',
      'chat.thread_create': 'created chat thread',
      'chat.thread_share': 'shared chat thread',
    }
    return labels[parsed.actionType] || 'performed action'
  }
  switch (type) {
    case 'login': return 'signed in'
    case 'navigation': return 'visited'
    case 'error': return 'encountered an error'
    case 'action': return 'performed action'
    default: return 'activity'
  }
}

function formatActionLabel(actionType: string, detail?: string): string {
  const labels: Record<string, string> = {
    'cost.timeframe_change': 'Changed cost timeframe',
    'cost.tab_switch': 'Switched cost tab',
    'cost.mode_toggle': 'Toggled cost mode',
    'cost.tag_drilldown': 'Tag data drilldown',
    'cost.account_select': 'Selected cost accounts',
    'account.favorite': 'Favorited account',
    'account.unfavorite': 'Unfavorited account',
    'export.csv': 'CSV export',
    'export.json': 'JSON export',
    'dashboard.scope_change': 'Dashboard scope change',
    'dashboard.daterange_change': 'Date range change',
    'search.explorer': 'Account search',
    'search.cost': 'Cost search',
    'chat.thread_create': 'New chat thread',
    'chat.thread_share': 'Shared chat thread',
  }
  const label = labels[actionType] || actionType
  return detail ? `${label} (${detail})` : label
}

function formatPath(path: string): string {
  // Shorten long paths for display
  if (path.length > 30) {
    const parts = path.split('/')
    if (parts.length > 3) {
      return `/${parts[1]}/.../${parts[parts.length - 1]}`
    }
  }
  return path
}

function getPageIcon(path: string): string {
  if (path.includes('/admin')) return 'i-heroicons-shield-check'
  if (path.includes('/account/costs')) return 'i-heroicons-currency-dollar'
  if (path.includes('/account/explorer')) return 'i-heroicons-magnifying-glass'
  if (path.includes('/account/')) return 'i-heroicons-building-office'
  if (path.includes('/chat')) return 'i-heroicons-chat-bubble-left-right'
  if (path.includes('/profile')) return 'i-heroicons-user-circle'
  if (path.includes('/settings')) return 'i-heroicons-cog-6-tooth'
  if (path.includes('/support')) return 'i-heroicons-question-mark-circle'
  if (path.includes('/reports')) return 'i-heroicons-document-chart-bar'
  if (path === '/') return 'i-heroicons-home'
  return 'i-heroicons-document'
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (seconds < 60) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return formatFullTimestamp(timestamp)
}

function formatFullTimestamp(timestamp: number): string {
  const d = new Date(timestamp)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function getLogActions(log: EnrichedLog) {
  const actions = []

  if (log.parsed.user) {
    actions.push([{
      label: `Filter by ${log.parsed.user}`,
      icon: 'i-heroicons-funnel',
      click: () => {
        if (!selectedUsers.value.includes(log.parsed.user!)) {
          selectedUsers.value.push(log.parsed.user!)
        }
      }
    }])
  }

  if (log.parsed.path) {
    actions.push([{
      label: 'Go to page',
      icon: 'i-heroicons-arrow-top-right-on-square',
      click: () => navigateTo(log.parsed.path!)
    }])
  }

  actions.push([{
    label: 'Copy raw message',
    icon: 'i-heroicons-clipboard-document',
    click: () => navigator.clipboard.writeText(log.message)
  }])

  return actions
}

onMounted(async () => {
  const saved = localStorage.getItem('timeRange')
  const allowed = ['1h', '1d', '1w'] as const
  timeRange.value = allowed.includes(saved as any) ? (saved as any) : '1h'
  await fetchLogs()
})

watch(timeRange, (val) => localStorage.setItem('timeRange', val))
</script>
