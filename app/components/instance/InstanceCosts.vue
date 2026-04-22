<template>
  <div class="space-y-4 mt-4">
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <!-- Cost Estimate -->
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-currency-dollar" class="w-4 h-4 text-gray-400" />
            <span class="font-semibold text-sm">Cost Estimate</span>
          </div>
        </template>
        <div v-if="instance.pricingInfo" class="space-y-3">
          <div class="grid grid-cols-2 gap-4">
            <div class="p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
              <div class="text-xs text-gray-500 dark:text-gray-400 mb-1">Hourly</div>
              <div class="text-xl font-bold text-gray-900 dark:text-white">${{ instance.pricingInfo.hourlyRate?.toFixed(4) }}</div>
            </div>
            <div class="p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
              <div class="text-xs text-gray-500 dark:text-gray-400 mb-1">Monthly</div>
              <div class="text-xl font-bold text-gray-900 dark:text-white">${{ instance.pricingInfo.monthlyEstimate?.toFixed(2) }}</div>
            </div>
          </div>
          <div class="text-xs text-gray-500 dark:text-gray-400">
            <span v-if="instance.pricingInfo.currency">Currency: {{ instance.pricingInfo.currency }}</span>
            <span v-if="instance.pricingInfo.pricingRegion"> · Region: {{ instance.pricingInfo.pricingRegion }}</span>
          </div>
        </div>
        <div v-else class="text-sm text-gray-400 text-center py-6">Pricing data unavailable</div>
      </UCard>

      <!-- Optimization Status -->
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-bolt" class="w-4 h-4 text-gray-400" />
            <span class="font-semibold text-sm">Optimization Status</span>
          </div>
        </template>
        <div v-if="optimization" class="space-y-3">
          <div class="flex items-center gap-3">
            <UBadge :color="findingColor" variant="soft" size="lg">{{ optimization.finding || 'N/A' }}</UBadge>
            <div v-if="optimization.estimatedMonthlySavings" class="text-green-600 dark:text-green-400 font-semibold">
              Save ~${{ optimization.estimatedMonthlySavings }}/mo
            </div>
          </div>
          <div class="text-xs text-gray-500">Source: {{ optimization.source }}</div>
          <div v-if="optimization.findingReasonCodes?.length" class="space-y-1">
            <div class="text-xs text-gray-500 font-medium">Reason Codes:</div>
            <div v-for="code in optimization.findingReasonCodes" :key="code" class="text-xs text-gray-600 dark:text-gray-400">
              · {{ code }}
            </div>
          </div>
        </div>
        <div v-else class="text-sm text-gray-400 text-center py-6">
          <p>No optimization data available</p>
          <p class="text-xs mt-1">Enable AWS Compute Optimizer for recommendations</p>
        </div>
      </UCard>
    </div>

    <!-- Recommendation Options -->
    <UCard v-if="optimization?.recommendationOptions?.length">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-heroicons-arrow-trending-up" class="w-4 h-4 text-gray-400" />
          <span class="font-semibold text-sm">Rightsizing Recommendations</span>
        </div>
      </template>
      <div class="space-y-3">
        <div v-for="(option, idx) in optimization.recommendationOptions" :key="idx" class="p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50 space-y-2">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="text-sm font-semibold text-gray-900 dark:text-white">{{ option.instanceType || `Option ${idx + 1}` }}</span>
              <UBadge v-if="option.migrationEffort" color="gray" variant="soft" size="xs">{{ option.migrationEffort }}</UBadge>
            </div>
            <div v-if="option.estimatedMonthlySavings" class="text-sm text-green-600 dark:text-green-400 font-medium">
              Save ${{ option.estimatedMonthlySavings }}/mo
            </div>
          </div>
          <div v-if="option.performanceRisk !== undefined" class="text-xs text-gray-500">
            Performance Risk: {{ option.performanceRisk }}/5
          </div>
        </div>
      </div>
    </UCard>

    <!-- Instance Type Insights -->
    <UCard v-if="insights">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-heroicons-cpu-chip" class="w-4 h-4 text-gray-400" />
          <span class="font-semibold text-sm">Instance Type Insights</span>
        </div>
      </template>
      <div class="space-y-3">
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
          <div>
            <div class="text-gray-500 dark:text-gray-400 text-xs">Family</div>
            <div class="text-gray-900 dark:text-white font-medium">{{ insights.family }}</div>
          </div>
          <div>
            <div class="text-gray-500 dark:text-gray-400 text-xs">Generation</div>
            <div class="text-gray-900 dark:text-white font-medium">{{ insights.generation }}</div>
          </div>
          <div>
            <div class="text-gray-500 dark:text-gray-400 text-xs">vCPUs</div>
            <div class="text-gray-900 dark:text-white font-medium">{{ insights.vcpus }}</div>
          </div>
          <div>
            <div class="text-gray-500 dark:text-gray-400 text-xs">Memory</div>
            <div class="text-gray-900 dark:text-white font-medium">{{ insights.memoryMb ? `${(insights.memoryMb / 1024).toFixed(1)} GB` : 'N/A' }}</div>
          </div>
        </div>
        <div v-if="insights.processorInfo" class="text-sm">
          <span class="text-gray-500 dark:text-gray-400">Processor:</span>
          <span class="text-gray-900 dark:text-white ml-1">{{ insights.processorInfo }}</span>
        </div>
        <div v-if="insights.networkPerformance" class="text-sm">
          <span class="text-gray-500 dark:text-gray-400">Network:</span>
          <span class="text-gray-900 dark:text-white ml-1">{{ insights.networkPerformance }}</span>
        </div>
        <div v-if="insights.generalRecommendations?.length" class="space-y-1 pt-2 border-t border-gray-100 dark:border-gray-700">
          <div class="text-xs text-gray-500 font-medium">Recommendations</div>
          <div v-for="rec in insights.generalRecommendations" :key="rec" class="flex items-start gap-1.5 text-xs text-gray-600 dark:text-gray-400">
            <UIcon name="i-heroicons-light-bulb" class="w-3 h-3 mt-0.5 text-yellow-500 flex-shrink-0" />
            <span>{{ rec }}</span>
          </div>
        </div>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  instance: any
  optimization: any | null
}>()

const insights = computed(() => props.optimization?.awsInsights || props.instance?.awsOptimizationInsights)

const findingColor = computed(() => {
  const f = props.optimization?.finding
  if (f === 'OPTIMIZED') return 'green'
  if (f === 'OVER_PROVISIONED') return 'yellow'
  if (f === 'UNDER_PROVISIONED') return 'orange'
  if (f === 'NOT_OPTIMIZED') return 'red'
  return 'gray'
})
</script>
