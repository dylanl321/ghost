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
          AI Operations
        </h1>
      </div>
      <p class="text-gray-600 dark:text-gray-400">
        Monitor AI chat activity, test agents, and view performance metrics
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
      <StrandsLogsViewer v-else-if="activeTab === 1" />
      <ValidationPanel v-else-if="activeTab === 2" />
      <StrandsAgentTester v-else-if="activeTab === 3" />
      <AIMetricsPanel v-else-if="activeTab === 4" />
    </div>
  </div>
</template>

<script setup lang="ts">
import AIChatMonitorPanel from '~/components/admin/AIChatMonitorPanel.vue'
import ValidationPanel from '~/components/admin/ValidationPanel.vue'
import StrandsLogsViewer from '~/components/admin/StrandsLogsViewer.vue'
import StrandsAgentTester from '~/components/admin/StrandsAgentTester.vue'
import AIMetricsPanel from '~/components/admin/AIMetricsPanel.vue'

definePageMeta({
  layout: 'admin',
  title: 'AI Operations',
  description: 'Monitor AI chat activity, test agents, and view performance metrics'
})

const activeTab = ref(0)

const tabs = [
  {
    label: 'Chat Monitor',
    icon: 'i-heroicons-chat-bubble-left-right'
  },
  {
    label: 'Agent Logs',
    icon: 'i-heroicons-document-text'
  },
  {
    label: 'Data Validation',
    icon: 'i-heroicons-clipboard-document-check'
  },
  {
    label: 'Agent Testing',
    icon: 'i-heroicons-beaker'
  },
  {
    label: 'Metrics Dashboard',
    icon: 'i-heroicons-chart-bar'
  }
]
</script>
