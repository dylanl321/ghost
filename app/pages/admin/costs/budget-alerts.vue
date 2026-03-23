<template>
  <div class="container mx-auto px-6 py-8 max-w-7xl">
    <div class="mb-6">
      <UButton color="gray" variant="ghost" icon="i-heroicons-arrow-left" @click="navigateTo('/admin/costs')" class="mb-4">
        Back to Cost Management
      </UButton>
      <div class="flex items-center gap-3 mb-2">
        <div class="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
          <Icon name="i-heroicons-bell-alert" class="w-6 h-6 text-red-600 dark:text-red-400" />
        </div>
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white">Budget Alerts</h1>
      </div>
      <p class="text-gray-600 dark:text-gray-400">Monitor budget alerts, view alert logs, and configure settings</p>
    </div>

    <UTabs v-model="activeTab" :items="tabs" class="mb-6" />

    <div class="mt-6">
      <BudgetAlertsOverviewPanel v-if="activeTab === 0" @view-account="viewAccountAlerts" />
      <BudgetAlertsPanel v-else-if="activeTab === 1" />
      <BudgetAlertLambdaLogsPanel v-else-if="activeTab === 2" />
      <AlertSettingsPanel v-else-if="activeTab === 3" />
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  middleware: 'auth-permission',
  permission: 'admin',
  title: 'Budget Alerts',
  description: 'Monitor budget alerts, view alert logs, and configure settings'
})

const route = useRoute()
const activeTab = ref(0)
const tabNames = ['budget-overview', 'alert-history', 'alert-logs', 'alert-settings']

const tabs = [
  { label: 'Budget Overview', icon: 'i-heroicons-building-office-2' },
  { label: 'Alert History', icon: 'i-heroicons-bell-alert' },
  { label: 'Alert Logs', icon: 'i-heroicons-command-line' },
  { label: 'Alert Settings', icon: 'i-heroicons-cog-6-tooth' }
]

function viewAccountAlerts(accountId: string) {
  navigateTo(`/account/${accountId}?tab=alerts`)
}

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
