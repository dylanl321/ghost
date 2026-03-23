<template>
  <div class="container mx-auto px-6 py-8 max-w-7xl">
    <div class="mb-6">
      <UButton color="gray" variant="ghost" icon="i-heroicons-arrow-left" @click="navigateTo('/admin')" class="mb-4">
        Back to Dashboard
      </UButton>
      <div class="flex items-center gap-3 mb-2">
        <div class="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
          <Icon name="i-heroicons-cog-6-tooth" class="w-6 h-6 text-orange-600 dark:text-orange-400" />
        </div>
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white">Configuration</h1>
      </div>
      <p class="text-gray-600 dark:text-gray-400">Manage API keys and site-wide configuration</p>
    </div>
    <UTabs v-model="activeTab" :items="tabs" class="mb-6" />
    <div class="mt-6">
      <ApiKeysPanel v-if="activeTab === 0" />
      <SiteConfigPanel v-else-if="activeTab === 1" />
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  middleware: 'auth-permission',
  permission: 'admin',
  title: 'Configuration',
  description: 'Manage API keys and site-wide configuration'
})

const route = useRoute()
const activeTab = ref(0)
const tabNames = ['api-keys', 'site-config']

const tabs = [
  { label: 'API Keys', icon: 'i-heroicons-key' },
  { label: 'Site Config', icon: 'i-heroicons-cog-6-tooth' }
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
