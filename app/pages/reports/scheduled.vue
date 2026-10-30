<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
    <div class="max-w-7xl mx-auto">
      <!-- Header -->
      <div class="mb-8">
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-3">
            <h1 class="text-3xl font-bold text-gray-900 dark:text-white">
              Scheduled Reports
            </h1>
            <UTooltip text="Learn how to create and manage scheduled reports">
              <NuxtLink to="/support/docs?topic=reports-guide" class="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300">
                <UIcon name="i-heroicons-question-mark-circle" class="w-6 h-6" />
              </NuxtLink>
            </UTooltip>
          </div>
          <UButton
            color="blue"
            icon="i-heroicons-plus"
            @click="manager?.openCreateModal()"
            :disabled="manager ? !manager.canCreateMore : true"
          >
            Create New Report
          </UButton>
        </div>
        <p class="text-gray-600 dark:text-gray-400">
          Automate cost reports to be delivered to your inbox on a recurring schedule
        </p>
      </div>

      <ScheduledReportsManager ref="manager" />
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  title: 'Scheduled Reports',
  description: 'Manage your automated cost reports'
})

const manager = ref<{ openCreateModal: () => void; canCreateMore: boolean } | null>(null)
</script>
