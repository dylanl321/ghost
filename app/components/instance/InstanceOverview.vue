<template>
  <div class="space-y-4 mt-4">
    <!-- Key Metrics Row -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <UCard>
        <div class="text-xs text-gray-500 dark:text-gray-400 mb-1">State</div>
        <InstanceStateBadge :state="instance.instanceState || 'unknown'" size="md" />
      </UCard>
      <UCard>
        <div class="text-xs text-gray-500 dark:text-gray-400 mb-1">Instance Type</div>
        <div class="text-lg font-semibold text-gray-900 dark:text-white">{{ instance.instanceType || 'N/A' }}</div>
      </UCard>
      <UCard>
        <div class="text-xs text-gray-500 dark:text-gray-400 mb-1">Compute</div>
        <div v-if="insights" class="text-lg font-semibold text-gray-900 dark:text-white">
          {{ insights.vcpus }} vCPU · {{ formatMemory(insights.memoryMb) }}
        </div>
        <div v-else class="text-sm text-gray-400">N/A</div>
      </UCard>
      <UCard>
        <div class="text-xs text-gray-500 dark:text-gray-400 mb-1">Launch Time</div>
        <div class="text-sm font-medium text-gray-900 dark:text-white">{{ launchTimeFormatted }}</div>
      </UCard>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <!-- Health Score -->
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-heart" class="w-4 h-4 text-gray-400" />
            <span class="font-semibold text-sm">Health Score</span>
          </div>
        </template>
        <div v-if="health" class="space-y-3">
          <div class="flex items-center gap-3">
            <span class="text-4xl font-bold" :class="healthScoreColor">{{ health.healthScore }}</span>
            <UBadge :color="healthBadgeColor" variant="soft">{{ health.healthStatus }}</UBadge>
          </div>
          <div v-if="health.recommendations?.length" class="space-y-1">
            <div v-for="rec in health.recommendations.slice(0, 3)" :key="rec" class="text-xs text-gray-500 dark:text-gray-400 flex items-start gap-1">
              <UIcon name="i-heroicons-arrow-right" class="w-3 h-3 mt-0.5 flex-shrink-0" />
              <span>{{ rec }}</span>
            </div>
          </div>
        </div>
        <div v-else class="text-sm text-gray-400">Health data unavailable</div>
      </UCard>

      <!-- Cost Estimate -->
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-currency-dollar" class="w-4 h-4 text-gray-400" />
            <span class="font-semibold text-sm">Cost Estimate</span>
          </div>
        </template>
        <div v-if="instance.pricingInfo" class="space-y-2">
          <div>
            <div class="text-2xl font-bold text-gray-900 dark:text-white">${{ instance.pricingInfo.monthlyEstimate?.toFixed(2) }}<span class="text-sm text-gray-400">/mo</span></div>
            <div class="text-xs text-gray-500">${{ instance.pricingInfo.hourlyRate?.toFixed(4) }}/hr</div>
          </div>
        </div>
        <div v-else class="text-sm text-gray-400">Pricing data unavailable</div>
      </UCard>

      <!-- Optimization -->
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-bolt" class="w-4 h-4 text-gray-400" />
            <span class="font-semibold text-sm">Optimization</span>
          </div>
        </template>
        <div v-if="optimization" class="space-y-2">
          <UBadge :color="optimizationColor" variant="soft" size="md">{{ optimization.finding || 'N/A' }}</UBadge>
          <div v-if="optimization.estimatedMonthlySavings" class="text-sm">
            <span class="text-green-600 dark:text-green-400 font-medium">Save ~${{ optimization.estimatedMonthlySavings }}/mo</span>
          </div>
          <div class="text-xs text-gray-500">{{ optimization.source }}</div>
        </div>
        <div v-else class="text-sm text-gray-400">Enable Compute Optimizer for recommendations</div>
      </UCard>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <!-- Management Info -->
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-cog-6-tooth" class="w-4 h-4 text-gray-400" />
            <span class="font-semibold text-sm">Management</span>
          </div>
        </template>
        <div class="space-y-2 text-sm">
          <div class="flex justify-between">
            <span class="text-gray-500 dark:text-gray-400">GDMS Managed</span>
            <UBadge :color="instance.managementInfo?.isGDMSManaged ? 'green' : 'gray'" variant="soft" size="xs">
              {{ instance.managementInfo?.isGDMSManaged ? 'Yes' : 'No' }}
            </UBadge>
          </div>
          <div v-if="instance.schedulingInfo?.scheduleName" class="flex justify-between">
            <span class="text-gray-500 dark:text-gray-400">Schedule</span>
            <span class="text-gray-900 dark:text-white">{{ instance.schedulingInfo.scheduleName }}</span>
          </div>
          <div v-if="instance.schedulingInfo?.scheduleStatus" class="flex justify-between">
            <span class="text-gray-500 dark:text-gray-400">Schedule Status</span>
            <span class="text-gray-900 dark:text-white">{{ instance.schedulingInfo.scheduleStatus }}</span>
          </div>
          <div v-if="instance.patchingInfo?.patchGroup" class="flex justify-between">
            <span class="text-gray-500 dark:text-gray-400">Patch Group</span>
            <span class="text-gray-900 dark:text-white">{{ instance.patchingInfo.patchGroup }}</span>
          </div>
        </div>
      </UCard>

      <!-- Quick Info -->
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-information-circle" class="w-4 h-4 text-gray-400" />
            <span class="font-semibold text-sm">Details</span>
          </div>
        </template>
        <div class="space-y-2 text-sm">
          <div class="flex justify-between">
            <span class="text-gray-500 dark:text-gray-400">Account</span>
            <span class="font-mono text-gray-900 dark:text-white">{{ instance.accountId }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500 dark:text-gray-400">Region</span>
            <span class="text-gray-900 dark:text-white">{{ instance.region }}</span>
          </div>
          <div v-if="instance.networkInfo?.vpcId" class="flex justify-between">
            <span class="text-gray-500 dark:text-gray-400">VPC</span>
            <span class="font-mono text-xs text-gray-900 dark:text-white">{{ instance.networkInfo.vpcId }}</span>
          </div>
          <div v-if="instance.metadata?.environment" class="flex justify-between">
            <span class="text-gray-500 dark:text-gray-400">Environment</span>
            <span class="text-gray-900 dark:text-white">{{ instance.metadata.environment }}</span>
          </div>
          <div v-if="instance.metadata?.owner" class="flex justify-between">
            <span class="text-gray-500 dark:text-gray-400">Owner</span>
            <span class="text-gray-900 dark:text-white">{{ instance.metadata.owner }}</span>
          </div>
        </div>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  instance: any
  health: any | null
  utilization: any | null
  optimization: any | null
}>()

const insights = computed(() => props.instance?.awsOptimizationInsights)

const launchTimeFormatted = computed(() => {
  const lt = props.instance?.configuration?.launchTime
  if (!lt) return 'N/A'
  return new Date(lt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
})

function formatMemory(mb: number | undefined) {
  if (!mb) return 'N/A'
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`
}

const healthScoreColor = computed(() => {
  const score = props.health?.healthScore ?? 0
  if (score >= 90) return 'text-green-600 dark:text-green-400'
  if (score >= 70) return 'text-yellow-600 dark:text-yellow-400'
  return 'text-red-600 dark:text-red-400'
})

const healthBadgeColor = computed(() => {
  const status = props.health?.healthStatus
  if (status === 'HEALTHY') return 'green'
  if (status === 'WARNING') return 'yellow'
  if (status === 'CRITICAL') return 'red'
  return 'gray'
})

const optimizationColor = computed(() => {
  const finding = props.optimization?.finding
  if (finding === 'OPTIMIZED') return 'green'
  if (finding === 'OVER_PROVISIONED') return 'yellow'
  if (finding === 'UNDER_PROVISIONED') return 'orange'
  return 'gray'
})
</script>
