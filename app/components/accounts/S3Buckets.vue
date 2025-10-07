<template>
  <UCard>
    <template #header>
      <div class="flex justify-between items-center">
        <div class="text-lg font-semibold">S3 Buckets</div>
        <div class="flex items-center gap-2">
          <UToggle v-model="showLandingZoneBuckets" />
          <span class="text-sm text-gray-400">Show LZ Buckets</span>
          <UBadge v-if="!loading" color="gray" variant="soft">
            {{ filteredBuckets.length }} buckets
          </UBadge>
        </div>
      </div>
    </template>

    <CenteredLoadingSpinner v-if="loading" />
    <div v-else-if="errorMessage" class="text-center py-8">
      <div class="text-red-400 mb-2">Error loading S3 buckets</div>
      <div class="text-sm text-gray-500">{{ errorMessage }}</div>
    </div>
    <div v-else-if="filteredBuckets.length === 0 && buckets.length === 0" class="text-center text-gray-400 py-8">
      No S3 buckets found
    </div>
    <div v-else-if="filteredBuckets.length === 0 && buckets.length > 0" class="text-center text-gray-400 py-8">
      All buckets are landing zone buckets. Toggle "Show LZ Buckets" to view them.
    </div>
    <div v-else class="space-y-4">
      <!-- Summary Cards -->
      <div class="grid grid-cols-4 gap-4">
        <div class="bg-gray-800/50 rounded-lg p-4">
          <div class="text-sm text-gray-400">Application Buckets</div>
          <div class="text-2xl font-bold text-yellow-400">{{ filteredBuckets.length }}</div>
        </div>
        <div class="bg-gray-800/50 rounded-lg p-4">
          <div class="text-sm text-gray-400">Landing Zone</div>
          <div class="text-2xl font-bold text-purple-400">{{ landingZoneBucketsCount }}</div>
        </div>
        <div class="bg-gray-800/50 rounded-lg p-4">
          <div class="text-sm text-gray-400">Versioned</div>
          <div class="text-2xl font-bold text-blue-400">{{ versionedCount }}</div>
        </div>
        <div class="bg-gray-800/50 rounded-lg p-4">
          <div class="text-sm text-gray-400">Encrypted</div>
          <div class="text-2xl font-bold text-green-400">{{ encryptedCount }}</div>
        </div>
      </div>

      <!-- Buckets Table -->
      <div class="max-h-[400px] overflow-y-auto">
        <UTable :rows="filteredBuckets" :columns="columns">
          <!-- Bucket Name -->
          <template #resourceId-data="{ row }">
            <div>
              <div class="flex items-center gap-2">
                <div class="font-medium text-sm">{{ row.resourceId }}</div>
                <UBadge
                  v-if="isLandingZoneBucket(row.resourceId)"
                  color="purple"
                  variant="soft"
                  size="xs"
                >
                  {{ getLandingZoneBucketType(row.resourceId) }}
                </UBadge>
              </div>
              <div class="text-xs text-gray-500">{{ row.region }}</div>
            </div>
          </template>

          <!-- Features -->
          <template #features-data="{ row }">
            <div class="flex flex-wrap gap-1">
              <UBadge
                v-if="row.configuration?.versioningConfiguration?.status === 'Enabled'"
                color="blue"
                variant="soft"
                size="xs"
              >
                Versioning
              </UBadge>
              <UBadge
                v-if="hasEncryption(row)"
                color="green"
                variant="soft"
                size="xs"
              >
                Encrypted
              </UBadge>
              <UBadge
                v-if="row.configuration?.publicAccessBlockConfiguration"
                color="purple"
                variant="soft"
                size="xs"
              >
                Public Access Block
              </UBadge>
              <UBadge
                v-if="row.configuration?.loggingConfiguration?.targetBucket"
                color="gray"
                variant="soft"
                size="xs"
              >
                Logging
              </UBadge>
            </div>
          </template>

          <!-- Tags -->
          <template #tags-data="{ row }">
            <div v-if="row.tags && Object.keys(row.tags).length > 0" class="flex flex-wrap gap-1">
              <UBadge
                v-for="(value, key) in Object.entries(row.tags).slice(0, 2)"
                :key="key"
                color="gray"
                variant="outline"
                size="xs"
              >
                {{ key }}
              </UBadge>
              <UBadge
                v-if="Object.keys(row.tags).length > 2"
                color="gray"
                variant="outline"
                size="xs"
              >
                +{{ Object.keys(row.tags).length - 2 }}
              </UBadge>
            </div>
            <div v-else class="text-xs text-gray-500">No tags</div>
          </template>

          <!-- Created -->
          <template #creationTime-data="{ row }">
            <div class="text-sm text-gray-400">
              {{ formatDate(row.creationTime) }}
            </div>
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
          Load More Buckets
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

const loading = ref(true)
const buckets = ref<any[]>([])
const nextToken = ref<string | undefined>(undefined)
const hasMore = ref(false)
const loadingMore = ref(false)
const errorMessage = ref<string | null>(null)
const showLandingZoneBuckets = ref(false)

const columns = [
  { key: 'resourceId', label: 'Bucket Name' },
  { key: 'features', label: 'Features' },
  { key: 'tags', label: 'Tags' },
  { key: 'creationTime', label: 'Created' }
]

// Fetch buckets
const fetchBuckets = async (append = false) => {
  if (append) {
    loadingMore.value = true
  } else {
    loading.value = true
    buckets.value = []
    nextToken.value = undefined
    errorMessage.value = null
  }

  try {
    console.log('Fetching S3 buckets for account:', props.accountId, 'environment:', props.environment)
    const url = `/api/config/resources?environment=${props.environment}&resourceType=AWS::S3::Bucket&accountIds=${props.accountId}&responseDetail=full&limit=1000${nextToken.value ? `&nextToken=${nextToken.value}` : ''}`
    console.log('S3 API URL:', url)

    const response = await fetch(url)
    const data = await response.json()
    console.log('S3 buckets response:', data)

    if (!data.success) {
      console.error('S3 fetch failed:', data)
      errorMessage.value = data.message || 'Failed to fetch S3 buckets'
    }

    if (append) {
      buckets.value = [...buckets.value, ...(data.data?.resources || [])]
    } else {
      buckets.value = data.data?.resources || []
    }

    nextToken.value = data.data?.pagination?.nextToken
    hasMore.value = data.data?.pagination?.hasMore || false

    console.log('S3 buckets loaded:', buckets.value.length, 'Has more:', hasMore.value)
  } catch (error) {
    console.error('Error fetching buckets:', error)
    errorMessage.value = error.message || 'Unknown error'
    if (!append) {
      buckets.value = []
    }
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

const loadMore = () => {
  if (hasMore.value && !loadingMore.value) {
    fetchBuckets(true)
  }
}

// Filter buckets based on landing zone toggle
const filteredBuckets = computed(() => {
  if (showLandingZoneBuckets.value) {
    return buckets.value
  }
  return buckets.value.filter(b => !isLandingZoneBucket(b.resourceId))
})

// Calculate statistics (using all buckets for counts)
const versionedCount = computed(() => {
  return filteredBuckets.value.filter(b => b.configuration?.versioningConfiguration?.status === 'Enabled').length
})

const encryptedCount = computed(() => {
  return filteredBuckets.value.filter(b => hasEncryption(b)).length
})

const landingZoneBucketsCount = computed(() => {
  return buckets.value.filter(b => isLandingZoneBucket(b.resourceId)).length
})

// Helper functions
const hasEncryption = (bucket: any) => {
  return bucket.configuration?.serverSideEncryptionConfiguration?.rules?.length > 0
}

// Identify if bucket is created by the landing zone
const isLandingZoneBucket = (bucketName: string): boolean => {
  const landingZonePatterns = [
    /^stackset-swfactory-/i,                    // SWFactory StackSets
    /^stackset-domainjoinautom/i,               // Domain Join StackSets (with or without trailing 'a')
    /^domain-join-output-tf-/i,                 // Domain Join Terraform
    /^swfactory-simple-install-tf-/i,           // SWFactory Terraform
    /^ssm-maintenance-\d+-us-gov-(east|west)-\d+$/i, // SSM Maintenance
    /^cloudtrail-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, // CloudTrail with UUID
    /^stackset-trend-micro-uni-/i               // Trend Micro Uninstall StackSets
  ]

  return landingZonePatterns.some(pattern => pattern.test(bucketName))
}

// Get landing zone bucket type for display
const getLandingZoneBucketType = (bucketName: string): string | null => {
  if (/^stackset-swfactory-/i.test(bucketName)) return 'SWFactory StackSet'
  if (/^stackset-domainjoinautom/i.test(bucketName)) return 'Domain Join StackSet'
  if (/^domain-join-output-tf-/i.test(bucketName)) return 'Domain Join'
  if (/^swfactory-simple-install-tf-/i.test(bucketName)) return 'SWFactory Install'
  if (/^ssm-maintenance-/i.test(bucketName)) return 'SSM Maintenance'
  if (/^cloudtrail-/i.test(bucketName)) return 'CloudTrail'
  if (/^stackset-trend-micro-uni-/i.test(bucketName)) return 'Trend Micro'
  return null
}

const formatDate = (dateString: string) => {
  if (!dateString) return 'Unknown'
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

onMounted(() => {
  fetchBuckets()
})

watch(() => props.accountId, () => {
  fetchBuckets()
})
</script>
