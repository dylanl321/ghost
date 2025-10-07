<template>
  <UCard>
    <template #header>
      <div class="flex justify-between items-center">
        <div class="text-lg font-semibold">EC2 Instances</div>
        <div class="flex gap-2 items-center">
          <UInput
            v-model="searchQuery"
            placeholder="Search instances..."
            icon="i-heroicons-magnifying-glass"
            size="sm"
          />
          <USelect
            v-model="stateFilter"
            :options="stateOptions"
            size="sm"
            placeholder="All States"
          />
        </div>
      </div>
    </template>

    <CenteredLoadingSpinner v-if="loading" />
    <div v-else-if="filteredInstances.length === 0" class="text-center text-gray-400 py-8">
      No instances found
    </div>
    <div v-else class="max-h-[600px] overflow-y-auto">
      <UTable :rows="filteredInstances" :columns="columns">
      <!-- Instance Name -->
      <template #instanceName-data="{ row }">
        <div class="flex items-center gap-2">
          <UIcon
            :name="row.instanceState === 'running' ? 'i-heroicons-play-circle' : 'i-heroicons-stop-circle'"
            :class="row.instanceState === 'running' ? 'text-green-400' : 'text-gray-400'"
          />
          <div>
            <div class="font-medium">{{ row.instanceName || 'Unnamed' }}</div>
            <div class="text-xs text-gray-500">{{ row.resourceId }}</div>
          </div>
        </div>
      </template>

      <!-- Instance Type -->
      <template #instanceType-data="{ row }">
        <UBadge color="gray" variant="soft">{{ row.instanceType }}</UBadge>
      </template>

      <!-- State -->
      <template #instanceState-data="{ row }">
        <UBadge
          :color="getStateColor(row.instanceState)"
          variant="soft"
        >
          {{ row.instanceState }}
        </UBadge>
      </template>

      <!-- Schedule -->
      <template #schedule-data="{ row }">
        <div v-if="row.schedulingInfo?.hasSchedule" class="space-y-1">
          <div class="text-sm">{{ row.schedulingInfo.scheduleName }}</div>
          <div v-if="row.schedulingInfo.lastScheduleMessage" class="text-xs text-gray-500">
            {{ row.schedulingInfo.lastScheduleMessage }}
          </div>
        </div>
        <UBadge v-else color="yellow" variant="soft">No Schedule</UBadge>
      </template>

      <!-- Tags -->
      <template #tags-data="{ row }">
        <div class="flex flex-wrap gap-1">
          <UBadge
            v-if="row.metadata?.tags?.SWFactory === 'true'"
            color="purple"
            variant="soft"
            size="xs"
          >
            SWFactory
          </UBadge>
          <UBadge
            v-if="row.managementInfo?.isGDMSManaged"
            color="blue"
            variant="soft"
            size="xs"
          >
            GDMS
          </UBadge>
          <UBadge
            v-if="row.metadata?.environment"
            color="gray"
            variant="soft"
            size="xs"
          >
            {{ row.metadata.environment }}
          </UBadge>
          <UBadge
            v-if="otherTagsCount(row) > 0"
            color="gray"
            variant="outline"
            size="xs"
            class="cursor-pointer hover:bg-gray-700"
            @click="showAllTags(row)"
          >
            +{{ otherTagsCount(row) }} more
          </UBadge>
        </div>
      </template>

      <!-- Region -->
      <template #region-data="{ row }">
        <div class="text-sm text-gray-400">{{ row.region }}</div>
      </template>
    </UTable>
    </div>

    <!-- Tags Modal -->
    <UModal v-model="tagsModalOpen">
      <UCard>
        <template #header>
          <div class="flex justify-between items-center">
            <h3 class="text-lg font-semibold">All Tags - {{ selectedInstance?.instanceName || selectedInstance?.resourceId }}</h3>
            <UButton icon="i-heroicons-x-mark" color="gray" variant="ghost" @click="tagsModalOpen = false" />
          </div>
        </template>

        <div v-if="selectedInstance?.metadata?.tags" class="space-y-2">
          <div
            v-for="[key, value] in Object.entries(selectedInstance.metadata.tags)"
            :key="key"
            class="flex justify-between items-start p-2 bg-gray-800/50 rounded"
          >
            <div class="font-medium text-sm break-all">{{ key }}</div>
            <div class="text-sm text-gray-400 ml-4 break-all">{{ value }}</div>
          </div>
        </div>
        <div v-else class="text-center text-gray-400 py-4">
          No tags found
        </div>
      </UCard>
    </UModal>
  </UCard>
</template>

<script setup lang="ts">
interface Props {
  accountId: string
}

const props = defineProps<Props>()

const loading = ref(true)
const instances = ref<any[]>([])
const searchQuery = ref('')
const stateFilter = ref('all')
const tagsModalOpen = ref(false)
const selectedInstance = ref<any>(null)

const stateOptions = [
  { label: 'All States', value: 'all' },
  { label: 'Running', value: 'running' },
  { label: 'Stopped', value: 'stopped' },
  { label: 'Terminated', value: 'terminated' }
]

const columns = [
  { key: 'instanceName', label: 'Name' },
  { key: 'instanceType', label: 'Type' },
  { key: 'instanceState', label: 'State' },
  { key: 'schedule', label: 'Schedule' },
  { key: 'tags', label: 'Tags' },
  { key: 'region', label: 'Region' }
]

// Fetch instances
const fetchInstances = async () => {
  loading.value = true
  try {
    const response = await fetch(`/api/instances?environment=govcloud&accountIds=${props.accountId}&limit=2000&includeOptimizationHints=false`)
    const data = await response.json()
    instances.value = data.data?.instances || []
  } catch (error) {
    console.error('Error fetching instances:', error)
    instances.value = []
  } finally {
    loading.value = false
  }
}

// Filter instances
const filteredInstances = computed(() => {
  let filtered = instances.value

  // Filter by state
  if (stateFilter.value !== 'all') {
    filtered = filtered.filter(i => i.instanceState === stateFilter.value)
  }

  // Filter by search query
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    filtered = filtered.filter(i =>
      i.instanceName?.toLowerCase().includes(query) ||
      i.resourceId?.toLowerCase().includes(query) ||
      i.instanceType?.toLowerCase().includes(query)
    )
  }

  return filtered
})

// Helper functions
const getStateColor = (state: string) => {
  switch (state) {
    case 'running': return 'green'
    case 'stopped': return 'gray'
    case 'terminated': return 'red'
    case 'stopping': return 'yellow'
    case 'pending': return 'blue'
    default: return 'gray'
  }
}

const otherTagsCount = (row: any) => {
  const tags = row.metadata?.tags || {}
  const displayedTags = ['SWFactory', 'GDMS_Managed', 'Environment', 'Name', 'Schedule', 'ScheduleMessage']
  return Object.keys(tags).filter(key => !displayedTags.includes(key) && !key.startsWith('GD')).length
}

const showAllTags = (row: any) => {
  selectedInstance.value = row
  tagsModalOpen.value = true
}

onMounted(() => {
  fetchInstances()
})

watch(() => props.accountId, () => {
  fetchInstances()
})
</script>
