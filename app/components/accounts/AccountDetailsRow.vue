<template>
  <div>
    <span class="text-gray-400">{{ label }}:</span>
    <p class="font-mono min-w-20 wrap-anywhere">{{ value || '-' }}</p>
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