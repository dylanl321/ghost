<template>
  <div class="space-y-6">
    <!-- Stat Cards -->
    <div class="grid grid-cols-4 gap-4">
      <UCard>
        <div class="text-center">
          <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ stats.totalNotifications }}</p>
          <p class="text-sm text-gray-500">Total (7d)</p>
        </div>
      </UCard>
      <UCard>
        <div class="text-center">
          <p class="text-2xl font-bold text-blue-600">{{ stats.emailsSent }}</p>
          <p class="text-sm text-gray-500">Emails Sent</p>
        </div>
      </UCard>
      <UCard>
        <div class="text-center">
          <p class="text-2xl font-bold text-purple-600">{{ stats.broadcastCount }}</p>
          <p class="text-sm text-gray-500">Broadcasts</p>
        </div>
      </UCard>
      <UCard>
        <div class="text-center">
          <p class="text-2xl font-bold text-green-600">{{ stats.activeUsers }}</p>
          <p class="text-sm text-gray-500">Active Users</p>
        </div>
      </UCard>
    </div>

    <!-- By Category -->
    <UCard>
      <template #header>
        <h3 class="text-lg font-semibold">Notifications by Category</h3>
      </template>

      <UTable :rows="categoryRows" :columns="categoryColumns" :empty-state="{ icon: 'i-heroicons-chart-bar', label: 'No data available' }">
        <template #category-data="{ row }">
          <div class="flex items-center gap-2">
            <Icon :name="row.icon" class="w-4 h-4" :class="`text-${row.color}-500`" />
            <span>{{ row.label }}</span>
          </div>
        </template>
        <template #pct-data="{ row }">
          <div class="flex items-center gap-2">
            <div class="w-24 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div class="bg-blue-500 h-2 rounded-full" :style="{ width: `${row.pct}%` }" />
            </div>
            <span class="text-sm text-gray-500">{{ row.pct }}%</span>
          </div>
        </template>
      </UTable>
    </UCard>

    <!-- By Day -->
    <UCard>
      <template #header>
        <h3 class="text-lg font-semibold">Notifications by Day</h3>
      </template>

      <UTable :rows="stats.byDay" :columns="dayColumns" :empty-state="{ icon: 'i-heroicons-calendar', label: 'No data available' }">
        <template #count-data="{ row }">
          <div class="flex items-center gap-2">
            <div class="w-24 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div class="bg-green-500 h-2 rounded-full" :style="{ width: `${maxDay > 0 ? (row.count / maxDay) * 100 : 0}%` }" />
            </div>
            <span>{{ row.count }}</span>
          </div>
        </template>
      </UTable>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import { CATEGORY_DISPLAY } from '#shared/types/notifications'
import type { NotificationCategory } from '#shared/types/notifications'

const stats = ref<any>({
  totalNotifications: 0,
  byCategory: {},
  byDay: [],
  emailsSent: 0,
  digestsSent: 0,
  activeUsers: 0,
  broadcastCount: 0
})

const categoryColumns = [
  { key: 'category', label: 'Category' },
  { key: 'count', label: 'Count' },
  { key: 'pct', label: '% of Total' }
]

const dayColumns = [
  { key: 'date', label: 'Date' },
  { key: 'count', label: 'Count' }
]

const categoryRows = computed(() => {
  const total = stats.value.totalNotifications || 1
  return Object.entries(stats.value.byCategory || {}).map(([category, count]) => {
    const display = CATEGORY_DISPLAY[category as NotificationCategory]
    return {
      category,
      label: display?.label || category,
      icon: display?.icon || 'i-heroicons-bell',
      color: display?.color || 'gray',
      count: count as number,
      pct: Math.round(((count as number) / total) * 100)
    }
  }).sort((a, b) => b.count - a.count)
})

const maxDay = computed(() => {
  return Math.max(...(stats.value.byDay || []).map((d: any) => d.count), 1)
})

async function loadStats() {
  try {
    const { data } = await useFetch('/api/admin/user-notifications/stats', { params: { days: '7' } })
    const result = data.value as any
    if (result?.success) {
      stats.value = result.data
    }
  } catch {
    // Non-critical
  }
}

onMounted(() => {
  loadStats()
})
</script>
