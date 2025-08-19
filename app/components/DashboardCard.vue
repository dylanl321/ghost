<template>
  <UCard :class="cardClasses">
    <template #header v-if="title || $slots.header">
      <div class="flex items-center justify-between">
        <h3 class="text-lg font-semibold text-highlighted">
          {{ title }}
        </h3>
        <slot name="header-action" />
      </div>
    </template>

    <div :class="contentClasses">
      <slot />
    </div>

    <template #footer v-if="$slots.footer">
      <slot name="footer" />
    </template>
  </UCard>
</template>

<script setup lang="ts">
import { computed } from 'vue'

export interface DashboardCardProps {
  title?: string
  variant?: 'default' | 'elevated' | 'bordered'
  loading?: boolean
  compact?: boolean
}

const props = withDefaults(defineProps<DashboardCardProps>(), {
  variant: 'default',
  loading: false,
  compact: false
})

const cardClasses = computed(() => {
  const classes = []
  
  if (props.variant === 'elevated') {
    classes.push('shadow-lg hover:shadow-xl transition-shadow')
  } else if (props.variant === 'bordered') {
    classes.push('border-2 border-primary-500')
  }
  
  if (props.loading) {
    classes.push('opacity-50 pointer-events-none')
  }
  
  return classes.join(' ')
})

const contentClasses = computed(() => {
  return props.compact ? 'p-2' : 'p-4'
})
</script>