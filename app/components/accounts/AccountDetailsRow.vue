<template>
  <div>
    <span class="text-gray-600 dark:text-gray-400">{{ label }}:</span>
    <p class="font-mono min-w-20 wrap-anywhere text-gray-900 dark:text-white">{{ value || '-' }}</p>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  label: string
  value?: string | number
}>()
</script>

<style>
.wrap-anywhere {
  word-wrap: break-word;
}
</style>