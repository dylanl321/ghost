<template>
  <div>
    <span class="text-gray-400">{{ label }}:</span>
    <p class="font-mono truncate">{{ value || '-' }}</p>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  label: string
  value?: string | number
}>()
</script>