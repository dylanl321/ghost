<template>
  <UButtonGroup size="sm">
    <UButton
      v-for="opt in options"
      :key="opt.value"
      :color="modelValue === opt.value ? 'primary' : 'gray'"
      :variant="modelValue === opt.value ? 'solid' : 'ghost'"
      @click="$emit('update:modelValue', opt.value)"
    >
      {{ opt.label }}
    </UButton>
  </UButtonGroup>
</template>

<script setup lang="ts">
import type { SecuritySourceFilter } from '../../../../shared/types/security-dashboard'

defineProps<{
  modelValue: SecuritySourceFilter
}>()

defineEmits<{
  'update:modelValue': [value: SecuritySourceFilter]
}>()

const options: { label: string; value: SecuritySourceFilter }[] = [
  { label: 'All Sources', value: 'all' },
  { label: 'Platform Only', value: 'platform' },
  { label: 'OS (InSpec)', value: 'os' },
]
</script>
