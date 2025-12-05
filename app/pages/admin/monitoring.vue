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
        <div class="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
          <Icon name="i-heroicons-chart-bar" class="w-6 h-6 text-red-600 dark:text-red-400" />
        </div>
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white">
          Monitoring & Support
        </h1>
      </div>
      <p class="text-gray-600 dark:text-gray-400">
        View system logs and manage issues & tickets
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
      <SystemLogsPanel v-if="activeTab === 0" />
      <StrandsLogsViewer v-else-if="activeTab === 1" />
      <IssuesPanel v-else-if="activeTab === 2" />
    </div>
  </div>
</template>

<script setup lang="ts">
import SystemLogsPanel from '~/components/admin/SystemLogsPanel.vue'
import StrandsLogsViewer from '~/components/admin/StrandsLogsViewer.vue'
import IssuesPanel from '~/components/admin/IssuesPanel.vue'

// Page meta - using admin layout
definePageMeta({
  layout: 'admin',
  title: 'Monitoring & Support',
  description: 'View system logs and manage issues & tickets'
})

// Active tab state
const activeTab = ref(0)

// Tab configuration
const tabs = [
  {
    label: 'System Logs',
    icon: 'i-heroicons-document-text'
  },
  {
    label: 'Strands Agent Logs',
    icon: 'i-heroicons-server'
  },
  {
    label: 'Issues & Tickets',
    icon: 'i-heroicons-exclamation-triangle'
  }
]
</script>
