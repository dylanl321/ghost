<template>
  <div class="container mx-auto px-6 py-8 max-w-7xl">
    <div class="mb-6">
      <UButton color="gray" variant="ghost" icon="i-heroicons-arrow-left" @click="navigateTo('/admin/costs')" class="mb-4">
        Back to Cost Management
      </UButton>
      <div class="flex items-center gap-3 mb-2">
        <div class="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
          <Icon name="i-heroicons-clipboard-document-check" class="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
        </div>
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white">Data Validation</h1>
      </div>
      <p class="text-gray-600 dark:text-gray-400">Validate cost data accuracy between API and AWS Cost Explorer</p>
    </div>
    <ValidationPanel />
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  middleware: 'auth-permission',
  permission: 'admin',
  title: 'Data Validation',
  description: 'Validate cost data accuracy'
})
</script>
