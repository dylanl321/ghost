<template>
  <div class="container mx-auto px-6 py-8 max-w-7xl">
    <div class="mb-6">
      <UButton color="gray" variant="ghost" icon="i-heroicons-arrow-left" @click="navigateTo('/admin/costs')" class="mb-4">
        Back to Cost Management
      </UButton>
      <div class="flex items-center gap-3 mb-2">
        <div class="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
          <Icon name="i-heroicons-tag" class="w-6 h-6 text-blue-600 dark:text-blue-400" />
        </div>
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white">Tag Compliance</h1>
      </div>
      <p class="text-gray-600 dark:text-gray-400">Analyze cost allocation tag coverage across your AWS accounts</p>
    </div>
    <TagCompliancePanel />
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  middleware: 'auth-permission',
  permission: 'admin',
  title: 'Tag Compliance',
  description: 'Analyze cost allocation tag coverage'
})
</script>
