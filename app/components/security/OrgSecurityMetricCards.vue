<template>
  <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
    <!-- Total Findings -->
    <UCard>
      <div class="flex items-start gap-3">
        <div class="p-2 rounded-lg bg-gray-100 dark:bg-gray-800">
          <UIcon name="i-heroicons-exclamation-triangle" class="w-5 h-5 text-gray-600 dark:text-gray-400" />
        </div>
        <div>
          <div class="text-2xl font-bold text-gray-900 dark:text-white">{{ totalFindings.toLocaleString() }}</div>
          <div class="text-sm text-gray-500 dark:text-gray-400">Total Findings</div>
        </div>
      </div>
    </UCard>

    <!-- Accounts at Risk -->
    <UCard>
      <div class="flex items-start gap-3">
        <div class="p-2 rounded-lg bg-red-100 dark:bg-red-900/30">
          <UIcon name="i-heroicons-shield-exclamation" class="w-5 h-5 text-red-600 dark:text-red-400" />
        </div>
        <div>
          <div class="text-2xl font-bold" :class="accountsAtRisk > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'">
            {{ accountsAtRisk }}
          </div>
          <div class="text-sm text-gray-500 dark:text-gray-400">Accounts at Risk</div>
        </div>
      </div>
    </UCard>

    <!-- Org Risk Score -->
    <UCard>
      <div class="flex items-start gap-3">
        <div class="p-2 rounded-lg" :class="riskScoreBg">
          <UIcon name="i-heroicons-chart-bar" class="w-5 h-5" :class="riskScoreIconColor" />
        </div>
        <div>
          <div class="text-2xl font-bold" :class="riskScoreTextColor">{{ orgRiskScore }}</div>
          <div class="text-sm text-gray-500 dark:text-gray-400">Org Risk Score</div>
          <div class="text-xs mt-0.5" :class="riskScoreTextColor">{{ riskLabel }}</div>
        </div>
      </div>
    </UCard>

    <!-- Compliance Rate -->
    <UCard>
      <div class="flex items-start gap-3">
        <div class="p-2 rounded-lg" :class="complianceBg">
          <UIcon name="i-heroicons-check-badge" class="w-5 h-5" :class="complianceIconColor" />
        </div>
        <div>
          <div class="text-2xl font-bold" :class="complianceTextColor">{{ complianceRate }}%</div>
          <div class="text-sm text-gray-500 dark:text-gray-400">Compliance Rate</div>
        </div>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  totalFindings: number
  accountsAtRisk: number
  orgRiskScore: number
  complianceRate: number
}>()

const riskLabel = computed(() => {
  if (props.orgRiskScore >= 80) return 'CRITICAL'
  if (props.orgRiskScore >= 50) return 'HIGH'
  if (props.orgRiskScore >= 20) return 'MEDIUM'
  if (props.orgRiskScore > 0) return 'LOW'
  return 'MINIMAL'
})

const riskScoreBg = computed(() => {
  if (props.orgRiskScore >= 80) return 'bg-red-100 dark:bg-red-900/30'
  if (props.orgRiskScore >= 50) return 'bg-orange-100 dark:bg-orange-900/30'
  if (props.orgRiskScore >= 20) return 'bg-yellow-100 dark:bg-yellow-900/30'
  return 'bg-green-100 dark:bg-green-900/30'
})

const riskScoreIconColor = computed(() => {
  if (props.orgRiskScore >= 80) return 'text-red-600 dark:text-red-400'
  if (props.orgRiskScore >= 50) return 'text-orange-600 dark:text-orange-400'
  if (props.orgRiskScore >= 20) return 'text-yellow-600 dark:text-yellow-400'
  return 'text-green-600 dark:text-green-400'
})

const riskScoreTextColor = computed(() => {
  if (props.orgRiskScore >= 80) return 'text-red-600 dark:text-red-400'
  if (props.orgRiskScore >= 50) return 'text-orange-600 dark:text-orange-400'
  if (props.orgRiskScore >= 20) return 'text-yellow-600 dark:text-yellow-400'
  return 'text-green-600 dark:text-green-400'
})

const complianceBg = computed(() => {
  if (props.complianceRate >= 80) return 'bg-green-100 dark:bg-green-900/30'
  if (props.complianceRate >= 50) return 'bg-yellow-100 dark:bg-yellow-900/30'
  return 'bg-red-100 dark:bg-red-900/30'
})

const complianceIconColor = computed(() => {
  if (props.complianceRate >= 80) return 'text-green-600 dark:text-green-400'
  if (props.complianceRate >= 50) return 'text-yellow-600 dark:text-yellow-400'
  return 'text-red-600 dark:text-red-400'
})

const complianceTextColor = computed(() => {
  if (props.complianceRate >= 80) return 'text-green-600 dark:text-green-400'
  if (props.complianceRate >= 50) return 'text-yellow-600 dark:text-yellow-400'
  return 'text-red-600 dark:text-red-400'
})
</script>
