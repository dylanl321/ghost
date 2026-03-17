<template>
  <div v-if="activityItems.length > 0" class="h-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
    <div class="flex items-center gap-2 mb-4">
      <UIcon name="i-heroicons-clock" class="w-5 h-5 text-purple-500" />
      <h2 class="text-sm font-semibold text-gray-900 dark:text-white">My Activity</h2>
    </div>

    <!-- Compact: icon row with counts -->
    <div v-if="displayStyle === 'compact'" class="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
      <span v-if="viewCount > 0" class="flex items-center gap-1">
        <UIcon name="i-heroicons-eye" class="w-3.5 h-3.5" />
        {{ viewCount }} view{{ viewCount !== 1 ? 's' : '' }}
      </span>
      <span v-if="chatCount > 0" class="flex items-center gap-1">
        <UIcon name="i-heroicons-chat-bubble-left-right" class="w-3.5 h-3.5" />
        {{ chatCount }} chat{{ chatCount !== 1 ? 's' : '' }}
      </span>
    </div>

    <!-- Full / Half: timeline list -->
    <div v-else class="space-y-1">
      <component
        :is="item.link ? NuxtLink : 'div'"
        v-for="item in displayedItems"
        :key="item.id"
        :to="item.link"
        class="group flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
      >
        <UIcon
          :name="item.type === 'view' ? 'i-heroicons-eye' : 'i-heroicons-chat-bubble-left-right'"
          class="w-4 h-4 flex-shrink-0"
          :class="item.type === 'view' ? 'text-blue-400' : 'text-purple-400'"
        />
        <div class="min-w-0 flex-1">
          <p class="text-sm text-gray-900 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400">
            {{ item.label }}
          </p>
        </div>
        <span class="text-[11px] text-gray-400 dark:text-gray-500 flex-shrink-0">{{ item.timeAgo }}</span>
      </component>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { DisplayStyle } from '#shared/types/dashboard-layout'

const props = withDefaults(defineProps<{
  displayStyle?: DisplayStyle
}>(), { displayStyle: 'full' })

const NuxtLink = resolveComponent('NuxtLink')
const { recentAccounts } = useRecentAccounts()
const chatStore = useChatThreadsStore()

interface ActivityItem {
  id: string
  type: 'view' | 'chat'
  label: string
  timestamp: number
  timeAgo: string
  link?: string
}

function formatTimeAgo(ms: number): string {
  const diffMin = Math.floor(ms / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDays = Math.floor(diffHr / 24)
  if (diffDays === 1) return '1d ago'
  return `${diffDays}d ago`
}

const activityItems = computed<ActivityItem[]>(() => {
  const now = Date.now()
  const items: ActivityItem[] = []

  for (const acct of recentAccounts.value) {
    const ts = new Date(acct.viewedAt).getTime()
    items.push({
      id: `view-${acct.accountId}`,
      type: 'view',
      label: `Viewed ${acct.projectName || acct.accountName || acct.accountId}`,
      timestamp: ts,
      timeAgo: formatTimeAgo(now - ts),
      link: `/account/${acct.accountId}`,
    })
  }

  for (const thread of chatStore.threads) {
    if (thread.isArchived) continue
    const ts = new Date(thread.lastMessageAt).getTime()
    items.push({
      id: `chat-${thread.id}`,
      type: 'chat',
      label: `Chat: ${thread.title || 'Untitled'}`,
      timestamp: ts,
      timeAgo: formatTimeAgo(now - ts),
      link: `/chat?thread=${thread.id}`,
    })
  }

  return items.sort((a, b) => b.timestamp - a.timestamp)
})

const viewCount = computed(() => activityItems.value.filter(i => i.type === 'view').length)
const chatCount = computed(() => activityItems.value.filter(i => i.type === 'chat').length)

const displayedItems = computed(() => {
  const max = props.displayStyle === 'half' ? 5 : 8
  return activityItems.value.slice(0, max)
})
</script>
