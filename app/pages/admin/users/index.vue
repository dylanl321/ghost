<template>
  <div class="container mx-auto px-6 py-8 max-w-7xl">
    <div class="mb-6">
      <UButton color="gray" variant="ghost" icon="i-heroicons-arrow-left" @click="navigateTo('/admin')" class="mb-4">
        Back to Dashboard
      </UButton>
      <div class="flex items-center gap-3 mb-2">
        <div class="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
          <Icon name="i-heroicons-user-group" class="w-6 h-6 text-blue-600 dark:text-blue-400" />
        </div>
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white">Users & Access</h1>
      </div>
      <p class="text-gray-600 dark:text-gray-400">Manage user preferences, roles, usage analytics, journeys, and feedback</p>
    </div>
    <UTabs v-model="activeTab" :items="tabs" class="mb-6" />
    <div class="mt-6">
      <UserPreferencesPanel v-if="activeTab === 0" />
      <RolesPanel v-else-if="activeTab === 1" />
      <UserActivityMetricsPanel v-else-if="activeTab === 2" />
      <UserJourneyVisualizer v-else-if="activeTab === 3" />
      <IssuesPanel v-else-if="activeTab === 4" />
    </div>
  </div>
</template>

<script setup lang="ts">
import UserPreferencesPanel from '~/components/admin/UserPreferencesPanel.vue'
import RolesPanel from '~/components/admin/RolesPanel.vue'
import UserActivityMetricsPanel from '~/components/admin/UserActivityMetricsPanel.vue'
import UserJourneyVisualizer from '~/components/admin/UserJourneyVisualizer.vue'
import IssuesPanel from '~/components/admin/IssuesPanel.vue'

definePageMeta({
  layout: 'admin',
  middleware: 'auth-permission',
  permission: 'admin',
  title: 'Users & Access',
  description: 'Manage user preferences, roles, usage analytics, journeys, and feedback'
})

const route = useRoute()
const activeTab = ref(0)
const tabNames = ['preferences', 'roles', 'usage-analytics', 'user-journeys', 'feedback']

const tabs = [
  { label: 'User Preferences', icon: 'i-heroicons-user-circle' },
  { label: 'Roles & Permissions', icon: 'i-heroicons-shield-check' },
  { label: 'Usage Analytics', icon: 'i-heroicons-chart-bar' },
  { label: 'User Journeys', icon: 'i-heroicons-map' },
  { label: 'Feedback & Requests', icon: 'i-heroicons-exclamation-triangle' }
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
