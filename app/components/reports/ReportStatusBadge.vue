<template>
  <UBadge
    :color="statusColor"
    :variant="variant"
    size="sm"
  >
    <Icon v-if="showIcon" :name="statusIcon" class="w-3 h-3 mr-1" />
    {{ statusLabel }}
  </UBadge>
</template>

<script setup lang="ts">
import type { ReportStatus } from '#shared/types/scheduled-reports'

const props = defineProps<{
  status: ReportStatus
  showIcon?: boolean
}>()

const statusColor = computed(() => {
  switch (props.status) {
    case 'active':
      return 'green'
    case 'paused':
      return 'yellow'
    case 'disabled':
      return 'gray'
    default:
      return 'gray'
  }
})

const variant = computed(() => {
  return props.status === 'active' ? 'soft' : 'soft'
})

const statusIcon = computed(() => {
  switch (props.status) {
    case 'active':
      return 'i-heroicons-check-circle'
    case 'paused':
      return 'i-heroicons-pause-circle'
    case 'disabled':
      return 'i-heroicons-x-circle'
    default:
      return 'i-heroicons-question-mark-circle'
  }
})

const statusLabel = computed(() => {
  switch (props.status) {
    case 'active':
      return 'Active'
    case 'paused':
      return 'Paused'
    case 'disabled':
      return 'Disabled'
    default:
      return props.status
  }
})
</script>
