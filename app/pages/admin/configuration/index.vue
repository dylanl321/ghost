<template>
  <div class="container mx-auto px-6 py-8 max-w-7xl">
    <div class="mb-6">
      <UButton color="gray" variant="ghost" icon="i-heroicons-arrow-left" class="mb-4" @click="navigateTo('/admin')">
        Back to Dashboard
      </UButton>
      <div class="flex items-center gap-3 mb-2">
        <div class="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
          <Icon name="i-heroicons-cog-6-tooth" class="w-6 h-6 text-orange-600 dark:text-orange-400" />
        </div>
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white">Configuration</h1>
      </div>
      <p class="text-gray-600 dark:text-gray-400">Manage site-wide configuration and dashboard defaults</p>
    </div>
    <UTabs v-model="activeTab" :items="tabs" class="mb-6" />
    <UAlert
      color="blue"
      variant="soft"
      icon="i-heroicons-key"
      title="Personal API keys have moved"
      description="Every signed-in user manages their own keys from Settings → API Access."
      class="mb-6"
      :actions="[{ label: 'Open API Access', to: '/settings/api-access' }]"
    />
    <div class="mt-6">
      <SiteConfigPanel v-if="activeTab === 0" />
      <DashboardDefaultPanel v-else-if="activeTab === 1" />
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  middleware: 'auth-permission',
  permission: 'admin',
  title: 'Configuration',
  description: 'Manage site-wide configuration'
})

const route = useRoute()
const activeTab = ref(0)
const tabNames = ['site-config', 'dashboard-default']

const tabs = [
  { label: 'Site Config', icon: 'i-heroicons-cog-6-tooth' },
  { label: 'Dashboard Default', icon: 'i-heroicons-rectangle-group' },
]

onMounted(() => {
  const tabParam = route.query.tab as string | undefined
  if (tabParam === 'api-keys') {
    navigateTo('/settings/api-access')
    return
  }
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
