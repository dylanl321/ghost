<template>
  <UCard>
    <template #header>
      <div class="text-base font-semibold text-gray-900 dark:text-white">Compliance Overview</div>
    </template>
    <div class="flex flex-col items-center gap-4 cursor-pointer transition-transform hover:scale-105" @click="emit('drill-down')">
      <!-- Ring gauge -->
      <div class="relative w-36 h-36">
        <svg viewBox="0 0 120 120" class="w-full h-full">
          <!-- Background ring -->
          <circle cx="60" cy="60" r="50" fill="none" :stroke="isDark ? '#374151' : '#e5e7eb'" stroke-width="10" />
          <!-- Progress ring -->
          <circle
            cx="60" cy="60" r="50" fill="none"
            :stroke="gaugeColor"
            stroke-width="10"
            stroke-linecap="round"
            :stroke-dasharray="circumference"
            :stroke-dashoffset="dashOffset"
            transform="rotate(-90 60 60)"
            class="transition-all duration-700"
          />
        </svg>
        <div class="absolute inset-0 flex flex-col items-center justify-center">
          <span class="text-2xl font-bold" :class="textColor">{{ complianceRate }}%</span>
          <span class="text-xs text-gray-500 dark:text-gray-400">pass rate</span>
        </div>
      </div>

      <!-- Status breakdown grid -->
      <div class="grid grid-cols-2 gap-3 w-full">
        <div class="flex items-center gap-2 p-2 rounded-lg bg-green-50 dark:bg-green-900/20">
          <UIcon name="i-heroicons-check-circle" class="w-4 h-4 text-green-600 dark:text-green-400" />
          <div>
            <div class="text-sm font-semibold text-green-700 dark:text-green-300">{{ passed.toLocaleString() }}</div>
            <div class="text-xs text-green-600 dark:text-green-400">Passed</div>
          </div>
        </div>
        <div class="flex items-center gap-2 p-2 rounded-lg bg-red-50 dark:bg-red-900/20">
          <UIcon name="i-heroicons-x-circle" class="w-4 h-4 text-red-600 dark:text-red-400" />
          <div>
            <div class="text-sm font-semibold text-red-700 dark:text-red-300">{{ failed.toLocaleString() }}</div>
            <div class="text-xs text-red-600 dark:text-red-400">Failed</div>
          </div>
        </div>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
const props = defineProps<{
  complianceRate: number
  passed: number
  failed: number
}>()

const emit = defineEmits<{ 'drill-down': [] }>()

const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')

const circumference = 2 * Math.PI * 50 // ~314.16
const dashOffset = computed(() => circumference - (circumference * props.complianceRate / 100))

const gaugeColor = computed(() => {
  if (props.complianceRate >= 80) return '#22C55E'
  if (props.complianceRate >= 60) return '#EAB308'
  return '#EF4444'
})

const textColor = computed(() => {
  if (props.complianceRate >= 80) return 'text-green-600 dark:text-green-400'
  if (props.complianceRate >= 60) return 'text-yellow-600 dark:text-yellow-400'
  return 'text-red-600 dark:text-red-400'
})
</script>
