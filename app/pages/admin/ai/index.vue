<template>
  <div class="container mx-auto px-6 py-8 max-w-7xl">
    <div class="mb-6">
      <UButton color="gray" variant="ghost" icon="i-heroicons-arrow-left" @click="navigateTo('/admin')" class="mb-4">
        Back to Dashboard
      </UButton>
      <div class="flex items-center gap-3 mb-2">
        <div class="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
          <Icon name="i-heroicons-sparkles" class="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
        </div>
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white">AI & Agents</h1>
      </div>
      <p class="text-gray-600 dark:text-gray-400">Monitor AI chat, manage agents, and view performance metrics</p>
    </div>
    <UTabs v-model="activeTab" :items="tabs" class="mb-6" />
    <div class="mt-6">
      <AIChatMonitorPanel v-if="activeTab === 0" />
      <StrandsLogsViewer v-else-if="activeTab === 1" />
      <StrandsAgentTester v-else-if="activeTab === 2" />
      <StrandsHealthCheck v-else-if="activeTab === 3" />
      <AIMetricsPanel v-else-if="activeTab === 4" />
      <AIUsageCollectionPanel v-else-if="activeTab === 5" />
    </div>
  </div>
</template>

<script setup lang="ts">
import AIChatMonitorPanel from '~/components/admin/AIChatMonitorPanel.vue'
import StrandsLogsViewer from '~/components/admin/StrandsLogsViewer.vue'
import StrandsAgentTester from '~/components/admin/StrandsAgentTester.vue'
import StrandsHealthCheck from '~/components/admin/StrandsHealthCheck.vue'
import AIMetricsPanel from '~/components/admin/AIMetricsPanel.vue'
import AIUsageCollectionPanel from '~/components/admin/AIUsageCollectionPanel.vue'

definePageMeta({
  layout: 'admin',
  middleware: 'auth-permission',
  permission: 'admin',
  title: 'AI & Agents',
  description: 'Monitor AI chat, manage agents, and view performance metrics'
})

const route = useRoute()
const activeTab = ref(0)
const tabNames = ['chat-monitor', 'agent-logs', 'agent-testing', 'agent-health', 'ai-metrics', 'usage-collection']

const tabs = [
  { label: 'Chat Monitor', icon: 'i-heroicons-chat-bubble-left-right' },
  { label: 'Agent Logs', icon: 'i-heroicons-document-text' },
  { label: 'Agent Testing', icon: 'i-heroicons-beaker' },
  { label: 'Agent Health', icon: 'i-heroicons-heart' },
  { label: 'AI Metrics', icon: 'i-heroicons-chart-bar' },
  { label: 'Usage Collection', icon: 'i-heroicons-circle-stack' }
]

onMounted(() => {
  const tabParam = route.query.tab as string | undefined
  if (tabParam) {
    const idx = tabNames.indexOf(tabParam)
    if (idx !== -1) activeTab.value = idx
  }
})

watch(() => route.query.tab, (newTab) => {
  if (newTab) {
    const idx = tabNames.indexOf(newTab as string)
    if (idx !== -1) activeTab.value = idx
  }
})

watch(activeTab, (newTab) => {
  navigateTo({ query: { ...route.query, tab: tabNames[newTab] } }, { replace: true })
})
</script>
