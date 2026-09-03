<template>
  <aside
    class="bg-white dark:bg-slate-800 border-r border-gray-200 dark:border-slate-700 flex-shrink-0 overflow-y-auto transition-all duration-300"
    :class="sidebarCollapsed ? 'w-16' : 'w-64'"
  >
    <div class="flex flex-col h-full">
      <!-- Sidebar Header -->
      <div class="p-4 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between">
        <span
          v-if="!sidebarCollapsed"
          class="font-semibold text-gray-900 dark:text-white"
        >
          Admin
        </span>
        <UButton
          color="gray"
          variant="ghost"
          size="sm"
          :icon="sidebarCollapsed ? 'i-heroicons-chevron-right' : 'i-heroicons-chevron-left'"
          @click="toggleSidebar"
          :title="sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'"
        />
      </div>

      <!-- Search Box -->
      <div class="p-3 border-b border-gray-200 dark:border-slate-700 relative">
        <UInput
          v-if="!sidebarCollapsed"
          ref="searchInputRef"
          v-model="searchQuery"
          placeholder="Search panels..."
          icon="i-heroicons-magnifying-glass"
          size="sm"
          :ui="{ icon: { trailing: { pointer: '' } } }"
          @focus="showSearchResults = true"
          @keydown="handleSearchKeydown"
        >
          <template v-if="searchQuery" #trailing>
            <UButton
              color="gray"
              variant="link"
              icon="i-heroicons-x-mark"
              :padded="false"
              size="xs"
              @click="clearSearch"
            />
          </template>
        </UInput>
        <UButton
          v-else
          color="gray"
          variant="ghost"
          icon="i-heroicons-magnifying-glass"
          size="sm"
          @click="expandAndFocusSearch"
          title="Search panels"
        />

        <!-- Search Results Dropdown -->
        <Transition
          enter-active-class="transition-all duration-150 ease-out"
          enter-from-class="opacity-0 translate-y-1"
          enter-to-class="opacity-100 translate-y-0"
          leave-active-class="transition-all duration-100 ease-in"
          leave-from-class="opacity-100 translate-y-0"
          leave-to-class="opacity-0 translate-y-1"
        >
          <div
            v-if="showSearchResults && isSearching && !sidebarCollapsed"
            ref="searchResultsRef"
            class="absolute left-3 right-3 top-full mt-1 z-50 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg max-h-80 overflow-y-auto"
          >
            <div v-if="filteredPanels.length === 0" class="p-4 text-center text-gray-500 dark:text-gray-400 text-sm">
              No panels found for "{{ searchQuery }}"
            </div>
            <div v-else class="py-1">
              <template v-for="(panels, category) in groupedPanels" :key="category">
                <div class="px-3 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {{ panels[0]?.categoryLabel }}
                </div>
                <button
                  v-for="panel in panels"
                  :key="panel.id"
                  class="w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors"
                  :class="[
                    selectedIndex === getPanelIndex(panel)
                      ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700'
                  ]"
                  @click="selectPanel(panel)"
                  @mouseenter="selectedIndex = getPanelIndex(panel)"
                >
                  <UIcon :name="panel.icon" class="w-4 h-4 flex-shrink-0" />
                  <div class="flex-1 text-left">
                    <span class="block truncate">{{ panel.label }}</span>
                    <span class="block text-xs text-gray-500 dark:text-gray-400 truncate">{{ panel.description }}</span>
                  </div>
                </button>
              </template>
            </div>
          </div>
        </Transition>
      </div>

      <!-- Navigation Links -->
      <nav class="flex-1 overflow-y-auto p-3">
        <div class="space-y-1">
          <div v-for="category in categories" :key="category.id">
            <!-- Category Header -->
            <button
              class="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors"
              :class="[
                isCategoryActive(category)
                  ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700'
              ]"
              :title="sidebarCollapsed ? category.label : undefined"
              @click="handleCategoryClick(category)"
            >
              <UIcon :name="category.icon" class="w-5 h-5 flex-shrink-0" />
              <span v-if="!sidebarCollapsed" class="flex-1 text-left truncate">
                {{ category.label }}
              </span>
              <UIcon
                v-if="!sidebarCollapsed && category.children && category.children.length > 0"
                :name="categoryExpanded[category.id] ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-right'"
                class="w-4 h-4 flex-shrink-0"
              />
            </button>

            <!-- Category Children (if expanded and not collapsed) -->
            <Transition
              enter-active-class="transition-all duration-200 ease-out"
              enter-from-class="opacity-0 max-h-0"
              enter-to-class="opacity-100 max-h-96"
              leave-active-class="transition-all duration-200 ease-in"
              leave-from-class="opacity-100 max-h-96"
              leave-to-class="opacity-0 max-h-0"
            >
              <div
                v-if="!sidebarCollapsed && categoryExpanded[category.id] && category.children && category.children.length > 0"
                class="ml-4 mt-1 space-y-1 overflow-hidden"
              >
                <NuxtLink
                  v-for="child in category.children"
                  :key="child.to"
                  :to="child.to"
                  class="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg transition-colors"
                  :class="[
                    isActive(child.to)
                      ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700'
                  ]"
                >
                  <UIcon :name="child.icon" class="w-4 h-4 flex-shrink-0" />
                  <span class="truncate">{{ child.label }}</span>
                </NuxtLink>
              </div>
            </Transition>
          </div>
        </div>
      </nav>

      <!-- Footer with Quick Actions -->
      <div
        v-if="!sidebarCollapsed"
        class="p-3 border-t border-gray-200 dark:border-slate-700"
      >
        <NuxtLink
          to="/"
          class="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
        >
          <UIcon name="i-heroicons-arrow-left" class="w-4 h-4" />
          <span>Back to Dashboard</span>
        </NuxtLink>
      </div>
      <div
        v-else
        class="p-3 border-t border-gray-200 dark:border-slate-700 flex justify-center"
      >
        <NuxtLink
          to="/"
          class="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          title="Back to Dashboard"
        >
          <UIcon name="i-heroicons-arrow-left" class="w-4 h-4" />
        </NuxtLink>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import type { AdminPanelItem } from '~/composables/useAdminSearch'

const route = useRoute()

// Admin search composable
const { searchQuery, filteredPanels, groupedPanels, isSearching, navigateToPanel, clearSearch: clearSearchQuery } = useAdminSearch()

// Search UI state
const showSearchResults = ref(false)
const selectedIndex = ref(0)
const searchInputRef = ref<{ input: HTMLInputElement } | null>(null)
const searchResultsRef = ref<HTMLElement | null>(null)

// Sidebar collapse state
const sidebarCollapsed = ref(false)

// Category expanded states
const categoryExpanded = ref<Record<string, boolean>>({
  configuration: true,
  users: false,
  content: false,
  costs: false,
  ai: false,
  system: false,
  pipelines: false
})

// Watch for search query changes to reset selected index
watch(searchQuery, () => {
  selectedIndex.value = 0
})

// Get flat index of a panel in filtered results for keyboard navigation
function getPanelIndex(panel: AdminPanelItem): number {
  return filteredPanels.value.findIndex(p => p.id === panel.id)
}

// Handle keyboard navigation in search
function handleSearchKeydown(event: KeyboardEvent) {
  if (!isSearching.value) return

  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      selectedIndex.value = Math.min(selectedIndex.value + 1, filteredPanels.value.length - 1)
      break
    case 'ArrowUp':
      event.preventDefault()
      selectedIndex.value = Math.max(selectedIndex.value - 1, 0)
      break
    case 'Enter':
      event.preventDefault()
      if (filteredPanels.value[selectedIndex.value]) {
        selectPanel(filteredPanels.value[selectedIndex.value])
      }
      break
    case 'Escape':
      event.preventDefault()
      clearSearch()
      break
  }
}

// Select and navigate to a panel
function selectPanel(panel: AdminPanelItem) {
  navigateToPanel(panel)
  showSearchResults.value = false
  selectedIndex.value = 0
}

// Clear search and close results
function clearSearch() {
  clearSearchQuery()
  showSearchResults.value = false
  selectedIndex.value = 0
}

// Expand sidebar and focus search input
function expandAndFocusSearch() {
  sidebarCollapsed.value = false
  nextTick(() => {
    searchInputRef.value?.input?.focus()
    showSearchResults.value = true
  })
}

// Click outside handler to close search results
function handleClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement
  const isSearchInput = searchInputRef.value?.input?.contains(target)
  const isSearchResults = searchResultsRef.value?.contains(target)

  if (!isSearchInput && !isSearchResults) {
    showSearchResults.value = false
  }
}

// Cmd/Ctrl+K keyboard shortcut to focus search
function handleGlobalKeydown(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
    event.preventDefault()
    if (sidebarCollapsed.value) {
      expandAndFocusSearch()
    } else {
      searchInputRef.value?.input?.focus()
      showSearchResults.value = true
    }
  }
}

// Setup click outside and keyboard listeners
onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  document.addEventListener('keydown', handleGlobalKeydown)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
  document.removeEventListener('keydown', handleGlobalKeydown)
})

// Admin navigation categories with nested children
const categories = [
  {
    id: 'configuration',
    label: 'Configuration',
    icon: 'i-heroicons-cog-6-tooth',
    to: '/admin/configuration',
    children: [
      { label: 'Personal API Access', icon: 'i-heroicons-key', to: '/settings/api-access' },
      { label: 'Site Config', icon: 'i-heroicons-cog', to: '/admin/configuration?tab=site-config' }
    ]
  },
  {
    id: 'users',
    label: 'Users & Access',
    icon: 'i-heroicons-user-group',
    to: '/admin/users',
    children: [
      { label: 'User Preferences', icon: 'i-heroicons-user', to: '/admin/users?tab=preferences' },
      { label: 'Roles & Permissions', icon: 'i-heroicons-shield-check', to: '/admin/users?tab=roles' },
      { label: 'Usage Analytics', icon: 'i-heroicons-chart-bar', to: '/admin/users?tab=usage-analytics' },
      { label: 'User Journeys', icon: 'i-heroicons-map', to: '/admin/users?tab=user-journeys' },
      { label: 'Feedback & Requests', icon: 'i-heroicons-exclamation-triangle', to: '/admin/users?tab=feedback' }
    ]
  },
  {
    id: 'content',
    label: 'Content & Reports',
    icon: 'i-heroicons-document-duplicate',
    to: '/admin/content',
    children: [
      { label: 'Share Links', icon: 'i-heroicons-link', to: '/admin/content?tab=share-links' },
      { label: 'Scheduled Reports', icon: 'i-heroicons-calendar', to: '/admin/content?tab=reports' },
      { label: 'Stored Reports', icon: 'i-heroicons-document-duplicate', to: '/admin/content?tab=stored-reports' }
    ]
  },
  {
    id: 'notifications',
    label: 'Notifications',
    icon: 'i-heroicons-bell-alert',
    to: '/admin/notifications',
    children: [
      { label: 'Dashboard', icon: 'i-heroicons-squares-2x2', to: '/admin/notifications?tab=dashboard' },
      { label: 'Sources', icon: 'i-heroicons-queue-list', to: '/admin/notifications?tab=sources' },
      { label: 'Activity Feed', icon: 'i-heroicons-clock', to: '/admin/notifications?tab=activity' },
      { label: 'All Notifications', icon: 'i-heroicons-inbox-stack', to: '/admin/notifications?tab=all' },
      { label: 'Broadcasts', icon: 'i-heroicons-megaphone', to: '/admin/notifications?tab=broadcasts' },
      { label: 'Configuration', icon: 'i-heroicons-cog-6-tooth', to: '/admin/notifications?tab=configuration' }
    ]
  },
  {
    id: 'costs',
    label: 'Cost Management',
    icon: 'i-heroicons-currency-dollar',
    to: '/admin/costs',
    children: [
      { label: 'Budget Alerts', icon: 'i-heroicons-bell-alert', to: '/admin/costs/budget-alerts' },
      { label: 'Tag Compliance', icon: 'i-heroicons-tag', to: '/admin/costs/tag-compliance' },
      { label: 'Data Validation', icon: 'i-heroicons-clipboard-document-check', to: '/admin/costs/data-validation' }
    ]
  },
  {
    id: 'ai',
    label: 'AI & Agents',
    icon: 'i-heroicons-sparkles',
    to: '/admin/ai',
    children: [
      { label: 'Chat Monitor', icon: 'i-heroicons-chat-bubble-left-right', to: '/admin/ai?tab=chat-monitor' },
      { label: 'Agent Logs', icon: 'i-heroicons-document-text', to: '/admin/ai?tab=agent-logs' },
      { label: 'Agent Testing', icon: 'i-heroicons-beaker', to: '/admin/ai?tab=agent-testing' },
      { label: 'Agent Health', icon: 'i-heroicons-heart', to: '/admin/ai?tab=agent-health' },
      { label: 'AI Metrics', icon: 'i-heroicons-chart-bar', to: '/admin/ai?tab=ai-metrics' },
      { label: 'Usage Collection', icon: 'i-heroicons-circle-stack', to: '/admin/ai?tab=usage-collection' },
      { label: 'MCP Usage', icon: 'i-heroicons-chart-bar-square', to: '/admin/mcp-usage' }
    ]
  },
  {
    id: 'system',
    label: 'System Health',
    icon: 'i-heroicons-server-stack',
    to: '/admin/system',
    children: [
      { label: 'Health Dashboard', icon: 'i-heroicons-server-stack', to: '/admin/system?tab=health-dashboard' },
      { label: 'System Logs', icon: 'i-heroicons-document-text', to: '/admin/system?tab=system-logs' },
      { label: 'Notification Log', icon: 'i-heroicons-bell', to: '/admin/system?tab=notification-log' },
      { label: 'Security Cache', icon: 'i-heroicons-shield-check', to: '/admin/system?tab=security-cache' }
    ]
  },
  {
    id: 'pipelines',
    label: 'Pipeline Analytics',
    icon: 'i-heroicons-arrow-path',
    to: '/admin/pipelines',
    children: [
      { label: 'Repositories', icon: 'i-heroicons-folder', to: '/admin/pipelines/repositories' },
      { label: 'Authors', icon: 'i-heroicons-users', to: '/admin/pipelines/authors' }
    ]
  }
]

// Toggle sidebar collapse
const toggleSidebar = () => {
  sidebarCollapsed.value = !sidebarCollapsed.value
}

// Handle category click - navigate if no children or toggle expand
const handleCategoryClick = (category: typeof categories[0]) => {
  if (sidebarCollapsed.value) {
    // When collapsed, navigate directly
    navigateTo(category.to)
  } else if (category.children && category.children.length > 0) {
    // When expanded with children, toggle expand state
    categoryExpanded.value[category.id] = !categoryExpanded.value[category.id]
  } else {
    // No children, navigate directly
    navigateTo(category.to)
  }
}

// Check if a path is active (compares full URL including query params)
const isActive = (pathWithQuery: string) => {
  // Parse the target path to separate path and query
  const [targetPath, targetQuery] = pathWithQuery.split('?')

  // If target has query params, must match exactly
  if (targetQuery) {
    const targetParams = new URLSearchParams(targetQuery)
    const currentTab = route.query.tab as string | undefined
    const targetTab = targetParams.get('tab')
    return route.path === targetPath && currentTab === targetTab
  }

  // No query params in target - match path only (for category headers)
  return route.path === targetPath || route.path.startsWith(targetPath + '/')
}

// Check if a category is active (any of its routes match)
const isCategoryActive = (category: typeof categories[0]) => {
  // Category is active if current path starts with category path
  const categoryPath = category.to.split('?')[0]
  return route.path === categoryPath || route.path.startsWith(categoryPath + '/')
}

// Expose methods for external control
defineExpose({
  toggleSidebar,
  collapsed: computed(() => sidebarCollapsed.value)
})
</script>
