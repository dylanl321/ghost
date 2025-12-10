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
        <div class="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
          <Icon name="i-heroicons-sparkles" class="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
        </div>
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white">
          AI & Data
        </h1>
      </div>
      <p class="text-gray-600 dark:text-gray-400">
        Monitor AI chat activity and validate data quality
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
      <AIChatMonitorPanel v-if="activeTab === 0" />
      <ValidationPanel v-else-if="activeTab === 1" />
    </div>
  </div>
</template>

<script setup lang="ts">
import AIChatMonitorPanel from '~/components/admin/AIChatMonitorPanel.vue'
import ValidationPanel from '~/components/admin/ValidationPanel.vue'

// Page meta - using admin layout
definePageMeta({
  layout: 'admin',
  title: 'AI & Data',
  description: 'Monitor AI chat activity and validate data quality'
})

// Active tab state
const activeTab = ref(0)

// Tab configuration
const tabs = [
  {
    label: 'AI Chat Monitor',
    icon: 'i-heroicons-chat-bubble-left-right'
  },
  {
    label: 'Data Validation',
    icon: 'i-heroicons-clipboard-document-check'
  }
]
</script>
