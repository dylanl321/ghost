<template>
  <div class="space-y-6">
    <!-- System Status Banner -->
    <div
      v-if="!config.notificationsEnabled"
      class="flex items-center gap-3 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"
    >
      <UIcon name="i-heroicons-exclamation-triangle" class="w-6 h-6 text-red-600 flex-shrink-0" />
      <div>
        <p class="font-semibold text-red-800 dark:text-red-300">Notification System Disabled</p>
        <p class="text-sm text-red-600 dark:text-red-400">All notifications are currently suppressed. Enable in Configuration tab.</p>
      </div>
    </div>

    <div
      v-if="config.dryRunEnabled"
      class="flex items-center gap-3 p-4 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800"
    >
      <UIcon name="i-heroicons-beaker" class="w-6 h-6 text-yellow-600 flex-shrink-0" />
      <div>
        <p class="font-semibold text-yellow-800 dark:text-yellow-300">Dry-Run Mode Active</p>
        <p class="text-sm text-yellow-600 dark:text-yellow-400">
          All notifications are being redirected to <strong>{{ config.dryRunRedirectTo }}</strong> instead of individual users.
        </p>
      </div>
      <UButton size="xs" color="yellow" variant="outline" class="ml-auto flex-shrink-0" @click="disableDryRun" :loading="savingConfig">
        Disable
      </UButton>
    </div>

    <!-- Stat Cards -->
    <div class="grid grid-cols-2 lg:grid-cols-5 gap-4">
      <UCard>
        <div class="flex items-center gap-3">
          <div class="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20">
            <UIcon name="i-heroicons-inbox-stack" class="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ stats.totalNotifications }}</p>
            <p class="text-xs text-gray-500">Total (7d)</p>
          </div>
        </div>
      </UCard>

      <UCard>
        <div class="flex items-center gap-3">
          <div class="p-2 rounded-lg bg-green-50 dark:bg-green-900/20">
            <UIcon name="i-heroicons-envelope" class="w-5 h-5 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <p class="text-2xl font-bold text-green-600">{{ stats.emailsSent }}</p>
            <p class="text-xs text-gray-500">Emails Sent</p>
          </div>
        </div>
      </UCard>

      <UCard>
        <div class="flex items-center gap-3">
          <div class="p-2 rounded-lg bg-purple-50 dark:bg-purple-900/20">
            <UIcon name="i-heroicons-megaphone" class="w-5 h-5 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <p class="text-2xl font-bold text-purple-600">{{ stats.broadcastCount }}</p>
            <p class="text-xs text-gray-500">Broadcasts</p>
          </div>
        </div>
      </UCard>

      <UCard>
        <div class="flex items-center gap-3">
          <div class="p-2 rounded-lg bg-orange-50 dark:bg-orange-900/20">
            <UIcon name="i-heroicons-users" class="w-5 h-5 text-orange-600 dark:text-orange-400" />
          </div>
          <div>
            <p class="text-2xl font-bold text-orange-600">{{ stats.activeUsers }}</p>
            <p class="text-xs text-gray-500">Active Users</p>
          </div>
        </div>
      </UCard>

      <UCard>
        <div class="flex items-center gap-3">
          <div class="p-2 rounded-lg bg-pink-50 dark:bg-pink-900/20">
            <UIcon name="i-heroicons-envelope-open" class="w-5 h-5 text-pink-600 dark:text-pink-400" />
          </div>
          <div>
            <p class="text-2xl font-bold text-pink-600">{{ stats.digestsSent }}</p>
            <p class="text-xs text-gray-500">Digests Sent</p>
          </div>
        </div>
      </UCard>
    </div>

    <!-- Two-column layout -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- By Category -->
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-tag" class="w-5 h-5 text-gray-500" />
            <h3 class="font-semibold text-gray-900 dark:text-white">Volume by Category</h3>
          </div>
        </template>

        <div v-if="categoryRows.length === 0" class="text-center py-8 text-gray-400 text-sm">
          No notifications in the last 7 days
        </div>
        <div v-else class="space-y-3">
          <div v-for="row in categoryRows" :key="row.category" class="flex items-center gap-3">
            <div class="flex items-center gap-2 w-36 flex-shrink-0">
              <UIcon :name="row.icon" class="w-4 h-4 flex-shrink-0" :class="`text-${row.color}-500`" />
              <span class="text-sm text-gray-700 dark:text-gray-300 truncate">{{ row.label }}</span>
            </div>
            <div class="flex-1">
              <div class="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2.5">
                <div
                  class="h-2.5 rounded-full transition-all"
                  :class="`bg-${row.color}-500`"
                  :style="{ width: `${row.pct}%` }"
                />
              </div>
            </div>
            <span class="text-sm font-medium text-gray-900 dark:text-white w-12 text-right">{{ row.count }}</span>
          </div>
        </div>
      </UCard>

      <!-- Daily Volume -->
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-calendar-days" class="w-5 h-5 text-gray-500" />
            <h3 class="font-semibold text-gray-900 dark:text-white">Daily Volume (7d)</h3>
          </div>
        </template>

        <div v-if="!stats.byDay?.length" class="text-center py-8 text-gray-400 text-sm">
          No data available
        </div>
        <div v-else class="space-y-2">
          <div v-for="day in stats.byDay" :key="day.date" class="flex items-center gap-3">
            <span class="text-sm text-gray-500 w-20 flex-shrink-0">{{ formatDay(day.date) }}</span>
            <div class="flex-1">
              <div class="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2.5">
                <div
                  class="bg-emerald-500 h-2.5 rounded-full transition-all"
                  :style="{ width: `${maxDay > 0 ? (day.count / maxDay) * 100 : 0}%` }"
                />
              </div>
            </div>
            <span class="text-sm font-medium text-gray-900 dark:text-white w-12 text-right">{{ day.count }}</span>
          </div>
        </div>
      </UCard>
    </div>

    <!-- System Health -->
    <UCard>
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-heroicons-server-stack" class="w-5 h-5 text-gray-500" />
          <h3 class="font-semibold text-gray-900 dark:text-white">System Status</h3>
        </div>
      </template>

      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-slate-800">
          <span class="relative flex h-3 w-3">
            <span
              class="absolute inline-flex h-full w-full rounded-full opacity-75"
              :class="config.notificationsEnabled ? 'animate-ping bg-green-400' : 'bg-red-400'"
            />
            <span class="relative inline-flex rounded-full h-3 w-3" :class="config.notificationsEnabled ? 'bg-green-500' : 'bg-red-500'" />
          </span>
          <div>
            <p class="text-sm font-medium text-gray-900 dark:text-white">Notifications</p>
            <p class="text-xs text-gray-500">{{ config.notificationsEnabled ? 'Enabled' : 'Disabled' }}</p>
          </div>
        </div>

        <div class="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-slate-800">
          <span class="relative flex h-3 w-3">
            <span
              class="absolute inline-flex h-full w-full rounded-full opacity-75"
              :class="config.digestEnabled ? 'animate-ping bg-green-400' : 'bg-gray-400'"
            />
            <span class="relative inline-flex rounded-full h-3 w-3" :class="config.digestEnabled ? 'bg-green-500' : 'bg-gray-500'" />
          </span>
          <div>
            <p class="text-sm font-medium text-gray-900 dark:text-white">Email Digest</p>
            <p class="text-xs text-gray-500">{{ config.digestEnabled ? 'Enabled' : 'Disabled' }}</p>
          </div>
        </div>

        <div class="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-slate-800">
          <span class="relative flex h-3 w-3">
            <span
              class="absolute inline-flex h-full w-full rounded-full opacity-75"
              :class="config.dryRunEnabled ? 'animate-ping bg-yellow-400' : 'bg-gray-400'"
            />
            <span class="relative inline-flex rounded-full h-3 w-3" :class="config.dryRunEnabled ? 'bg-yellow-500' : 'bg-gray-500'" />
          </span>
          <div>
            <p class="text-sm font-medium text-gray-900 dark:text-white">Dry-Run</p>
            <p class="text-xs text-gray-500">{{ config.dryRunEnabled ? 'Active' : 'Off' }}</p>
          </div>
        </div>

        <div class="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-slate-800">
          <span class="relative flex h-3 w-3">
            <span class="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
          </span>
          <div>
            <p class="text-sm font-medium text-gray-900 dark:text-white">SSE Push</p>
            <p class="text-xs text-gray-500">Available</p>
          </div>
        </div>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import { CATEGORY_DISPLAY } from '#shared/types/notifications'
import type { NotificationCategory } from '#shared/types/notifications'

const toast = useToast()
const savingConfig = ref(false)

const stats = ref<any>({
  totalNotifications: 0,
  byCategory: {},
  byDay: [],
  emailsSent: 0,
  digestsSent: 0,
  activeUsers: 0,
  broadcastCount: 0
})

const config = ref({
  notificationsEnabled: true,
  digestEnabled: true,
  dryRunEnabled: false,
  dryRunRedirectTo: ''
})

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

function formatDay(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00')
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

async function disableDryRun() {
  savingConfig.value = true
  try {
    await $fetch('/api/admin/user-notifications/config', {
      method: 'PUT',
      body: { dryRunEnabled: false }
    })
    config.value.dryRunEnabled = false
    toast.add({ title: 'Dry-run disabled', description: 'Notifications will now be delivered to individual users.', color: 'green' })
  } catch {
    toast.add({ title: 'Failed to disable dry-run', color: 'red' })
  } finally {
    savingConfig.value = false
  }
}

onMounted(async () => {
  // Load stats and config in parallel
  const [statsRes, configRes] = await Promise.all([
    $fetch<any>('/api/admin/user-notifications/stats', { params: { days: '7' } }).catch(() => null),
    $fetch<any>('/api/admin/user-notifications/config').catch(() => null)
  ])

  if (statsRes?.success) {
    stats.value = statsRes.data
  }
  if (configRes?.success) {
    config.value = configRes.data
  }
})
</script>
