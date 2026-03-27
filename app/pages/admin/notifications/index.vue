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
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white">User Notifications</h1>
      </div>
      <p class="text-gray-600 dark:text-gray-400">Manage user notification delivery, broadcasts, and system configuration</p>
    </div>

    <UTabs v-model="activeTab" :items="tabs" class="mb-6" />

    <div class="mt-6">
      <UserNotificationsPanel v-if="activeTab === 0" />
      <NotificationBroadcastPanel v-else-if="activeTab === 1" />
      <NotificationConfigPanel v-else-if="activeTab === 2" />
      <NotificationAnalyticsPanel v-else-if="activeTab === 3" />
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  middleware: 'auth-permission',
  permission: 'admin',
  title: 'User Notifications',
  description: 'Manage user notification delivery, broadcasts, and system configuration'
})

const route = useRoute()
const activeTab = ref(0)
const tabNames = ['all', 'broadcasts', 'configuration', 'analytics']

const tabs = [
  { label: 'All Notifications', icon: 'i-heroicons-inbox-stack' },
  { label: 'Broadcasts', icon: 'i-heroicons-megaphone' },
  { label: 'Configuration', icon: 'i-heroicons-cog-6-tooth' },
  { label: 'Analytics', icon: 'i-heroicons-chart-bar' }
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
