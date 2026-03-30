<template>
  <div class="flex flex-col items-center gap-4">
    <!-- Pass rate ring gauge -->
    <div class="relative">
      <svg width="120" height="120" viewBox="0 0 120 120">
        <!-- Background ring -->
        <circle
          cx="60"
          cy="60"
          r="48"
          fill="none"
          stroke-width="10"
          class="stroke-gray-200 dark:stroke-gray-700"
        />
        <!-- Progress ring -->
        <circle
          cx="60"
          cy="60"
          r="48"
          fill="none"
          stroke-width="10"
          stroke-linecap="round"
          :stroke="passRateColor"
          :stroke-dasharray="`${progressArc} ${circumference}`"
          stroke-dashoffset="0"
          transform="rotate(-90 60 60)"
        />
        <!-- Pass rate text -->
        <text x="60" y="54" text-anchor="middle" class="fill-gray-900 dark:fill-white" font-size="20" font-weight="700">
          {{ props.compliance.passRate }}%
        </text>
        <text x="60" y="70" text-anchor="middle" fill="#6b7280" font-size="10">
          Pass Rate
        </text>
      </svg>
    </div>

    <!-- Counts grid -->
    <div class="grid grid-cols-2 gap-2 w-full">
      <div class="text-center p-2 rounded-lg bg-green-50 dark:bg-green-900/20">
        <div class="text-lg font-bold text-green-600 dark:text-green-400">{{ props.compliance.passed }}</div>
        <div class="text-xs text-gray-500">Passed</div>
      </div>
      <div class="text-center p-2 rounded-lg bg-red-50 dark:bg-red-900/20">
        <div class="text-lg font-bold text-red-600 dark:text-red-400">{{ props.compliance.failed }}</div>
        <div class="text-xs text-gray-500">Failed</div>
      </div>
      <div class="text-center p-2 rounded-lg bg-yellow-50 dark:bg-yellow-900/20">
        <div class="text-lg font-bold text-yellow-600 dark:text-yellow-400">{{ props.compliance.warning }}</div>
        <div class="text-xs text-gray-500">Warning</div>
      </div>
      <div class="text-center p-2 rounded-lg bg-gray-50 dark:bg-gray-800">
        <div class="text-lg font-bold text-gray-500">{{ props.compliance.notAvailable }}</div>
        <div class="text-xs text-gray-500">N/A</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  compliance: {
    passed: number
    failed: number
    warning: number
    notAvailable: number
    passRate: number
  }
}>()

const circumference = 2 * Math.PI * 48 // ~301.6

const progressArc = computed(() => {
  const pct = Math.min(100, Math.max(0, props.compliance.passRate)) / 100
  return pct * circumference
})

const passRateColor = computed(() => {
  const rate = props.compliance.passRate
  if (rate >= 80) return '#22c55e'
  if (rate >= 60) return '#eab308'
  return '#ef4444'
})
</script>
