<template>
  <div class="relative">
    <!-- Bell Button -->
    <UButton
      variant="ghost"
      color="gray"
      size="sm"
      icon="i-heroicons-bell"
      title="Notifications"
      class="transition-all duration-200 opacity-70 hover:opacity-100"
      @click="togglePanel()"
    />

    <!-- Unread Badge -->
    <span
      v-if="unreadCount > 0"
      class="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-red-500 rounded-full ring-2 ring-white dark:ring-slate-800"
    >
      {{ unreadCount > 99 ? '99+' : unreadCount }}
    </span>

    <!-- Slideover Panel -->
    <USlideover
      v-model="panelOpen"
      side="right"
      :ui="{
        width: 'max-w-md',
        background: 'bg-white dark:bg-slate-800',
        padding: 'p-0'
      }"
    >
      <!-- Header -->
      <div class="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-slate-700">
        <div class="flex items-center gap-2">
          <UIcon name="i-heroicons-bell" class="w-5 h-5 text-gray-600 dark:text-gray-300" />
          <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Notifications</h2>
          <span
            v-if="unreadCount > 0"
            class="inline-flex items-center justify-center px-2 py-0.5 text-xs font-medium text-blue-700 bg-blue-100 dark:text-blue-300 dark:bg-blue-900/30 rounded-full"
          >
            {{ unreadCount }} unread
          </span>
        </div>
        <div class="flex items-center gap-1">
          <UButton
            v-if="unreadCount > 0"
            variant="ghost"
            color="gray"
            size="xs"
            label="Mark all read"
            @click="markAllAsRead()"
          />
          <UButton
            variant="ghost"
            color="gray"
            size="xs"
            icon="i-heroicons-x-mark"
            @click="closePanel()"
          />
        </div>
      </div>

      <!-- Filter Tabs -->
      <div class="flex gap-1 px-5 py-2 border-b border-gray-100 dark:border-slate-700/50 overflow-x-auto">
        <UButton
          v-for="filter in filters"
          :key="filter.key"
          :variant="activeFilter === filter.key ? 'soft' : 'ghost'"
          :color="activeFilter === filter.key ? 'primary' : 'gray'"
          size="xs"
          :label="filter.label"
          @click="setFilter(filter.key)"
        />
      </div>

      <!-- Notification List -->
      <div class="flex-1 overflow-y-auto" style="max-height: calc(100vh - 140px);">
        <!-- Loading -->
        <div v-if="isLoading && notifications.length === 0" class="flex items-center justify-center py-12">
          <UIcon name="i-heroicons-arrow-path" class="w-5 h-5 text-gray-400 animate-spin" />
          <span class="ml-2 text-sm text-gray-500">Loading notifications...</span>
        </div>

        <!-- Empty State -->
        <div v-else-if="notifications.length === 0" class="flex flex-col items-center justify-center py-16 px-6">
          <div class="p-3 rounded-full bg-green-50 dark:bg-green-900/20 mb-4">
            <UIcon name="i-heroicons-check-circle" class="w-8 h-8 text-green-500" />
          </div>
          <p class="text-base font-medium text-gray-900 dark:text-white">All caught up!</p>
          <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">No notifications to show.</p>
        </div>

        <!-- Notification Cards -->
        <div v-else class="divide-y divide-gray-100 dark:divide-slate-700/50">
          <div
            v-for="notif in notifications"
            :key="notif.notificationId"
            class="relative flex gap-3 px-5 py-3 cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-slate-700/30"
            :class="{ 'bg-blue-50/50 dark:bg-blue-900/10': notif.status === 'unread' }"
            @click="handleNotificationClick(notif)"
          >
            <!-- Unread dot -->
            <div class="flex-shrink-0 pt-1">
              <span
                v-if="notif.status === 'unread'"
                class="block w-2 h-2 rounded-full bg-blue-500"
              />
              <span v-else class="block w-2 h-2" />
            </div>

            <!-- Category Icon -->
            <div class="flex-shrink-0 pt-0.5">
              <div
                class="p-1.5 rounded-lg"
                :class="getCategoryBgClass(notif.category)"
              >
                <UIcon
                  :name="getCategoryIcon(notif.category)"
                  class="w-4 h-4"
                  :class="getCategoryIconClass(notif.category)"
                />
              </div>
            </div>

            <!-- Content -->
            <div class="flex-1 min-w-0">
              <div class="flex items-start justify-between gap-2">
                <p class="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {{ notif.title }}
                </p>
                <UButton
                  variant="ghost"
                  color="gray"
                  size="2xs"
                  icon="i-heroicons-x-mark"
                  class="flex-shrink-0 opacity-0 group-hover:opacity-100"
                  @click.stop="removeNotification(notif.notificationId)"
                />
              </div>
              <p class="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 mt-0.5">
                {{ notif.body }}
              </p>
              <div class="flex items-center gap-2 mt-1">
                <span class="text-xs text-gray-400">{{ formatRelativeTime(notif.createdAt) }}</span>
                <span
                  v-if="notif.severity === 'critical'"
                  class="text-xs font-medium text-red-600 dark:text-red-400"
                >
                  Critical
                </span>
                <span
                  v-else-if="notif.severity === 'warning'"
                  class="text-xs font-medium text-yellow-600 dark:text-yellow-400"
                >
                  Warning
                </span>
              </div>
              <UButton
                v-if="notif.actionUrl"
                variant="link"
                size="xs"
                :label="notif.actionLabel || 'View details'"
                class="mt-1 -ml-2"
                @click.stop="navigateToAction(notif)"
              />
            </div>
          </div>

          <!-- Load More -->
          <div v-if="hasMore" class="px-5 py-3">
            <UButton
              variant="ghost"
              color="gray"
              size="sm"
              label="Load more"
              block
              :loading="isLoading"
              @click="loadMore()"
            />
          </div>
        </div>
      </div>
    </USlideover>
  </div>
</template>

<script setup lang="ts">
import type { UserNotification, NotificationCategory } from '#shared/types/notifications'
import { CATEGORY_DISPLAY } from '#shared/types/notifications'

const router = useRouter()

const {
  unreadCount,
  notifications,
  isLoading,
  isPanelOpen,
  hasMore,
  activeFilter,
  markAsRead,
  markAllAsRead,
  removeNotification,
  openPanel,
  closePanel,
  togglePanel,
  loadMore,
  setFilter
} = useNotifications()

// Writeable model for USlideover v-model
const panelOpen = computed({
  get: () => isPanelOpen.value,
  set: (val: boolean) => { if (!val) closePanel() }
})

const filters = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'BUDGET_THRESHOLD', label: 'Budget' },
  { key: 'SECURITY_CRITICAL', label: 'Security' },
  { key: 'PIPELINE_FAILURE', label: 'Pipeline' },
  { key: 'SYSTEM', label: 'System' }
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getCategoryIcon(category: NotificationCategory): string {
  return CATEGORY_DISPLAY[category]?.icon || 'i-heroicons-bell'
}

function getCategoryBgClass(category: NotificationCategory): string {
  const color = CATEGORY_DISPLAY[category]?.color || 'gray'
  return `bg-${color}-50 dark:bg-${color}-900/20`
}

function getCategoryIconClass(category: NotificationCategory): string {
  const color = CATEGORY_DISPLAY[category]?.color || 'gray'
  return `text-${color}-600 dark:text-${color}-400`
}

function formatRelativeTime(isoDate: string): string {
  const now = Date.now()
  const then = new Date(isoDate).getTime()
  const diffMs = now - then

  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(hours / 24)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`

  return new Date(isoDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function handleNotificationClick(notif: UserNotification) {
  if (notif.status === 'unread') {
    markAsRead(notif.notificationId)
  }
  if (notif.actionUrl) {
    navigateToAction(notif)
  }
}

function navigateToAction(notif: UserNotification) {
  closePanel()
  if (notif.actionUrl) {
    router.push(notif.actionUrl)
  }
}
</script>
