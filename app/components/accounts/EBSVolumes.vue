<template>
  <UCard class="h-full flex flex-col">
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
      <!-- All Metrics in Single Row -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div class="bg-gray-800/50 rounded-lg p-3">
          <div class="text-xs text-gray-400">Total Size</div>
          <div class="text-xl font-bold text-blue-400">{{ totalSize }} GB</div>
        </div>
        <div class="bg-gray-800/50 rounded-lg p-3">
          <div class="text-xs text-gray-400">Available</div>
          <div class="text-xl font-bold text-yellow-400">{{ availableCount }}</div>
          <div class="text-xs text-gray-500">Unattached</div>
        </div>
        <div class="bg-gray-800/50 rounded-lg p-3">
          <div class="text-xs text-gray-400">In Use</div>
          <div class="text-xl font-bold text-green-400">{{ inUseCount }}</div>
        </div>
        <div class="bg-gray-800/50 rounded-lg p-3">
          <div class="text-xs text-gray-400">Unused Cost</div>
          <div v-if="loadingPricing" class="text-sm text-gray-500">Calculating...</div>
          <div v-else-if="unusedVolumeCost !== null" class="text-xl font-bold text-red-400">
            ${{ unusedVolumeCost.toFixed(2) }}
          </div>
          <div v-else class="text-sm text-gray-500">N/A</div>
          <div class="text-xs text-gray-500">/month</div>
        </div>
      </div>

      <!-- Volume Type Breakdown (Compact Row) -->
      <div class="flex flex-wrap gap-2 items-center">
        <span class="text-xs font-semibold text-gray-400">Types:</span>
        <div v-for="(count, type) in volumeTypeBreakdown" :key="type" class="flex items-center gap-1.5 px-2.5 py-1 bg-gray-800/30 rounded">
          <span class="text-xs text-gray-300">{{ type }}</span>
          <UBadge color="blue" variant="soft" size="xs">{{ count }}</UBadge>
        </div>
      </div>

      <!-- Volumes Table -->
      <div class="overflow-y-auto" style="max-height: 450px;">
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
  environment?: 'commercial' | 'govcloud'
}

const props = withDefaults(defineProps<Props>(), {
  environment: 'govcloud'
})

// Use the Config Resources composable
const {
  resources: volumes,
  loading,
  hasMore,
  fetch: fetchResources,
  fetchNextPage
} = useConfigResources({
  environment: props.environment,
  resourceType: 'AWS::EC2::Volume',
  accountIds: props.accountId,
  responseDetail: 'full',
  limit: 1000,
  immediate: true,
  onSuccess: () => {
    // Calculate unused volume costs after loading volumes
    calculateUnusedVolumeCost()
  },
  onError: (error) => {
    console.error('Error fetching volumes:', error)
  }
})

const loadingMore = ref(false)
const unusedVolumeCost = ref<number | null>(null)
const loadingPricing = ref(false)

const columns = [
  { key: 'resourceId', label: 'Volume ID' },
  { key: 'size', label: 'Size' },
  { key: 'state', label: 'State' },
  { key: 'attachedTo', label: 'Attached To' },
  { key: 'region', label: 'Region' }
]

// Calculate cost of unused (available) volumes
const calculateUnusedVolumeCost = async () => {
  const availableVolumes = volumes.value.filter(v => v.configuration?.state === 'available')

  if (availableVolumes.length === 0) {
    unusedVolumeCost.value = 0
    return
  }

  loadingPricing.value = true
  try {
    const volumesForPricing = availableVolumes.map(vol => ({
      volumeId: vol.resourceId,
      volumeType: vol.configuration?.volumeType || 'gp2',
      sizeGB: vol.configuration?.size || 0,
      region: vol.region
    }))

    const response = await fetch('/api/volumes/pricing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        volumes: volumesForPricing,
        environment: 'govcloud'
      })
    })

    const data = await response.json()

    if (data.success && data.data?.summary) {
      unusedVolumeCost.value = data.data.summary.totalMonthlyCost
    }
  } catch (error) {
    console.error('Error calculating unused volume cost:', error)
    unusedVolumeCost.value = null
  } finally {
    loadingPricing.value = false
  }
}

// Load more volumes
const loadMore = async () => {
  if (hasMore.value && !loadingMore.value) {
    loadingMore.value = true
    try {
      await fetchNextPage()
      await calculateUnusedVolumeCost()
    } finally {
      loadingMore.value = false
    }
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

// Watch for account changes and refetch
watch(() => props.accountId, () => {
  fetchResources()
})

// Watch for environment changes and refetch
watch(() => props.environment, () => {
  fetchResources()
})
</script>
