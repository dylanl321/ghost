<template>
  <div v-if="activityItems.length > 0" class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 h-full overflow-hidden">
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-2">
        <div class="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
          <UIcon name="i-heroicons-clock" class="w-4.5 h-4.5 text-purple-500" />
        </div>
        <div>
          <h2 class="text-sm font-semibold text-gray-900 dark:text-white">My Activity</h2>
          <p class="text-[11px] text-gray-400 dark:text-gray-500">Recent activity</p>
        </div>
      </div>
      <div class="flex items-center gap-3">
        <div v-if="viewCount > 0" class="flex items-center gap-1.5 px-2 py-1 rounded-full bg-blue-50 dark:bg-blue-900/20">
          <UIcon name="i-heroicons-eye" class="w-3.5 h-3.5 text-blue-500" />
          <span class="text-[11px] font-medium text-blue-600 dark:text-blue-400">{{ viewCount }}</span>
        </div>
        <div v-if="chatCount > 0" class="flex items-center gap-1.5 px-2 py-1 rounded-full bg-purple-50 dark:bg-purple-900/20">
          <UIcon name="i-heroicons-chat-bubble-left-right" class="w-3.5 h-3.5 text-purple-500" />
          <span class="text-[11px] font-medium text-purple-600 dark:text-purple-400">{{ chatCount }}</span>
        </div>
        <div v-if="actionCount > 0" class="flex items-center gap-1.5 px-2 py-1 rounded-full bg-cyan-50 dark:bg-cyan-900/20">
          <UIcon name="i-heroicons-bolt" class="w-3.5 h-3.5 text-cyan-500" />
          <span class="text-[11px] font-medium text-cyan-600 dark:text-cyan-400">{{ actionCount }}</span>
        </div>
      </div>
    </div>

    <!-- Third: summary counts only -->
    <div v-if="displayStyle === 'third'" class="space-y-2.5">
      <component
        :is="item.link ? NuxtLink : 'div'"
        v-for="item in displayedItems"
        :key="item.id"
        :to="item.link"
        class="group flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        <span
          class="w-1.5 h-1.5 rounded-full flex-shrink-0"
          :class="getMeta(item.type).dot"
        />
        <span class="text-xs text-gray-700 dark:text-gray-300 truncate flex-1 group-hover:text-blue-600 dark:group-hover:text-blue-400">{{ item.label }}</span>
        <span class="text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0">{{ item.timeAgo }}</span>
      </component>
    </div>

    <!-- Full / Half / Two-thirds: timeline list -->
    <div v-else class="space-y-0.5">
      <component
        :is="item.link ? NuxtLink : 'div'"
        v-for="(item, idx) in displayedItems"
        :key="item.id"
        :to="item.link"
        class="group flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-all duration-150"
      >
        <!-- Timeline connector -->
        <div class="relative flex flex-col items-center">
          <div
            class="w-8 h-8 rounded-lg flex items-center justify-center transition-colors duration-150"
            :class="getMeta(item.type).bg"
          >
            <UIcon
              :name="getMeta(item.type).icon"
              class="w-4 h-4"
              :class="getMeta(item.type).text"
            />
          </div>
          <div
            v-if="idx < displayedItems.length - 1"
            class="absolute top-8 w-px h-3 bg-gray-200 dark:bg-gray-700"
          />
        </div>

        <div class="min-w-0 flex-1">
          <p class="text-sm font-medium text-gray-900 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
            {{ item.label }}
          </p>
          <p class="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">{{ item.timeAgo }}</p>
        </div>

        <UIcon name="i-heroicons-chevron-right" class="w-4 h-4 text-gray-300 dark:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
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
const { actionItems: cloudActions, fetchServerActions } = useMyActivity()

// Fetch server-side actions on mount for cross-device persistence
onMounted(() => fetchServerActions())

type ActivityCategory = 'view' | 'chat' | 'cost' | 'export' | 'favorite' | 'search' | 'dashboard' | 'action'

interface ActivityItem {
  id: string
  type: ActivityCategory
  label: string
  timestamp: number
  timeAgo: string
  link?: string
}

const activityMeta: Record<ActivityCategory, { icon: string; bg: string; text: string; dot: string }> = {
  view: { icon: 'i-heroicons-eye', bg: 'bg-blue-50 dark:bg-blue-900/20 group-hover:bg-blue-100 dark:group-hover:bg-blue-900/30', text: 'text-blue-500', dot: 'bg-blue-400' },
  chat: { icon: 'i-heroicons-chat-bubble-left-right', bg: 'bg-purple-50 dark:bg-purple-900/20 group-hover:bg-purple-100 dark:group-hover:bg-purple-900/30', text: 'text-purple-500', dot: 'bg-purple-400' },
  cost: { icon: 'i-heroicons-currency-dollar', bg: 'bg-cyan-50 dark:bg-cyan-900/20 group-hover:bg-cyan-100 dark:group-hover:bg-cyan-900/30', text: 'text-cyan-500', dot: 'bg-cyan-400' },
  export: { icon: 'i-heroicons-arrow-down-tray', bg: 'bg-emerald-50 dark:bg-emerald-900/20 group-hover:bg-emerald-100 dark:group-hover:bg-emerald-900/30', text: 'text-emerald-500', dot: 'bg-emerald-400' },
  favorite: { icon: 'i-heroicons-star', bg: 'bg-yellow-50 dark:bg-yellow-900/20 group-hover:bg-yellow-100 dark:group-hover:bg-yellow-900/30', text: 'text-yellow-500', dot: 'bg-yellow-400' },
  search: { icon: 'i-heroicons-magnifying-glass', bg: 'bg-gray-50 dark:bg-gray-800/50 group-hover:bg-gray-100 dark:group-hover:bg-gray-700/50', text: 'text-gray-500', dot: 'bg-gray-400' },
  dashboard: { icon: 'i-heroicons-squares-2x2', bg: 'bg-indigo-50 dark:bg-indigo-900/20 group-hover:bg-indigo-100 dark:group-hover:bg-indigo-900/30', text: 'text-indigo-500', dot: 'bg-indigo-400' },
  action: { icon: 'i-heroicons-bolt', bg: 'bg-amber-50 dark:bg-amber-900/20 group-hover:bg-amber-100 dark:group-hover:bg-amber-900/30', text: 'text-amber-500', dot: 'bg-amber-400' },
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

function actionTypeToCategory(type: string): ActivityCategory {
  const prefix = type.split('.')[0] || ''
  if (prefix === 'account') return 'favorite'
  if (['cost', 'export', 'search', 'dashboard', 'chat'].includes(prefix)) return prefix as ActivityCategory
  return 'action'
}

const actionLabels: Record<string, string> = {
  'cost.timeframe_change': 'Changed cost timeframe',
  'cost.tab_switch': 'Switched cost view',
  'cost.mode_toggle': 'Toggled cost mode',
  'cost.tag_drilldown': 'Tag analysis drilldown',
  'cost.account_select': 'Selected cost accounts',
  'account.favorite': 'Favorited an account',
  'account.unfavorite': 'Unfavorited an account',
  'export.csv': 'Exported CSV',
  'export.json': 'Exported JSON',
  'dashboard.scope_change': 'Changed dashboard scope',
  'dashboard.daterange_change': 'Changed date range',
  'search.explorer': 'Searched accounts',
  'search.cost': 'Searched costs',
  'chat.thread_create': 'Created chat thread',
  'chat.thread_share': 'Shared chat thread',
}

const activityItems = computed<ActivityItem[]>(() => {
  const now = Date.now()
  const items: ActivityItem[] = []

  // Recent account views
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

  // Chat threads
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

  // Action items from hybrid composable (local + server)
  for (const action of cloudActions.value) {
    const category = actionTypeToCategory(action.type)
    items.push({
      id: `action-${action.type}-${action.timestamp}`,
      type: category,
      label: actionLabels[action.type] || action.type,
      timestamp: action.timestamp,
      timeAgo: formatTimeAgo(now - action.timestamp),
    })
  }

  return items.sort((a, b) => b.timestamp - a.timestamp)
})

const viewCount = computed(() => activityItems.value.filter(i => i.type === 'view').length)
const chatCount = computed(() => activityItems.value.filter(i => i.type === 'chat').length)
const actionCount = computed(() => activityItems.value.filter(i => !['view', 'chat'].includes(i.type)).length)

const displayedItems = computed(() => {
  if (props.displayStyle === 'third') return activityItems.value.slice(0, 4)
  if (props.displayStyle === 'half') return activityItems.value.slice(0, 5)
  return activityItems.value.slice(0, 8)
})

function getMeta(type: ActivityCategory) {
  return activityMeta[type] || activityMeta.action
}
</script>
