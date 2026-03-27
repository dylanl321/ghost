<template>
  <div class="space-y-4">
    <!-- Filters -->
    <div class="flex flex-wrap items-center gap-3">
      <UButtonGroup>
        <UButton
          v-for="opt in sourceOptions"
          :key="opt.value"
          :color="sourceFilter === opt.value ? 'primary' : 'gray'"
          :variant="sourceFilter === opt.value ? 'solid' : 'ghost'"
          size="sm"
          @click="changeSource(opt.value)"
        >
          {{ opt.label }}
        </UButton>
      </UButtonGroup>

      <USelectMenu
        v-model="categoryFilter"
        :options="categoryOptions"
        placeholder="All Categories"
        size="sm"
        class="w-48"
        @change="loadFeed(true)"
      />
    </div>

    <!-- Loading -->
    <div v-if="loading && items.length === 0" class="flex justify-center py-12">
      <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 text-gray-400 animate-spin" />
    </div>

    <!-- Empty state -->
    <div v-else-if="items.length === 0" class="text-center py-12">
      <UIcon name="i-heroicons-inbox" class="w-12 h-12 text-gray-300 mx-auto mb-3" />
      <p class="text-gray-500">No activity found</p>
    </div>

    <!-- Feed list -->
    <div v-else class="space-y-2">
      <div
        v-for="item in items"
        :key="`${item.source}-${item.id}`"
        class="flex items-start gap-3 p-4 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 transition-colors"
      >
        <!-- Severity dot -->
        <span
          class="mt-1.5 flex-shrink-0 w-2 h-2 rounded-full"
          :class="severityDotClass(item.severity)"
        />

        <!-- Content -->
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1">
            <UBadge
              :color="item.source === 'ghost-notification' ? 'blue' : 'yellow'"
              variant="subtle"
              size="xs"
            >
              {{ item.source === 'ghost-notification' ? 'GHOST' : 'Budget Alert History' }}
            </UBadge>
            <UBadge :color="getCategoryColor(item.category)" variant="soft" size="xs">
              {{ getCategoryLabel(item.category) }}
            </UBadge>
            <UBadge v-if="item.severity === 'critical'" color="red" variant="solid" size="xs">
              Critical
            </UBadge>
          </div>

          <p class="font-medium text-gray-900 dark:text-white text-sm">{{ item.title }}</p>
          <p class="text-sm text-gray-500 line-clamp-2">{{ item.body }}</p>

          <!-- Context info -->
          <div class="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
            <span>{{ formatTimestamp(item.timestamp) }}</span>
            <span v-if="item.userId">User: {{ item.userId }}</span>
            <span v-if="item.metadata?.accountId">Account: {{ item.metadata.accountId }}</span>
            <span v-if="item.metadata?.deliveryStatus">
              Email:
              <span :class="deliveryStatusClass(item.metadata.deliveryStatus)">
                {{ item.metadata.deliveryStatus }}
              </span>
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Load more -->
    <div v-if="hasMore" class="flex justify-center pt-2">
      <UButton variant="ghost" size="sm" @click="loadMore" :loading="loading">
        Load more
      </UButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { CATEGORY_DISPLAY } from '#shared/types/notifications'
import type { NotificationCategory } from '#shared/types/notifications'
import type { UnifiedActivityItem } from '#shared/types/notification-sources'

const sourceFilter = ref('all')
const categoryFilter = ref<string | null>(null)
const items = ref<UnifiedActivityItem[]>([])
const loading = ref(true)
const hasMore = ref(false)
const ghostNextKey = ref<string | null>(null)
const alertsNextToken = ref<string | null>(null)

const sourceOptions = [
  { label: 'All Activity', value: 'all' },
  { label: 'GHOST Notifications', value: 'ghost' },
  { label: 'Budget Alert History', value: 'budget-history' }
]

const categoryOptions = computed(() => {
  const opts = [{ label: 'All Categories', value: '' }]
  for (const [key, display] of Object.entries(CATEGORY_DISPLAY)) {
    opts.push({ label: display.label, value: key })
  }
  return opts
})

function severityDotClass(severity: string) {
  return {
    info: 'bg-blue-400',
    warning: 'bg-yellow-400',
    critical: 'bg-red-500'
  }[severity] || 'bg-gray-400'
}

function getCategoryColor(cat: string) {
  return (CATEGORY_DISPLAY[cat as NotificationCategory]?.color || 'gray') as any
}

function getCategoryLabel(cat: string) {
  return CATEGORY_DISPLAY[cat as NotificationCategory]?.label || cat
}

function deliveryStatusClass(status: string) {
  return {
    SENT: 'text-green-500',
    SUCCESS: 'text-green-500',
    FAILED: 'text-red-500',
    PENDING: 'text-yellow-500'
  }[status] || 'text-gray-400'
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

function changeSource(value: string) {
  sourceFilter.value = value
  loadFeed(true)
}

async function loadFeed(reset = false) {
  if (reset) {
    items.value = []
    ghostNextKey.value = null
    alertsNextToken.value = null
  }

  loading.value = true
  try {
    const params: Record<string, string> = {
      source: sourceFilter.value,
      limit: '30'
    }
    if (categoryFilter.value) params.category = categoryFilter.value
    if (ghostNextKey.value) params.ghostNextKey = ghostNextKey.value
    if (alertsNextToken.value) params.alertsNextToken = alertsNextToken.value

    const res = await $fetch<any>('/api/admin/user-notifications/activity-feed', { params })
    if (res?.success) {
      if (reset) {
        items.value = res.data.items
      } else {
        items.value.push(...res.data.items)
      }
      ghostNextKey.value = res.data.ghostNextKey
      alertsNextToken.value = res.data.alertsNextToken
      hasMore.value = res.data.hasMore
    }
  } catch {
    // Silently handle
  } finally {
    loading.value = false
  }
}

function loadMore() {
  loadFeed(false)
}

onMounted(() => loadFeed(true))
</script>
