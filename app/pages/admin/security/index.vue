<template>
  <div class="container mx-auto px-6 py-8 max-w-7xl">
    <!-- Header with Back Button -->
    <div class="mb-6">
      <UButton
        color="gray"
        variant="ghost"
        icon="i-heroicons-arrow-left"
        @click="navigateTo('/admin')"
        class="mb-4"
      >
        Back to Dashboard
      </UButton>

      <div class="flex items-center gap-3 mb-2">
        <div class="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
          <Icon name="i-heroicons-shield-check" class="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
        </div>
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white">
          Security Data Management
        </h1>
      </div>
      <p class="text-gray-600 dark:text-gray-400">
        Manage Security Health Dashboard data, trigger recomputation, and monitor cache status
      </p>
    </div>

    <SecurityDataPanel />
  </div>
</template>

<script setup lang="ts">
import SecurityDataPanel from '~/components/admin/SecurityDataPanel.vue'

definePageMeta({
  layout: 'admin',
  middleware: 'auth-permission',
  permission: 'admin',
  title: 'Security Data Management',
  description: 'Manage security dashboard data and Athena recomputation'
})
</script>
