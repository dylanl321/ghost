<template>
  <div class="space-y-6">
    <!-- Loading state -->
    <div v-if="loading" class="flex justify-center py-12">
      <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 text-gray-400 animate-spin" />
    </div>

    <template v-else>
      <!-- Summary row -->
      <div class="flex items-center justify-between">
        <p class="text-sm text-gray-500">
          {{ sources.length }} registered source{{ sources.length === 1 ? '' : 's' }} —
          <span class="text-green-600">{{ healthyCounts.healthy }} healthy</span>
          <template v-if="healthyCounts.degraded">, <span class="text-red-600">{{ healthyCounts.degraded }} degraded</span></template>
          <template v-if="healthyCounts.stale">, <span class="text-yellow-600">{{ healthyCounts.stale }} stale</span></template>
          <template v-if="healthyCounts.unknown">, <span class="text-gray-400">{{ healthyCounts.unknown }} unknown</span></template>
        </p>
        <UButton size="xs" variant="ghost" icon="i-heroicons-arrow-path" @click="loadSources" :loading="loading">
          Refresh
        </UButton>
      </div>

      <!-- Source cards grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <UCard v-for="item in sources" :key="item.source.id">
          <div class="space-y-3">
            <!-- Header: icon + name + health dot -->
            <div class="flex items-center gap-3">
              <div class="p-2 rounded-lg" :class="triggerBgClass(item.source.triggerType)">
                <UIcon :name="item.source.icon" class="w-5 h-5" :class="triggerIconClass(item.source.triggerType)" />
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <h4 class="font-semibold text-gray-900 dark:text-white truncate">{{ item.source.name }}</h4>
                  <span class="relative flex h-2.5 w-2.5 flex-shrink-0">
                    <span
                      v-if="item.healthStatus === 'healthy'"
                      class="absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75 animate-ping"
                    />
                    <span class="relative inline-flex rounded-full h-2.5 w-2.5" :class="healthDotClass(item.healthStatus)" />
                  </span>
                </div>
                <p class="text-xs text-gray-500 truncate">{{ item.source.description }}</p>
              </div>
            </div>

            <!-- Badges row -->
            <div class="flex flex-wrap gap-1.5">
              <UBadge :color="triggerBadgeColor(item.source.triggerType)" variant="subtle" size="xs">
                {{ triggerLabel(item.source.triggerType) }}
              </UBadge>
              <UBadge v-if="item.source.handlesOwnEmail" color="yellow" variant="subtle" size="xs">
                External Email
              </UBadge>
              <UBadge v-if="item.source.cronExpression" color="gray" variant="subtle" size="xs">
                {{ item.source.cronExpression }}
              </UBadge>
            </div>

            <!-- Categories -->
            <div v-if="item.source.categories.length > 0" class="flex flex-wrap gap-1">
              <UBadge
                v-for="cat in item.source.categories"
                :key="cat"
                :color="getCategoryColor(cat)"
                variant="soft"
                size="xs"
              >
                {{ getCategoryLabel(cat) }}
              </UBadge>
            </div>
            <div v-else class="text-xs text-gray-400 italic">Processes all categories</div>

            <!-- Stats row -->
            <div class="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-800">
              <div class="flex gap-4">
                <div>
                  <p class="text-lg font-bold text-gray-900 dark:text-white">{{ item.volume24h }}</p>
                  <p class="text-xs text-gray-400">Today</p>
                </div>
                <div>
                  <p class="text-lg font-bold text-gray-900 dark:text-white">{{ item.volume7d }}</p>
                  <p class="text-xs text-gray-400">7 days</p>
                </div>
              </div>
              <div class="text-right">
                <p class="text-xs font-medium" :class="healthTextClass(item.healthStatus)">
                  {{ healthLabel(item.healthStatus) }}
                </p>
                <p v-if="item.heartbeat?.lastRun" class="text-xs text-gray-400">
                  {{ timeAgo(item.heartbeat.lastRun) }}
                </p>
                <p v-else-if="item.source.triggerType === 'cron'" class="text-xs text-gray-400">
                  No data yet
                </p>
                <p v-else class="text-xs text-gray-400">
                  On demand
                </p>
              </div>
            </div>

            <!-- Error detail if degraded -->
            <div
              v-if="item.heartbeat?.status === 'error' && item.heartbeat?.error"
              class="text-xs text-red-600 bg-red-50 dark:bg-red-900/20 p-2 rounded truncate"
              :title="item.heartbeat.error"
            >
              {{ item.heartbeat.error }}
            </div>
          </div>
        </UCard>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { CATEGORY_DISPLAY } from '#shared/types/notifications'
import type { NotificationCategory } from '#shared/types/notifications'
import type { SourceHealthInfo, SourceHealthStatus, SourceTriggerType } from '#shared/types/notification-sources'

const sources = ref<SourceHealthInfo[]>([])
const loading = ref(true)

const healthyCounts = computed(() => {
  const counts = { healthy: 0, degraded: 0, stale: 0, unknown: 0 }
  for (const s of sources.value) {
    counts[s.healthStatus]++
  }
  return counts
})

function triggerBgClass(type: SourceTriggerType) {
  return {
    cron: 'bg-blue-50 dark:bg-blue-900/20',
    'user-action': 'bg-green-50 dark:bg-green-900/20',
    'admin-action': 'bg-purple-50 dark:bg-purple-900/20'
  }[type]
}

function triggerIconClass(type: SourceTriggerType) {
  return {
    cron: 'text-blue-600 dark:text-blue-400',
    'user-action': 'text-green-600 dark:text-green-400',
    'admin-action': 'text-purple-600 dark:text-purple-400'
  }[type]
}

function triggerBadgeColor(type: SourceTriggerType) {
  return { cron: 'blue', 'user-action': 'green', 'admin-action': 'purple' }[type] as any
}

function triggerLabel(type: SourceTriggerType) {
  return { cron: 'Cron Job', 'user-action': 'User Action', 'admin-action': 'Admin Action' }[type]
}

function healthDotClass(status: SourceHealthStatus) {
  return {
    healthy: 'bg-green-500',
    degraded: 'bg-red-500',
    stale: 'bg-yellow-500',
    unknown: 'bg-gray-400'
  }[status]
}

function healthTextClass(status: SourceHealthStatus) {
  return {
    healthy: 'text-green-600',
    degraded: 'text-red-600',
    stale: 'text-yellow-600',
    unknown: 'text-gray-400'
  }[status]
}

function healthLabel(status: SourceHealthStatus) {
  return { healthy: 'Healthy', degraded: 'Degraded', stale: 'Stale', unknown: 'Unknown' }[status]
}

function getCategoryColor(cat: string) {
  return (CATEGORY_DISPLAY[cat as NotificationCategory]?.color || 'gray') as any
}

function getCategoryLabel(cat: string) {
  return CATEGORY_DISPLAY[cat as NotificationCategory]?.label || cat
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

async function loadSources() {
  loading.value = true
  try {
    const res = await $fetch<any>('/api/admin/user-notifications/sources')
    if (res?.success) {
      sources.value = res.data
    }
  } catch {
    // Fallback: show empty
  } finally {
    loading.value = false
  }
}

onMounted(loadSources)
</script>
