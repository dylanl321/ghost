<template>
  <div class="space-y-4 mt-4">
    <div v-if="!health" class="text-center py-12">
      <UIcon name="i-heroicons-wrench-screwdriver" class="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
      <p class="text-gray-500 dark:text-gray-400">Patch compliance data unavailable</p>
      <p class="text-xs text-gray-400 mt-1">Ensure SSM Agent is installed and running</p>
    </div>

    <template v-else>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <!-- Compliance Status -->
        <UCard>
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon name="i-heroicons-shield-check" class="w-4 h-4 text-gray-400" />
              <span class="font-semibold text-sm">Compliance Status</span>
            </div>
          </template>
          <div class="space-y-4">
            <div class="flex items-center gap-3">
              <UBadge :color="statusColor" variant="soft" size="lg">{{ patchStatus }}</UBadge>
              <span v-if="health.patchCompliance?.error" class="text-xs text-gray-400">{{ health.patchCompliance.error }}</span>
            </div>
            <div class="grid grid-cols-3 gap-3">
              <div class="text-center p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                <div class="text-2xl font-bold text-green-600 dark:text-green-400">{{ health.patchCompliance?.installedCount || 0 }}</div>
                <div class="text-xs text-gray-500">Installed</div>
              </div>
              <div class="text-center p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                <div class="text-2xl font-bold" :class="(health.patchCompliance?.missingCount || 0) > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'">
                  {{ health.patchCompliance?.missingCount || 0 }}
                </div>
                <div class="text-xs text-gray-500">Missing</div>
              </div>
              <div class="text-center p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                <div class="text-2xl font-bold" :class="(health.patchCompliance?.failedCount || 0) > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'">
                  {{ health.patchCompliance?.failedCount || 0 }}
                </div>
                <div class="text-xs text-gray-500">Failed</div>
              </div>
            </div>
            <div v-if="health.patchCompliance?.lastPatchTime" class="text-sm text-gray-500 dark:text-gray-400">
              Last patched: {{ new Date(health.patchCompliance.lastPatchTime).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }}
            </div>
          </div>
        </UCard>

        <!-- GDMS Patching Config -->
        <UCard>
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon name="i-heroicons-cog-6-tooth" class="w-4 h-4 text-gray-400" />
              <span class="font-semibold text-sm">Patching Configuration</span>
            </div>
          </template>
          <div class="space-y-3 text-sm">
            <div class="flex justify-between">
              <span class="text-gray-500 dark:text-gray-400">Patch Group</span>
              <span class="text-gray-900 dark:text-white font-medium">{{ instance.patchingInfo?.patchGroup || 'Not assigned' }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-500 dark:text-gray-400">Automation</span>
              <span class="text-gray-900 dark:text-white">{{ instance.patchingInfo?.patchingAutomation || 'N/A' }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-500 dark:text-gray-400">GDMS Managed</span>
              <UBadge :color="instance.managementInfo?.isGDMSManaged ? 'green' : 'gray'" variant="soft" size="xs">
                {{ instance.managementInfo?.isGDMSManaged ? 'Yes' : 'No' }}
              </UBadge>
            </div>
          </div>
        </UCard>
      </div>

      <!-- Scheduling -->
      <UCard v-if="instance.schedulingInfo">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-clock" class="w-4 h-4 text-gray-400" />
            <span class="font-semibold text-sm">Scheduling</span>
          </div>
        </template>
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
          <div>
            <div class="text-gray-500 dark:text-gray-400 mb-1">Has Schedule</div>
            <UBadge :color="instance.schedulingInfo.hasSchedule ? 'green' : 'gray'" variant="soft" size="xs">
              {{ instance.schedulingInfo.hasSchedule ? 'Yes' : 'No' }}
            </UBadge>
          </div>
          <div v-if="instance.schedulingInfo.scheduleName">
            <div class="text-gray-500 dark:text-gray-400 mb-1">Schedule Name</div>
            <div class="text-gray-900 dark:text-white font-medium">{{ instance.schedulingInfo.scheduleName }}</div>
          </div>
          <div v-if="instance.schedulingInfo.scheduleStatus">
            <div class="text-gray-500 dark:text-gray-400 mb-1">Status</div>
            <div class="text-gray-900 dark:text-white">{{ instance.schedulingInfo.scheduleStatus }}</div>
          </div>
          <div v-if="instance.schedulingInfo.lastScheduleMessage">
            <div class="text-gray-500 dark:text-gray-400 mb-1">Last Message</div>
            <div class="text-gray-900 dark:text-white text-xs">{{ instance.schedulingInfo.lastScheduleMessage }}</div>
          </div>
        </div>
      </UCard>
    </template>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  health: any | null
  instance: any
}>()

const patchStatus = computed(() => props.health?.patchCompliance?.status || 'UNKNOWN')

const statusColor = computed(() => {
  const s = patchStatus.value
  if (s === 'COMPLIANT') return 'green'
  if (s === 'NON_COMPLIANT' || s === 'FAILED') return 'red'
  return 'gray'
})
</script>
