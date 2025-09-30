<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900 py-12">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="mb-8">
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          System Logs
        </h1>
        <p class="text-gray-600 dark:text-gray-400">
          View application logs and debugging information
        </p>
      </div>

      <UCard>
        <div class="p-8 text-center">
          <Icon name="i-heroicons-wrench-screwdriver" class="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Under Construction
          </h2>
          <p class="text-gray-600 dark:text-gray-400">
            This feature is currently being developed and will be available soon.
          </p>
        </div>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  middleware: 'auth-permission',
  permission: 'admin.logs'
})
</script>