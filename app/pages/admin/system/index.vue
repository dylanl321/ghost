<template>
  <div class="container mx-auto px-6 py-8 max-w-7xl">
    <div class="mb-6">
      <UButton color="gray" variant="ghost" icon="i-heroicons-arrow-left" @click="navigateTo('/admin')" class="mb-4">
        Back to Dashboard
      </UButton>
      <div class="flex items-center gap-3 mb-2">
        <div class="p-2 bg-slate-100 dark:bg-slate-900/30 rounded-lg">
          <Icon name="i-heroicons-server-stack" class="w-6 h-6 text-slate-600 dark:text-slate-400" />
        </div>
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white">System Health</h1>
      </div>
      <p class="text-gray-600 dark:text-gray-400">Monitor system health, view logs, and manage operational concerns</p>
    </div>

    <UTabs v-model="activeTab" :items="tabs" class="mb-6" />

    <div class="mt-6">
      <SystemHealthPanel v-if="activeTab === 0" />
      <SystemLogsPanel v-else-if="activeTab === 1" />
      <NotificationsPanel v-else-if="activeTab === 2" />
      <SecurityDataPanel v-else-if="activeTab === 3" />
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  middleware: 'auth-permission',
  permission: 'admin',
  title: 'System Health',
  description: 'Monitor system health, view logs, and manage operational concerns'
})

const route = useRoute()
const activeTab = ref(0)
const tabNames = ['health-dashboard', 'system-logs', 'notification-log', 'security-cache']

const tabs = [
  { label: 'Health Dashboard', icon: 'i-heroicons-server-stack' },
  { label: 'System Logs', icon: 'i-heroicons-document-text' },
  { label: 'Notification Log', icon: 'i-heroicons-bell' },
  { label: 'Security Cache', icon: 'i-heroicons-shield-check' }
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
