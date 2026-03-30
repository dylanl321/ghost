<template>
  <USlideover v-model="isOpen" :ui="{ width: 'max-w-3xl' }">
    <div class="flex flex-col h-full">
      <!-- Header -->
      <div class="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <div>
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">{{ title }}</h3>
          <p v-if="subtitle" class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{{ subtitle }}</p>
        </div>
        <UButton icon="i-heroicons-x-mark" color="gray" variant="ghost" @click="isOpen = false" />
      </div>

      <!-- Body -->
      <div class="flex-1 overflow-y-auto p-4">
        <div v-if="filteredFindings.length > 0">
          <SecurityFindingsTable :findings="filteredFindings" />
        </div>
        <div v-else class="flex flex-col items-center justify-center py-16 gap-3">
          <UIcon name="i-heroicons-shield-check" class="w-12 h-12 text-green-400 opacity-70" />
          <p class="text-sm text-gray-500 dark:text-gray-400">No findings match the current filter</p>
        </div>
      </div>
    </div>
  </USlideover>
</template>

<script setup lang="ts">
import type { SecurityFindingSummary } from '../../../shared/types/security-dashboard'

export interface GaugeFilterCriteria {
  type: 'risk' | 'compliance'
  severity?: string
  complianceStatus?: 'PASSED' | 'FAILED'
}

const props = defineProps<{
  open: boolean
  title: string
  subtitle?: string
  findings: SecurityFindingSummary[]
  filterCriteria?: GaugeFilterCriteria
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
}>()

const isOpen = computed({
  get: () => props.open,
  set: (val) => emit('update:open', val),
})

const filteredFindings = computed(() => {
  if (!props.filterCriteria) return props.findings

  return props.findings.filter((f) => {
    if (props.filterCriteria!.severity) {
      return f.severity === props.filterCriteria!.severity
    }
    if (props.filterCriteria!.complianceStatus === 'FAILED') {
      return f.complianceStatus !== 'PASSED'
    }
    if (props.filterCriteria!.complianceStatus === 'PASSED') {
      return f.complianceStatus === 'PASSED'
    }
    return true
  })
})
</script>
