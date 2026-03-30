<template>
  <UCard class="h-full flex flex-col">
    <template #header>
      <div class="flex justify-between items-center">
        <div class="text-sm font-semibold text-gray-900 dark:text-white">Instance Scheduling</div>
        <UBadge v-if="!loading" color="gray" variant="soft">
          {{ instances.length }} instances
        </UBadge>
      </div>
    </template>

    <CenteredLoadingSpinner v-if="loading" />
    <div v-else-if="instances.length === 0" class="text-center text-gray-600 dark:text-gray-400 py-8">
      No instances found
    </div>
    <div v-else class="space-y-4">
      <!-- Summary Cards -->
      <div class="grid grid-cols-2 gap-4">
        <div class="bg-gray-100 dark:bg-gray-800/50 rounded-lg p-3">
          <div class="text-xs text-gray-600 dark:text-gray-400">Scheduled</div>
          <div class="text-xl font-bold text-green-600 dark:text-green-400">{{ scheduledCount }}</div>
          <div class="text-xs text-gray-500">{{ scheduledPercentage }}%</div>
        </div>
        <div class="bg-gray-100 dark:bg-gray-800/50 rounded-lg p-3">
          <div class="text-xs text-gray-600 dark:text-gray-400">Unscheduled</div>
          <div class="text-xl font-bold text-yellow-600 dark:text-yellow-400">{{ unscheduledCount }}</div>
          <div class="text-xs text-gray-500">{{ unscheduledPercentage }}%</div>
        </div>
      </div>

      <!-- Schedule Breakdown -->
      <div class="space-y-2">
        <div class="text-sm font-semibold text-gray-700 dark:text-gray-300">Schedule Types</div>
        <div v-for="(count, schedule) in scheduleBreakdown" :key="schedule" class="flex justify-between items-center p-2 bg-gray-100 dark:bg-gray-800/50 rounded">
          <div class="text-sm text-gray-700 dark:text-gray-300">{{ schedule }}</div>
          <UBadge color="blue" variant="soft">{{ count }}</UBadge>
        </div>
      </div>

      <!-- Special Tags Info -->
      <div class="space-y-2">
        <div class="text-sm font-semibold text-gray-700 dark:text-gray-300">Special Purpose Tags</div>
        <div class="space-y-2">
          <div class="flex justify-between items-center p-2 bg-gray-100 dark:bg-gray-800/50 rounded">
            <div class="flex items-center gap-2">
              <UIcon name="i-heroicons-wrench-screwdriver" class="text-purple-500 dark:text-purple-400" />
              <div class="text-sm text-gray-700 dark:text-gray-300">SWFactory</div>
            </div>
            <UBadge color="purple" variant="soft">{{ swFactoryCount }}</UBadge>
          </div>
          <div class="flex justify-between items-center p-2 bg-gray-100 dark:bg-gray-800/50 rounded">
            <div class="flex items-center gap-2">
              <UIcon name="i-heroicons-shield-check" class="text-blue-500 dark:text-blue-400" />
              <div class="text-sm text-gray-700 dark:text-gray-300">GDMS Managed</div>
            </div>
            <UBadge color="blue" variant="soft">{{ gdmsManagedCount }}</UBadge>
          </div>
        </div>
      </div>

      <!-- Schedule Legend -->
      <div class="bg-gray-100 dark:bg-gray-800/50 rounded-lg p-3">
        <div class="text-xs space-y-2">
          <div class="font-semibold text-gray-700 dark:text-gray-300">Schedule Tag Values:</div>
          <ul class="space-y-1 text-gray-600 dark:text-gray-400 list-disc list-inside">
            <li><span class="font-mono text-xs">arizona-default-workweek</span> - 9am-5pm AZ, Mon-Fri</li>
            <li><span class="font-mono text-xs">east-default-workweek</span> - 9am-5pm ET, Mon-Fri</li>
            <li><span class="font-mono text-xs">arizona-nostartup-workweek</span> - Shutdown 5pm AZ (no auto-start)</li>
            <li><span class="font-mono text-xs">east-nostartup-workweek</span> - Shutdown 5pm ET (no auto-start)</li>
            <li><span class="font-mono text-xs">9am-east-startup-8pm-east-shutdown</span> - 9am-8pm ET, Mon-Fri</li>
          </ul>
        </div>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
const logger = createLogger('InstanceScheduling')

interface Props {
  accountId: string
}

const props = defineProps<Props>()

const loading = ref(true)
const instances = ref<any[]>([])

// Fetch instances with scheduling info
const fetchInstances = async () => {
  loading.value = true
  try {
    const response = await fetch(`/api/instances?environment=govcloud&accountIds=${props.accountId}&limit=2000&includeOptimizationHints=false`)
    const data = await response.json()
    instances.value = data.data?.instances || []
  } catch (error) {
    logger.error('Error fetching instances:', error)
    instances.value = []
  } finally {
    loading.value = false
  }
}

// Calculate scheduling statistics
const scheduledCount = computed(() =>
  instances.value.filter(i => i.schedulingInfo?.hasSchedule).length
)

const unscheduledCount = computed(() =>
  instances.value.filter(i => !i.schedulingInfo?.hasSchedule).length
)

const scheduledPercentage = computed(() =>
  instances.value.length > 0 ? Math.round((scheduledCount.value / instances.value.length) * 100) : 0
)

const unscheduledPercentage = computed(() =>
  instances.value.length > 0 ? Math.round((unscheduledCount.value / instances.value.length) * 100) : 0
)

// Schedule breakdown
const scheduleBreakdown = computed(() => {
  const breakdown: Record<string, number> = {}
  instances.value.forEach(instance => {
    const schedule = instance.schedulingInfo?.scheduleName || 'None'
    if (schedule !== 'None') {
      breakdown[schedule] = (breakdown[schedule] || 0) + 1
    }
  })
  return breakdown
})

// Special tags count
const swFactoryCount = computed(() =>
  instances.value.filter(i => i.metadata?.tags?.SWFactory === 'true').length
)

const gdmsManagedCount = computed(() =>
  instances.value.filter(i => i.managementInfo?.isGDMSManaged).length
)

onMounted(() => {
  fetchInstances()
})

watch(() => props.accountId, () => {
  fetchInstances()
})
</script>
