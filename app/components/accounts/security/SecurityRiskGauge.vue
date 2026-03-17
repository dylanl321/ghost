<template>
  <div class="flex flex-col items-center gap-3">
    <!-- SVG ring gauge -->
    <div class="relative">
      <svg width="140" height="140" viewBox="0 0 140 140">
        <!-- Background ring -->
        <circle
          cx="70"
          cy="70"
          r="56"
          fill="none"
          stroke-width="12"
          class="stroke-gray-200 dark:stroke-gray-700"
        />
        <!-- Progress ring (starts at top, goes clockwise) -->
        <circle
          cx="70"
          cy="70"
          r="56"
          fill="none"
          stroke-width="12"
          stroke-linecap="round"
          :stroke="gaugeColor"
          :stroke-dasharray="`${progressArc} ${circumference}`"
          stroke-dashoffset="0"
          transform="rotate(-90 70 70)"
        />
        <!-- Score text -->
        <text x="70" y="62" text-anchor="middle" class="fill-gray-900 dark:fill-white" font-size="26" font-weight="700">
          {{ riskScore }}
        </text>
        <text x="70" y="80" text-anchor="middle" fill="#6b7280" font-size="11">
          Risk Score
        </text>
      </svg>
    </div>

    <!-- Risk level badge -->
    <UBadge :color="badgeColor" variant="soft" size="md" class="font-semibold tracking-wide">
      {{ riskLevel }}
    </UBadge>

    <!-- Total findings -->
    <div class="text-center">
      <span class="text-2xl font-bold text-gray-900 dark:text-white">{{ totalFindings }}</span>
      <p class="text-xs text-gray-500 dark:text-gray-400">Total Findings</p>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  riskScore: number
  riskLevel: string
  totalFindings: number
}>()

const circumference = 2 * Math.PI * 56 // ~351.86

const progressArc = computed(() => {
  const pct = Math.min(100, Math.max(0, props.riskScore)) / 100
  return pct * circumference
})

const gaugeColor = computed(() => {
  switch (props.riskLevel) {
    case 'CRITICAL': return '#ef4444'
    case 'HIGH': return '#f97316'
    case 'MEDIUM': return '#eab308'
    case 'LOW': return '#22c55e'
    default: return '#3b82f6'
  }
})

const badgeColor = computed(() => {
  switch (props.riskLevel) {
    case 'CRITICAL': return 'red'
    case 'HIGH': return 'orange'
    case 'MEDIUM': return 'yellow'
    case 'LOW': return 'green'
    default: return 'blue'
  }
})
</script>
