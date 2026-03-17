<template>
  <ul class="space-y-2">
    <li
      v-for="(rec, index) in recommendations"
      :key="index"
      class="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300"
    >
      <UIcon name="i-heroicons-light-bulb" class="w-4 h-4 text-yellow-500 mt-0.5 shrink-0" />
      <span>{{ rec }}</span>
    </li>
  </ul>
</template>

<script setup lang="ts">
defineProps<{
  recommendations: string[]
}>()
</script>
