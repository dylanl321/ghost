<template>
  <div :class="containerClasses">
    <div class="flex items-start justify-between">
      <div>
        <p class="text-sm font-medium text-muted">{{ label }}</p>
        <p :class="valueClasses">
          <span v-if="prefix">{{ prefix }}</span>
          {{ formattedValue }}
          <span v-if="suffix">{{ suffix }}</span>
        </p>
      </div>
      <div v-if="trend" :class="trendClasses">
        <UIcon :name="trendIcon" class="w-4 h-4" />
        <span class="text-sm font-medium">{{ Math.abs(trend) }}%</span>
      </div>
    </div>
    <p v-if="description" class="mt-2 text-xs text-muted">
      {{ description }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

export interface MetricDisplayProps {
  label: string
  value: number | string
  prefix?: string
  suffix?: string
  trend?: number
  description?: string
  size?: 'sm' | 'md' | 'lg'
  format?: 'number' | 'currency' | 'percent'
}

const props = withDefaults(defineProps<MetricDisplayProps>(), {
  size: 'md',
  format: 'number'
})

const formattedValue = computed(() => {
  const val = typeof props.value === 'string' ? parseFloat(props.value) : props.value
  
  if (isNaN(val)) return props.value
  
  switch (props.format) {
    case 'currency':
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(val).replace('$', '')
    case 'percent':
      return `${val.toFixed(1)}%`
    case 'number':
    default:
      return new Intl.NumberFormat('en-US').format(val)
  }
})

const containerClasses = computed(() => {
  const classes = ['rounded-lg border bg-white dark:bg-neutral-900 dark:border-neutral-800']
  
  switch (props.size) {
    case 'sm':
      classes.push('p-3')
      break
    case 'lg':
      classes.push('p-6')
      break
    case 'md':
    default:
      classes.push('p-4')
  }
  
  return classes.join(' ')
})

const valueClasses = computed(() => {
  const classes = ['font-semibold text-highlighted']
  
  switch (props.size) {
    case 'sm':
      classes.push('text-xl')
      break
    case 'lg':
      classes.push('text-4xl')
      break
    case 'md':
    default:
      classes.push('text-2xl')
  }
  
  return classes.join(' ')
})

const trendClasses = computed(() => {
  const classes = ['flex items-center gap-1']
  
  if (props.trend && props.trend > 0) {
    classes.push('text-success-500')
  } else if (props.trend && props.trend < 0) {
    classes.push('text-error-500')
  } else {
    classes.push('text-muted')
  }
  
  return classes.join(' ')
})

const trendIcon = computed(() => {
  if (!props.trend) return ''
  return props.trend > 0 ? 'i-heroicons-arrow-trending-up' : 'i-heroicons-arrow-trending-down'
})
</script>