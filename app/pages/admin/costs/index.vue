<template>
  <div class="container mx-auto px-6 py-8 max-w-7xl">
    <div class="mb-6">
      <UButton color="gray" variant="ghost" icon="i-heroicons-arrow-left" @click="navigateTo('/admin')" class="mb-4">
        Back to Dashboard
      </UButton>
      <div class="flex items-center gap-3 mb-2">
        <div class="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
          <Icon name="i-heroicons-currency-dollar" class="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
        </div>
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white">Cost Management</h1>
      </div>
      <p class="text-gray-600 dark:text-gray-400">Monitor budget alerts, tag compliance, and cost data validation</p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      <UCard class="hover:shadow-lg transition-shadow cursor-pointer" @click="navigateTo('/admin/costs/budget-alerts')">
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <div class="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
              <Icon name="i-heroicons-bell-alert" class="w-6 h-6 text-red-600 dark:text-red-400" />
            </div>
            <Icon name="i-heroicons-arrow-right" class="w-5 h-5 text-gray-400" />
          </div>
          <div>
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Budget Alerts</h3>
            <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">Monitor budget alerts, view alert logs, and configure thresholds</p>
          </div>
          <div class="flex flex-wrap gap-2">
            <span class="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded-full text-gray-700 dark:text-gray-300">Overview</span>
            <span class="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded-full text-gray-700 dark:text-gray-300">Alert History</span>
            <span class="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded-full text-gray-700 dark:text-gray-300">Settings</span>
          </div>
        </div>
      </UCard>

      <UCard class="hover:shadow-lg transition-shadow cursor-pointer" @click="navigateTo('/admin/costs/tag-compliance')">
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <div class="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Icon name="i-heroicons-tag" class="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <Icon name="i-heroicons-arrow-right" class="w-5 h-5 text-gray-400" />
          </div>
          <div>
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Tag Compliance</h3>
            <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">Analyze cost allocation tag coverage across accounts</p>
          </div>
          <div class="flex flex-wrap gap-2">
            <span class="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded-full text-gray-700 dark:text-gray-300">Coverage</span>
            <span class="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded-full text-gray-700 dark:text-gray-300">Tags</span>
          </div>
        </div>
      </UCard>

      <UCard class="hover:shadow-lg transition-shadow cursor-pointer" @click="navigateTo('/admin/costs/data-validation')">
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <div class="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
              <Icon name="i-heroicons-clipboard-document-check" class="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <Icon name="i-heroicons-arrow-right" class="w-5 h-5 text-gray-400" />
          </div>
          <div>
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Data Validation</h3>
            <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">Validate cost data accuracy between API and AWS Cost Explorer</p>
          </div>
          <div class="flex flex-wrap gap-2">
            <span class="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded-full text-gray-700 dark:text-gray-300">Validation</span>
            <span class="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded-full text-gray-700 dark:text-gray-300">Accuracy</span>
          </div>
        </div>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  middleware: 'auth-permission',
  permission: 'admin',
  title: 'Cost Management',
  description: 'Monitor budget alerts, tag compliance, and cost data validation'
})
</script>
