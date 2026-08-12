<script setup lang="ts">
defineProps<{ value: string; label: string; multiline?: boolean }>()
defineEmits<{ copy: [] }>()
</script>

<template>
  <div class="relative bg-gray-950 border border-gray-800 rounded-md overflow-hidden">
    <pre class="font-mono text-xs text-gray-100 p-3 pr-11 overflow-x-auto" :class="multiline ? 'whitespace-pre-wrap' : 'whitespace-pre'">{{ value }}</pre>
    <UTooltip :text="`Copy ${label.toLowerCase()}`">
      <UButton icon="i-heroicons-clipboard" color="gray" variant="ghost" square size="xs" class="absolute top-2 right-2 text-gray-300" @click="$emit('copy')" />
    </UTooltip>
  </div>
</template>

