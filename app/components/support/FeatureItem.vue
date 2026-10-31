<template>
  <div class="flex items-start gap-2 p-2">
    <UIcon
      :name="icon"
      :class="enabled ? 'text-green-500' : 'text-gray-600'"
      class="w-5 h-5 mt-0.5 flex-shrink-0"
    />
    <div>
      <div class="text-sm font-medium" :class="enabled ? 'text-white' : 'text-gray-500'">
        {{ title }}
      </div>
      <div class="text-xs" :class="enabled ? 'text-gray-400' : 'text-gray-600'">
        {{ description }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  icon: string
  title: string
  description: string
  enabled: boolean
}>()
</script>
