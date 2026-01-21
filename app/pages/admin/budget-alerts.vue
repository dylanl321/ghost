<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
    <!-- Access Denied -->
    <div v-if="!hasAdminAccess" class="flex items-center justify-center min-h-screen p-6">
      <UCard class="max-w-2xl">
        <div class="p-8 text-center">
          <UIcon name="i-heroicons-shield-exclamation" class="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">Access Denied</h1>
          <p class="text-gray-600 dark:text-gray-400 mb-6">
            You don't have permission to access this admin page.
          </p>
          <UButton color="emerald" @click="navigateTo('/admin')">
            Back to Admin
          </UButton>
        </div>
      </UCard>
    </div>

    <!-- Main Content -->
    <div v-else class="container mx-auto px-6 py-8 max-w-7xl">
      <!-- Header -->
      <div class="mb-6">
        <div class="flex items-center gap-2 mb-2">
          <NuxtLink to="/admin" class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
            <UIcon name="i-heroicons-arrow-left" class="w-5 h-5" />
          </NuxtLink>
          <h1 class="text-3xl font-bold text-gray-900 dark:text-white">
            Budget Alerts Admin
          </h1>
        </div>
        <p class="text-gray-600 dark:text-gray-400">
          Monitor the budget alert system, view Lambda execution logs, configure settings, and see organization-wide alert status.
        </p>
      </div>

      <!-- Tab Navigation -->
      <UTabs v-model="activeTab" :items="tabs" class="mb-6" />

      <!-- Tab Content -->
      <div v-show="activeTab === 0">
        <!-- Organization Overview Tab -->
        <BudgetAlertsOverviewPanel @view-account="viewAccountAlerts" />
      </div>

      <div v-show="activeTab === 1">
        <!-- Alert History Tab -->
        <BudgetAlertsPanel />
      </div>

      <div v-show="activeTab === 2">
        <!-- Lambda Logs Tab -->
        <BudgetAlertLambdaLogsPanel />
      </div>

      <div v-show="activeTab === 3">
        <!-- Settings Tab -->
        <AlertSettingsPanel />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

definePageMeta({
  layout: 'default',
})

// Admin access check
const { isAdmin } = useUserRoles()
const hasAdminAccess = computed(() => isAdmin.value)

// Tab state
const activeTab = ref(0)
const tabs = [
  { label: 'Organization Overview', icon: 'i-heroicons-building-office-2' },
  { label: 'Alert History', icon: 'i-heroicons-bell-alert' },
  { label: 'Lambda Logs', icon: 'i-heroicons-command-line' },
  { label: 'Settings', icon: 'i-heroicons-cog-6-tooth' },
]

// View account alerts handler
function viewAccountAlerts(accountId: string) {
  navigateTo(`/account/${accountId}?tab=alerts`)
}
</script>
