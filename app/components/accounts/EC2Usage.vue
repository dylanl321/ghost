<template>
  <UCard>
    <template #header>
      <h2 class="text-lg font-semibold">EC2 Instances Overview</h2>
    </template>

    <CenteredLoadingSpinner v-if="props.loading" />

    <div v-else-if="instanceSummary" class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <!-- Total Instances -->
      <div class="border border-gray-700 rounded-lg p-4 text-center col-span-2">
        <p class="text-3xl font-bold">{{ instanceSummary.totalInstances }}</p>
        <p class="text-lg text-gray-400">Total Instances</p>
      </div>

      <!-- Running vs Stopped -->
      <div class="border border-gray-700 rounded-lg p-4">
        <div class="flex justify-between">
          <div class="text-center flex-1">
            <p class="text-lg font-bold">{{ instanceSummary.byState.running }}</p>
            <p class="text-xs text-gray-400">Running</p>
          </div>
          <div class="text-center flex-1">
            <p class="text-lg font-bold">{{ instanceSummary.byState.stopped }}</p>
            <p class="text-xs text-gray-400">Stopped</p>
          </div>
        </div>
      </div>

      <!-- Scheduled vs Unscheduled -->
      <div class="border border-gray-700 rounded-lg p-4">
        <div class="flex justify-between">
          <div class="text-center flex-1">
            <p class="text-lg font-bold">{{ instanceSummary.byScheduling.scheduled }}</p>
            <p class="text-xs text-gray-400">Scheduled</p>
          </div>
          <div class="text-center flex-1">
            <p class="text-lg font-bold">{{ instanceSummary.byScheduling.unscheduled }}</p>
            <p class="text-xs text-gray-400">Unscheduled</p>
          </div>
        </div>
      </div>

      <!-- Common Instance Types -->
      <div class="border border-gray-700 rounded-lg p-4 col-span-2">
        <p class="font-semibold mb-2">Common Instance Types</p>
        <div class="flex gap-y-2 gap-2">
          <UBadge v-for="type in topInstanceTypes" :key="type.name" variant="soft" color="gray">
            {{ type.name }} ({{ type.count }})
          </UBadge>
        </div>
      </div>
    </div>

    <div v-else>Failed to load EC2 usage data</div>
  </UCard>
</template>

<script setup lang="ts">

const props = defineProps<{
  instanceSummary: InstanceSummary | null
  loading: boolean
}>()

// const totalInstances = computed(() => props.instances.length)
// const scheduledCount = computed(() => props.instances.filter(i => i.schedulingInfo?.hasSchedule).length)
// const unscheduledCount = computed(() => totalInstances.value - scheduledCount.value)
// const runningCount = computed(() => props.instances.filter(i => i.instanceState === 'running').length)
// const stoppedCount = computed(() => props.instances.filter(i => i.instanceState === 'stopped').length)

const topInstanceTypes = computed(() => {
  return Object.entries(props.instanceSummary?.byType || {})
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
})
</script>
