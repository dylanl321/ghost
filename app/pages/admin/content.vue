<template>
  <div class="container mx-auto px-6 py-8 max-w-7xl">
    <!-- Header with Back Button -->
    <div class="mb-6">
      <UButton
        color="gray"
        variant="ghost"
        icon="i-heroicons-arrow-left"
        @click="navigateTo('/admin')"
        class="mb-4"
      >
        Back to Dashboard
      </UButton>

      <div class="flex items-center gap-3 mb-2">
        <div class="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
          <Icon name="i-heroicons-document-duplicate" class="w-6 h-6 text-purple-600 dark:text-purple-400" />
        </div>
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white">
          Content & Reports
        </h1>
      </div>
      <p class="text-gray-600 dark:text-gray-400">
        Manage share links, scheduled reports, and stored reports
      </p>
    </div>

    <!-- Tabs -->
    <UTabs
      v-model="activeTab"
      :items="tabs"
      class="mb-6"
    />

    <!-- Tab Content -->
    <div class="mt-6">
      <ShareLinksPanel v-if="activeTab === 0" />
      <ScheduledReportsPanel v-else-if="activeTab === 1" />
      <StoredReportsPanel v-else-if="activeTab === 2" />
    </div>
  </div>
</template>

<script setup lang="ts">
import ShareLinksPanel from '~/components/admin/ShareLinksPanel.vue'
import ScheduledReportsPanel from '~/components/admin/ScheduledReportsPanel.vue'
import StoredReportsPanel from '~/components/admin/StoredReportsPanel.vue'

// Page meta - using admin layout
definePageMeta({
  layout: 'admin',
  middleware: 'auth-permission',
  permission: 'admin',
  title: 'Content & Reports',
  description: 'Manage share links, scheduled reports, and stored reports'
})

const route = useRoute()

// Active tab state
const activeTab = ref(0)

// Tab configuration
const tabs = [
  {
    label: 'Share Links',
    icon: 'i-heroicons-link'
  },
  {
    label: 'Scheduled Reports',
    icon: 'i-heroicons-calendar-days'
  },
  {
    label: 'Stored Reports',
    icon: 'i-heroicons-document-duplicate'
  }
]

// Read tab from query param on mount
onMounted(() => {
  const tabParam = route.query.tab
  if (tabParam !== undefined) {
    const tabIndex = parseInt(tabParam as string, 10)
    if (!isNaN(tabIndex) && tabIndex >= 0 && tabIndex < tabs.length) {
      activeTab.value = tabIndex
    }
  }
})

// Watch for query changes (e.g., back/forward navigation)
watch(() => route.query.tab, (newTab) => {
  if (newTab !== undefined) {
    const tabIndex = parseInt(newTab as string, 10)
    if (!isNaN(tabIndex) && tabIndex >= 0 && tabIndex < tabs.length) {
      activeTab.value = tabIndex
    }
  }
})

// Update URL when tab changes
watch(activeTab, (newTab) => {
  navigateTo({ query: { ...route.query, tab: newTab.toString() } }, { replace: true })
})
</script>
