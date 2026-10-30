<template>
  <div>
    <!-- Page Header -->
    <div class="mb-8">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Notifications</h1>
      <p class="mt-1 text-gray-500 dark:text-gray-400">
        Manage notification delivery, email digest settings, and view your notification history.
      </p>
    </div>

    <div class="space-y-8">
      <!-- Preferences Section -->
      <NotificationPreferencesEnhanced />

      <!-- Notification History -->
      <div>
        <div class="flex items-center gap-3 mb-4">
          <div class="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/20">
            <UIcon name="i-heroicons-inbox-stack" class="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Notification History</h2>
            <p class="text-sm text-gray-500 dark:text-gray-400">
              View your recent notifications
            </p>
          </div>
        </div>

        <UCard>
          <!-- Filters -->
          <div class="flex gap-3 mb-4">
            <UInput v-model="searchText" placeholder="Search notifications..." icon="i-heroicons-magnifying-glass" class="flex-1" />
            <USelectMenu
              v-model="categoryFilter"
              :options="categoryFilterOptions"
              option-attribute="label"
              value-attribute="value"
              placeholder="Category"
              class="w-40"
            />
          </div>

          <!-- History Table -->
          <UTable :rows="filteredNotifications" :columns="historyColumns" :loading="isLoading" :empty-state="{ icon: 'i-heroicons-inbox', label: 'No notifications yet' }">
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
            <template #createdAt-data="{ row }">
              <span class="text-xs text-gray-500">{{ formatDateTime(row.createdAt) }}</span>
            </template>
          </UTable>

          <div v-if="hasMore" class="flex justify-center mt-4">
            <UButton variant="ghost" @click="loadMore" :loading="isLoading">
              Load More
            </UButton>
          </div>
        </UCard>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { CATEGORY_DISPLAY } from '#shared/types/notifications'
import type { NotificationCategory } from '#shared/types/notifications'

definePageMeta({
  layout: 'settings'
})

const { notifications, isLoading, hasMore, fetchNotifications, loadMore } = useNotifications()

const searchText = ref('')
const categoryFilter = ref('')

const categoryFilterOptions = [
  { label: 'All Categories', value: '' },
  { label: 'Budget', value: 'BUDGET_THRESHOLD' },
  { label: 'Cost Anomaly', value: 'COST_ANOMALY' },
  { label: 'Security', value: 'SECURITY_CRITICAL' },
  { label: 'Compliance', value: 'COMPLIANCE' },
  { label: 'Pipeline', value: 'PIPELINE_FAILURE' },
  { label: 'Deployment', value: 'DEPLOYMENT' },
  { label: 'System', value: 'SYSTEM' }
]

const historyColumns = [
  { key: 'title', label: 'Title' },
  { key: 'category', label: 'Category' },
  { key: 'severity', label: 'Severity' },
  { key: 'status', label: 'Status' },
  { key: 'createdAt', label: 'Date' }
]

const filteredNotifications = computed(() => {
  let items = notifications.value as any[]
  if (searchText.value) {
    const search = searchText.value.toLowerCase()
    items = items.filter(n => n.title.toLowerCase().includes(search) || n.body.toLowerCase().includes(search))
  }
  if (categoryFilter.value) {
    items = items.filter(n => n.category === categoryFilter.value)
  }
  return items
})

function getCategoryColor(category: NotificationCategory): string {
  return CATEGORY_DISPLAY[category]?.color || 'gray'
}

function getCategoryLabel(category: NotificationCategory): string {
  return CATEGORY_DISPLAY[category]?.label || category
}

const { formatDateTime } = useDateFormatter()

onMounted(() => {
  fetchNotifications()
})
</script>
