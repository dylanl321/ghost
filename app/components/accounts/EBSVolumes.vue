<template>
  <UCard>
    <template #header>
      <div class="flex justify-between items-center">
        <div class="text-lg font-semibold">EBS Volumes</div>
        <UBadge v-if="!loading" color="gray" variant="soft">
          {{ volumes.length }} volumes
        </UBadge>
      </div>
    </template>

    <CenteredLoadingSpinner v-if="loading" />
    <div v-else-if="volumes.length === 0" class="text-center text-gray-400 py-8">
      No EBS volumes found
    </div>
    <div v-else class="space-y-4">
      <!-- Summary Cards -->
      <div class="grid grid-cols-3 gap-4">
        <div class="bg-gray-800/50 rounded-lg p-4">
          <div class="text-sm text-gray-400">Total Size</div>
          <div class="text-2xl font-bold text-blue-400">{{ totalSize }} GB</div>
        </div>
        <div class="bg-gray-800/50 rounded-lg p-4">
          <div class="text-sm text-gray-400">Available</div>
          <div class="text-2xl font-bold text-yellow-400">{{ availableCount }}</div>
          <div class="text-xs text-gray-500">Unattached</div>
        </div>
        <div class="bg-gray-800/50 rounded-lg p-4">
          <div class="text-sm text-gray-400">In Use</div>
          <div class="text-2xl font-bold text-green-400">{{ inUseCount }}</div>
        </div>
      </div>

      <!-- Volume Type Breakdown -->
      <div class="space-y-2">
        <div class="text-sm font-semibold text-gray-300">Volume Types</div>
        <div v-for="(count, type) in volumeTypeBreakdown" :key="type" class="flex justify-between items-center p-2 bg-gray-800/30 rounded">
          <div class="text-sm text-gray-300">{{ type }}</div>
          <UBadge color="blue" variant="soft">{{ count }}</UBadge>
        </div>
      </div>

      <!-- Volumes Table -->
      <div class="max-h-[400px] overflow-y-auto">
        <UTable :rows="volumes" :columns="columns">
          <!-- Volume ID -->
          <template #resourceId-data="{ row }">
            <div>
              <div class="font-medium text-sm">{{ row.resourceId }}</div>
              <div class="text-xs text-gray-500">{{ row.configuration?.volumeType || 'Unknown' }}</div>
            </div>
          </template>

          <!-- Size -->
          <template #size-data="{ row }">
            <div class="text-sm">{{ row.configuration?.size || 0 }} GB</div>
          </template>

          <!-- State -->
          <template #state-data="{ row }">
            <UBadge
              :color="row.configuration?.state === 'in-use' ? 'green' : 'yellow'"
              variant="soft"
              size="xs"
            >
              {{ row.configuration?.state || 'unknown' }}
            </UBadge>
          </template>

          <!-- Attached To -->
          <template #attachedTo-data="{ row }">
            <div class="text-sm text-gray-400">
              {{ getAttachedInstance(row) || 'Not attached' }}
            </div>
          </template>

          <!-- Region -->
          <template #region-data="{ row }">
            <div class="text-sm text-gray-400">{{ row.region }}</div>
          </template>
        </UTable>
      </div>

      <div v-if="hasMore" class="text-center mt-4">
        <UButton
          :loading="loadingMore"
          color="gray"
          variant="soft"
          @click="loadMore"
        >
          Load More Volumes
        </UButton>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
interface Props {
  accountId: string
}

const props = defineProps<Props>()

const loading = ref(true)
const volumes = ref<any[]>([])
const nextToken = ref<string | undefined>(undefined)
const hasMore = ref(false)
const loadingMore = ref(false)

const columns = [
  { key: 'resourceId', label: 'Volume ID' },
  { key: 'size', label: 'Size' },
  { key: 'state', label: 'State' },
  { key: 'attachedTo', label: 'Attached To' },
  { key: 'region', label: 'Region' }
]

// Fetch volumes
const fetchVolumes = async (append = false) => {
  if (append) {
    loadingMore.value = true
  } else {
    loading.value = true
    volumes.value = []
    nextToken.value = undefined
  }

  try {
    const url = `/api/config/resources?environment=govcloud&resourceType=AWS::EC2::Volume&accountIds=${props.accountId}&responseDetail=full&limit=1000${nextToken.value ? `&nextToken=${nextToken.value}` : ''}`
    const response = await fetch(url)
    const data = await response.json()

    if (append) {
      volumes.value = [...volumes.value, ...(data.data?.resources || [])]
    } else {
      volumes.value = data.data?.resources || []
    }

    nextToken.value = data.data?.pagination?.nextToken
    hasMore.value = data.data?.pagination?.hasMore || false
  } catch (error) {
    console.error('Error fetching volumes:', error)
    if (!append) {
      volumes.value = []
    }
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

const loadMore = () => {
  if (hasMore.value && !loadingMore.value) {
    fetchVolumes(true)
  }
}

// Calculate statistics
const totalSize = computed(() => {
  return volumes.value.reduce((sum, vol) => sum + (vol.configuration?.size || 0), 0)
})

const availableCount = computed(() => {
  return volumes.value.filter(v => v.configuration?.state === 'available').length
})

const inUseCount = computed(() => {
  return volumes.value.filter(v => v.configuration?.state === 'in-use').length
})

const volumeTypeBreakdown = computed(() => {
  const breakdown: Record<string, number> = {}
  volumes.value.forEach(volume => {
    const type = volume.configuration?.volumeType || 'unknown'
    breakdown[type] = (breakdown[type] || 0) + 1
  })
  return breakdown
})

// Helper function to get attached instance
const getAttachedInstance = (row: any) => {
  const attachments = row.configuration?.attachments || []
  if (attachments.length > 0 && attachments[0].instanceId) {
    return attachments[0].instanceId
  }
  return null
}

onMounted(() => {
  fetchVolumes()
})

watch(() => props.accountId, () => {
  fetchVolumes()
})
</script>
