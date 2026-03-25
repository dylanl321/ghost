<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
    <!-- Access Denied -->
    <div v-if="!hasAdminAccess" class="flex items-center justify-center min-h-screen p-6">
      <UCard class="max-w-2xl">
        <div class="p-8 text-center">
          <Icon name="i-heroicons-shield-exclamation" class="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">Access Denied</h1>
          <p class="text-gray-600 dark:text-gray-400 mb-6">
            You don't have permission to access the admin panel. This area is restricted to administrators only.
          </p>
          <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 mb-6 text-left">
            <h3 class="text-sm font-semibold text-gray-900 dark:text-white mb-2">To get admin access:</h3>
            <ul class="text-sm text-gray-600 dark:text-gray-400 space-y-1 list-disc list-inside">
              <li>You must be a member of the <code class="text-blue-600 dark:text-blue-400">AWS-Product-Team</code> group</li>
              <li>Contact your manager to request access</li>
              <li>Submit a SailPoint request for the AWS-Product-Team group</li>
            </ul>
          </div>
          <div class="flex flex-col sm:flex-row gap-3 justify-center">
            <UButton color="emerald" @click="navigateTo('/')">
              <Icon name="i-heroicons-home" class="w-4 h-4 mr-2" />
              Go to Dashboard
            </UButton>
            <UButton color="gray" variant="soft" @click="navigateTo('/profile')">
              <Icon name="i-heroicons-user-circle" class="w-4 h-4 mr-2" />
              View My Profile
            </UButton>
          </div>
        </div>
      </UCard>
    </div>

    <!-- Admin Dashboard Content -->
    <div v-else class="container mx-auto px-6 py-8 max-w-7xl">
      <!-- Header -->
      <div class="mb-6">
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-2">Admin Dashboard</h1>
        <p class="text-gray-600 dark:text-gray-400">System overview and quick actions</p>
      </div>

      <!-- Error Alert -->
      <div v-if="metricsError" class="mb-6">
        <UAlert color="red" icon="i-heroicons-exclamation-triangle" :title="metricsError">
          <template #actions>
            <UButton color="red" variant="soft" size="xs" @click="fetchMetrics" :loading="loading">Retry</UButton>
          </template>
        </UAlert>
      </div>

      <!-- Quick Actions -->
      <div class="mb-6">
        <h2 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Quick Actions</h2>
        <div class="flex flex-wrap gap-3">
          <UButton color="gray" variant="soft" icon="i-heroicons-clipboard-document-check" @click="navigateTo('/admin/costs/data-validation')">
            Run Validation
          </UButton>
          <UButton color="gray" variant="soft" icon="i-heroicons-heart" @click="navigateTo('/admin/ai?tab=agent-health')">
            Check Agent Health
          </UButton>
          <UButton color="gray" variant="soft" icon="i-heroicons-exclamation-triangle" @click="navigateTo('/admin/users?tab=feedback')">
            View Feedback
          </UButton>
          <UButton color="gray" variant="soft" icon="i-heroicons-bell-alert" @click="navigateTo('/admin/costs/budget-alerts')">
            Budget Alerts
          </UButton>
          <UButton color="gray" variant="soft" icon="i-heroicons-tag" @click="navigateTo('/admin/costs/tag-compliance')">
            Tag Compliance
          </UButton>
          <UButton color="gray" variant="soft" icon="i-heroicons-chat-bubble-bottom-center-text" @click="navigateTo('/admin/popup')">
            Popup Message
          </UButton>
        </div>
      </div>

      <!-- System Health, Activity Chart, Quick Stats -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <!-- System Health Status -->
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="font-semibold text-gray-900 dark:text-white">System Health</h3>
              <Icon name="i-heroicons-heart" class="w-5 h-5 text-red-500" />
            </div>
          </template>
          <div class="space-y-3">
            <div v-for="service in systemHealth" :key="service.name" class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <div
                  class="w-2 h-2 rounded-full"
                  :class="service.status === 'healthy' ? 'bg-green-500' : service.status === 'degraded' ? 'bg-yellow-500' : 'bg-red-500'"
                ></div>
                <span class="text-sm text-gray-700 dark:text-gray-300">{{ service.name }}</span>
              </div>
              <span class="text-xs text-gray-500">{{ service.responseTime }}</span>
            </div>
          </div>
        </UCard>

        <!-- Activity Chart -->
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="font-semibold text-gray-900 dark:text-white">User Activity (7d)</h3>
              <Icon name="i-heroicons-chart-bar" class="w-5 h-5 text-blue-500" />
            </div>
          </template>
          <div class="space-y-2">
            <div v-for="day in activityData" :key="day.day" class="flex items-center gap-2">
              <span class="text-xs text-gray-600 dark:text-gray-400 w-8">{{ day.day }}</span>
              <div class="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  class="bg-blue-500 h-2 rounded-full transition-all"
                  :style="{ width: `${Math.min(100, (day.users / maxActivityUsers) * 100)}%` }"
                ></div>
              </div>
              <span class="text-xs font-medium text-gray-700 dark:text-gray-300 w-8">{{ day.users }}</span>
            </div>
          </div>
        </UCard>

        <!-- Quick Stats -->
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="font-semibold text-gray-900 dark:text-white">Quick Stats</h3>
              <Icon name="i-heroicons-chart-pie" class="w-5 h-5 text-gray-500" />
            </div>
          </template>
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-sm text-gray-600 dark:text-gray-400">Total Users</span>
              <span class="text-sm font-semibold text-gray-900 dark:text-white">{{ loading ? '...' : totalUsers }}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-sm text-gray-600 dark:text-gray-400">Chat Threads</span>
              <span class="text-sm font-semibold text-gray-900 dark:text-white">{{ loading ? '...' : aiChatSessions }}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-sm text-gray-600 dark:text-gray-400">Share Links</span>
              <span class="text-sm font-semibold text-gray-900 dark:text-white">{{ loading ? '...' : shortlinksTotal }}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-sm text-gray-600 dark:text-gray-400">Scheduled Reports</span>
              <span class="text-sm font-semibold text-gray-900 dark:text-white">{{ loading ? '...' : scheduledReportsCount }}</span>
            </div>
          </div>
        </UCard>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const logger = createLogger('Index')

definePageMeta({
  layout: 'admin',
  middleware: 'auth-permission',
  permission: 'admin',
  title: 'Admin Dashboard',
  description: 'Manage GHOST application settings and system configuration'
})

const { isAdmin } = useUserRoles()
const hasAdminAccess = computed(() => isAdmin.value)

// System health status
const systemHealth = ref([
  { name: 'API Gateway', status: 'healthy', responseTime: '<100ms' },
  { name: 'Database', status: 'healthy', responseTime: '50ms' },
  { name: 'AWS Services', status: 'healthy', responseTime: '200ms' },
  { name: 'Strands AI', status: 'healthy', responseTime: '1.2s' },
])

// User activity data (last 7 days)
const activityData = ref([
  { day: 'Mon', users: 0 },
  { day: 'Tue', users: 0 },
  { day: 'Wed', users: 0 },
  { day: 'Thu', users: 0 },
  { day: 'Fri', users: 0 },
  { day: 'Sat', users: 0 },
  { day: 'Sun', users: 0 },
])

// Stats
const totalUsers = ref(0)
const shortlinksTotal = ref(0)
const aiChatSessions = ref(0)
const aiChatsToday = ref(0)
const scheduledReportsCount = ref(0)
const loading = ref(true)
const metricsError = ref<string | null>(null)

const maxActivityUsers = computed(() => Math.max(1, ...activityData.value.map(d => d.users)))

const { total, fetchShortlinks } = useShortlinks()

const fetchMetrics = async () => {
  try {
    loading.value = true
    metricsError.value = null

    const [
      userPrefsResult,
      chatMetrics24hResult,
      chatMetricsAllResult,
      reportsResult,
      chatMetrics7dResult,
      strandsHealthResult
    ] = await Promise.allSettled([
      $fetch('/api/admin/user-preferences', { query: { limit: 5000 } }),
      $fetch('/api/admin/chat/metrics', { query: { period: '24h' } }),
      $fetch('/api/admin/chat/metrics', { query: { period: 'all' } }),
      $fetch('/api/admin/scheduled-reports/stats'),
      $fetch('/api/admin/chat/metrics', { query: { period: '7d' } }),
      $fetch('/api/admin/strands-health')
    ])

    await fetchShortlinks({ limit: 1 })
    shortlinksTotal.value = total.value

    if (userPrefsResult.status === 'fulfilled') {
      totalUsers.value = userPrefsResult.value.data.total || 0
    }

    if (chatMetrics24hResult.status === 'fulfilled') {
      aiChatsToday.value = chatMetrics24hResult.value.metrics.totalQueries || 0
    }

    if (chatMetricsAllResult.status === 'fulfilled') {
      aiChatSessions.value = chatMetricsAllResult.value.metrics.totalThreads || 0
    }

    if (reportsResult.status === 'fulfilled') {
      scheduledReportsCount.value = reportsResult.value.data.totalReports || 0
    }

    if (chatMetrics7dResult.status === 'fulfilled') {
      const dailyAvg = Math.floor((chatMetrics7dResult.value.metrics.uniqueUsers || 0) / 7)
      activityData.value = activityData.value.map((day) => ({
        ...day,
        users: dailyAvg
      }))
    }

    if (strandsHealthResult.status === 'fulfilled') {
      const healthData = strandsHealthResult.value as any
      const strandsStatus = healthData?.healthy ? 'healthy' : 'degraded'
      const strandsLatency = healthData?.results?.health?.service?.latency
        ? `${healthData.results.health.service.latency}ms`
        : 'N/A'
      const strandsIndex = systemHealth.value.findIndex(s => s.name === 'Strands AI')
      if (strandsIndex !== -1) {
        systemHealth.value[strandsIndex] = { name: 'Strands AI', status: strandsStatus, responseTime: strandsLatency }
      }
    } else {
      const strandsIndex = systemHealth.value.findIndex(s => s.name === 'Strands AI')
      if (strandsIndex !== -1) {
        systemHealth.value[strandsIndex] = { name: 'Strands AI', status: 'degraded', responseTime: 'Error' }
      }
    }

  } catch (error) {
    logger.error('Failed to fetch admin metrics:', error)
    metricsError.value = 'Failed to load dashboard metrics. Please try again.'
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  if (hasAdminAccess.value) {
    await fetchMetrics()
  }
})
</script>
