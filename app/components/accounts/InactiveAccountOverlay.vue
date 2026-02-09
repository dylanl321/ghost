<template>
  <div class="relative">
    <slot :class="{ 'opacity-50 pointer-events-none': active }" />
    <div v-if="active" class="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-gray-900/80 rounded-lg">
      <div class="text-center p-4">
        <UIcon name="i-heroicons-exclamation-triangle" class="w-12 h-12 text-yellow-400 mx-auto mb-2" />
        <p class="text-gray-900 dark:text-white font-semibold mb-1">Account {{ status }}</p>
        <p class="text-sm text-gray-600 dark:text-gray-400">{{ message }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  /** Whether the overlay is shown */
  active: boolean
  /** Account status label (e.g. "Decommissioned") */
  status?: string
  /** Message shown below the status */
  message?: string
}>()
</script>
