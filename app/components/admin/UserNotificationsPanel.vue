<template>
  <div class="space-y-6">
    <!-- Filters -->
    <UCard>
      <div class="flex flex-wrap gap-4 items-end">
        <div class="flex-1 min-w-[200px]">
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Search</label>
          <UInput v-model="filters.search" placeholder="Search by title, body, or user..." icon="i-heroicons-magnifying-glass" @keyup.enter="loadNotifications" />
        </div>
        <div class="w-48">
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">User ID</label>
          <UInput v-model="filters.userId" placeholder="Filter by user..." />
        </div>
        <div class="w-40">
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Category</label>
          <USelectMenu v-model="filters.category" :options="categoryOptions" placeholder="All" />
        </div>
        <div class="w-36">
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
          <USelectMenu v-model="filters.status" :options="statusOptions" placeholder="All" />
        </div>
        <UButton icon="i-heroicons-magnifying-glass" @click="loadNotifications" :loading="loading">
          Search
        </UButton>
      </div>
    </UCard>

    <!-- Stats -->
    <div class="grid grid-cols-3 gap-4">
      <UCard>
        <div class="text-center">
          <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ stats.total }}</p>
          <p class="text-sm text-gray-500">Total (7d)</p>
        </div>
      </UCard>
      <UCard>
        <div class="text-center">
          <p class="text-2xl font-bold text-yellow-600">{{ stats.unreadPct }}%</p>
          <p class="text-sm text-gray-500">Unread</p>
        </div>
      </UCard>
      <UCard>
        <div class="text-center">
          <p class="text-2xl font-bold text-blue-600">{{ stats.emailPct }}%</p>
          <p class="text-sm text-gray-500">Email Sent</p>
        </div>
      </UCard>
    </div>

    <!-- Notifications Table -->
    <UCard>
      <UTable :rows="notifications" :columns="columns" :loading="loading" :empty-state="{ icon: 'i-heroicons-inbox', label: 'No notifications found' }">
        <template #userId-data="{ row }">
          <span class="text-xs font-mono truncate max-w-[160px] inline-block">{{ row.userId }}</span>
        </template>
        <template #category-data="{ row }">
          <UBadge :color="getCategoryColor(row.category)" variant="subtle" size="xs">
            {{ getCategoryLabel(row.category) }}
          </UBadge>
        </template>
        <template #severity-data="{ row }">
          <UBadge :color="row.severity === 'critical' ? 'red' : row.severity === 'warning' ? 'yellow' : 'gray'" variant="subtle" size="xs">
            {{ row.severity }}
          </UBadge>
        </template>
        <template #status-data="{ row }">
          <UBadge :color="row.status === 'unread' ? 'blue' : 'gray'" variant="subtle" size="xs">
            {{ row.status }}
          </UBadge>
        </template>
        <template #emailSent-data="{ row }">
          <Icon :name="row.emailSent ? 'i-heroicons-check-circle' : 'i-heroicons-clock'" :class="row.emailSent ? 'text-green-500' : 'text-gray-400'" class="w-5 h-5" />
        </template>
        <template #createdAt-data="{ row }">
          <span class="text-xs text-gray-500">{{ formatDate(row.createdAt) }}</span>
        </template>
      </UTable>

      <div v-if="hasMore" class="flex justify-center mt-4">
        <UButton variant="ghost" @click="loadMore" :loading="loadingMore">
          Load More
        </UButton>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import { CATEGORY_DISPLAY } from '#shared/types/notifications'
import type { NotificationCategory } from '#shared/types/notifications'

const toast = useToast()
const loading = ref(false)
const loadingMore = ref(false)
const notifications = ref<any[]>([])
const hasMore = ref(false)
const nextKey = ref<string | null>(null)

const stats = ref({ total: 0, unreadPct: 0, emailPct: 0 })

const filters = reactive({
  search: '',
  userId: '',
  category: '',
  status: ''
})

const categoryOptions = [
  { label: 'All', value: '' },
  { label: 'Budget Alert', value: 'BUDGET_THRESHOLD' },
  { label: 'Cost Anomaly', value: 'COST_ANOMALY' },
  { label: 'Cost Summary', value: 'COST_SUMMARY' },
  { label: 'Security', value: 'SECURITY_CRITICAL' },
  { label: 'Compliance', value: 'COMPLIANCE' },
  { label: 'Security Score', value: 'SECURITY_SCORE' },
  { label: 'Pipeline', value: 'PIPELINE_FAILURE' },
  { label: 'Deployment', value: 'DEPLOYMENT' },
  { label: 'Report', value: 'REPORT_READY' },
  { label: 'AI Chat', value: 'CHAT_COMPLETE' },
  { label: 'System', value: 'SYSTEM' }
]

const statusOptions = [
  { label: 'All', value: '' },
  { label: 'Unread', value: 'unread' },
  { label: 'Read', value: 'read' },
  { label: 'Archived', value: 'archived' }
]

const columns = [
  { key: 'userId', label: 'User' },
  { key: 'title', label: 'Title' },
  { key: 'category', label: 'Category' },
  { key: 'severity', label: 'Severity' },
  { key: 'status', label: 'Status' },
  { key: 'emailSent', label: 'Email' },
  { key: 'createdAt', label: 'Created' }
]

function getCategoryColor(category: NotificationCategory): string {
  return CATEGORY_DISPLAY[category]?.color || 'gray'
}

function getCategoryLabel(category: NotificationCategory): string {
  return CATEGORY_DISPLAY[category]?.label || category
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })
}

async function loadNotifications(append = false) {
  if (append) {
    loadingMore.value = true
  } else {
    loading.value = true
    nextKey.value = null
  }

  try {
    const params: Record<string, string> = { limit: '30' }
    if (filters.search) params.search = filters.search
    if (filters.userId) params.userId = filters.userId
    if (filters.category) params.category = filters.category
    if (filters.status) params.status = filters.status
    if (append && nextKey.value) params.lastKey = nextKey.value

    const { data } = await useFetch('/api/admin/user-notifications/list', { params })
    const result = data.value as any

    if (result?.success) {
      if (append) {
        notifications.value.push(...result.data.notifications)
      } else {
        notifications.value = result.data.notifications
      }
      nextKey.value = result.data.nextKey
      hasMore.value = result.data.hasMore
    }
  } catch (err: any) {
    toast.add({ title: 'Error loading notifications', description: err.message, color: 'red' })
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

async function loadStats() {
  try {
    const { data } = await useFetch('/api/admin/user-notifications/stats', { params: { days: '7' } })
    const result = data.value as any
    if (result?.success) {
      const d = result.data
      stats.value = {
        total: d.totalNotifications,
        unreadPct: d.totalNotifications > 0 ? Math.round(((d.totalNotifications - d.emailsSent) / d.totalNotifications) * 100) : 0,
        emailPct: d.totalNotifications > 0 ? Math.round((d.emailsSent / d.totalNotifications) * 100) : 0
      }
    }
  } catch {
    // Stats are supplementary, don't block
  }
}

function loadMore() {
  loadNotifications(true)
}

onMounted(() => {
  loadNotifications()
  loadStats()
})
</script>
