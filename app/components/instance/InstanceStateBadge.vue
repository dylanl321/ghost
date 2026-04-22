<template>
  <UBadge :color="color" variant="soft" :size="size">
    <UIcon :name="icon" class="w-3 h-3 mr-1" />
    {{ state }}
  </UBadge>
</template>

<script setup lang="ts">
const props = defineProps<{
  state: string
  size?: 'xs' | 'sm' | 'md' | 'lg'
}>()

const colorMap: Record<string, string> = {
  running: 'green',
  stopped: 'red',
  pending: 'yellow',
  'shutting-down': 'orange',
  terminated: 'gray',
  stopping: 'orange',
}

const iconMap: Record<string, string> = {
  running: 'i-heroicons-play-circle',
  stopped: 'i-heroicons-stop-circle',
  pending: 'i-heroicons-clock',
  'shutting-down': 'i-heroicons-arrow-down-circle',
  terminated: 'i-heroicons-x-circle',
  stopping: 'i-heroicons-pause-circle',
}

const color = computed(() => (colorMap[props.state] || 'gray') as any)
const icon = computed(() => iconMap[props.state] || 'i-heroicons-question-mark-circle')
const size = computed(() => props.size || 'sm')
</script>
