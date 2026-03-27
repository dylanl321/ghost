<template>
  <div class="container mx-auto px-6 py-8 max-w-7xl">
    <div class="mb-6">
      <UButton color="gray" variant="ghost" icon="i-heroicons-arrow-left" @click="navigateTo('/admin')" class="mb-4">
        Back to Dashboard
      </UButton>
      <div class="flex items-center gap-3 mb-2">
        <div class="p-2 bg-pink-100 dark:bg-pink-900/30 rounded-lg">
          <Icon name="i-heroicons-bell-alert" class="w-6 h-6 text-pink-600 dark:text-pink-400" />
        </div>
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white">Notification Center</h1>
        <UBadge v-if="dryRunActive" color="yellow" variant="solid" size="sm">
          <span class="flex items-center gap-1">
            <UIcon name="i-heroicons-beaker" class="w-3 h-3" />
            Dry-Run Active
          </span>
        </UBadge>
      </div>
      <p class="text-gray-600 dark:text-gray-400">Monitor notification delivery, manage broadcasts, and configure the system</p>
    </div>

    <UTabs v-model="activeTab" :items="tabs" class="mb-6" />

    <div class="mt-6">
      <NotificationDashboardPanel v-if="activeTab === 0" />
      <UserNotificationsPanel v-else-if="activeTab === 1" />
      <NotificationBroadcastPanel v-else-if="activeTab === 2" />
      <NotificationConfigPanel v-else-if="activeTab === 3" @dry-run-changed="checkDryRun" />
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  middleware: 'auth-permission',
  permission: 'admin',
  title: 'Notification Center',
  description: 'Monitor notification delivery, manage broadcasts, and configure the system'
})

const route = useRoute()
const activeTab = ref(0)
const tabNames = ['dashboard', 'all', 'broadcasts', 'configuration']
const dryRunActive = ref(false)

const tabs = [
  { label: 'Dashboard', icon: 'i-heroicons-squares-2x2' },
  { label: 'All Notifications', icon: 'i-heroicons-inbox-stack' },
  { label: 'Broadcasts', icon: 'i-heroicons-megaphone' },
  { label: 'Configuration', icon: 'i-heroicons-cog-6-tooth' }
]

async function checkDryRun() {
  try {
    const res = await $fetch<any>('/api/admin/user-notifications/config')
    if (res?.success) {
      dryRunActive.value = res.data.dryRunEnabled === true
    }
  } catch {
    // ignore
  }
}

onMounted(() => {
  const tabParam = route.query.tab as string | undefined
  if (tabParam) {
    const idx = tabNames.indexOf(tabParam)
    if (idx !== -1) activeTab.value = idx
  }
  checkDryRun()
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
