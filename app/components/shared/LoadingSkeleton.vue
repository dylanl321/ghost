<template>
  <!-- Metric: small card with title + number + detail line -->
  <div v-if="type === 'metric'" class="animate-pulse space-y-2">
    <div class="h-3 w-24 bg-gray-700/50 rounded" />
    <div class="h-6 w-20 bg-gray-700/50 rounded" />
    <div class="h-3 w-28 bg-gray-700/50 rounded" />
  </div>

  <!-- Card: title area + content block -->
  <div v-else-if="type === 'card'" class="animate-pulse space-y-3">
    <div class="flex justify-between">
      <div class="h-3 w-24 bg-gray-700/50 rounded" />
      <div class="h-3 w-16 bg-gray-700/50 rounded" />
    </div>
    <div class="h-16 w-full bg-gray-700/50 rounded-lg" />
    <div class="space-y-2">
      <div class="h-3 w-full bg-gray-700/50 rounded" />
      <div class="h-3 w-3/4 bg-gray-700/50 rounded" />
    </div>
  </div>

  <!-- Table: repeating rows with columns -->
  <div v-else-if="type === 'table'" class="space-y-2">
    <div v-for="i in count" :key="i" class="animate-pulse flex items-center gap-3 py-2">
      <div class="h-4 w-32 bg-gray-700/50 rounded" />
      <div class="flex-1 h-2 bg-gray-700/50 rounded-full" />
      <div class="h-4 w-16 bg-gray-700/50 rounded" />
    </div>
  </div>

  <!-- Chart: rectangular area with optional label rows -->
  <div v-else-if="type === 'chart'" class="animate-pulse space-y-3">
    <div class="flex gap-3">
      <div v-for="i in count" :key="i" class="h-10 flex-1 bg-gray-700/50 rounded-lg" />
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  type: 'card' | 'table' | 'metric' | 'chart'
  count?: number
}>(), {
  count: 1,
})
</script>
