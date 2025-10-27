<template>
  <UCard v-bind="$attrs" class="h-full flex flex-col">
    <template #header>
      <div class="flex justify-between items-center">
        <div class="text-lg font-semibold">S3 Buckets</div>
        <div class="flex items-center gap-3">
          <div class="flex items-center gap-2">
            <UToggle v-model="showLandingZoneBuckets" />
            <span class="text-sm text-gray-400">Show LZ Buckets</span>
          </div>
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
      <!-- All Metrics in Single Row -->
      <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        <!-- Summary Cards -->
        <div class="bg-gray-800/50 rounded-lg p-3">
          <div class="text-xs text-gray-400">App Buckets</div>
          <div class="text-xl font-bold text-yellow-400">{{ filteredBuckets.length }}</div>
        </div>
        <div class="bg-gray-800/50 rounded-lg p-3">
          <div class="text-xs text-gray-400">Landing Zone</div>
          <div class="text-xl font-bold text-purple-400">{{ landingZoneBucketsCount }}</div>
        </div>
        <div class="bg-gray-800/50 rounded-lg p-3">
          <div class="text-xs text-gray-400">Versioned</div>
          <div class="text-xl font-bold text-blue-400">{{ versionedCount }}</div>
        </div>
        <div class="bg-gray-800/50 rounded-lg p-3">
          <div class="text-xs text-gray-400">Encrypted</div>
          <div class="text-xl font-bold text-green-400">{{ encryptedCount }}</div>
        </div>

        <!-- Policy Analysis -->
        <div v-if="policyAnalysis" class="bg-gray-800/50 rounded-lg p-3">
          <div class="text-xs text-gray-400">Analyzed</div>
          <div class="text-xl font-bold text-white">{{ policyAnalysis.summary.bucketsWithPolicies }}</div>
        </div>
        <div v-if="policyAnalysis" class="bg-red-900/20 rounded-lg p-3">
          <div class="text-xs text-gray-400">Public</div>
          <div class="text-xl font-bold text-red-400">{{ policyAnalysis.summary.publicBuckets }}</div>
        </div>
        <div v-if="policyAnalysis" class="bg-yellow-900/20 rounded-lg p-3">
          <div class="text-xs text-gray-400">Cross-Acct</div>
          <div class="text-xl font-bold text-yellow-400">{{ policyAnalysis.summary.crossAccountBuckets }}</div>
        </div>
        <div v-if="policyAnalysis" class="bg-purple-900/20 rounded-lg p-3">
          <div class="text-xs text-gray-400">Risks</div>
          <div class="text-xl font-bold text-purple-400">
            {{ policyAnalysis.summary.criticalRisks + policyAnalysis.summary.highRisks }}
          </div>
        </div>
      </div>

      <!-- Buckets Table -->
      <div class="overflow-y-auto" style="max-height: 500px;">
        <UTable :rows="filteredBuckets" :columns="columns">
          <!-- Bucket Details -->
          <template #resourceId-data="{ row }">
            <div class="py-2">
              <!-- Top Row: Name + Type Badge + Region + Date -->
              <div class="flex items-center gap-3 flex-wrap mb-2">
                <button
                  @click="showPolicyModal(row.resourceId)"
                  class="font-medium text-sm text-blue-400 hover:text-blue-300 transition-colors"
                >
                  {{ row.resourceId }}
                </button>
                <UBadge
                  v-if="isLandingZoneBucket(row.resourceId)"
                  color="purple"
                  variant="soft"
                  size="xs"
                >
                  {{ getLandingZoneBucketType(row.resourceId) }}
                </UBadge>
                <span class="text-xs text-gray-500">{{ row.region }}</span>
                <span class="text-xs text-gray-500">•</span>
                <span class="text-xs text-gray-500">{{ formatDate(row.configuration?.creationDate || row.creationTime) }}</span>
              </div>

              <!-- Bottom Row: All Badges Horizontally -->
              <div class="flex flex-wrap gap-1.5 items-center">
                <!-- Security Indicators -->
                <UBadge
                  v-if="getBucketAnalysis(row.resourceId)?.isPublic"
                  color="red"
                  variant="solid"
                  size="xs"
                >
                  <UIcon name="i-heroicons-exclamation-triangle" class="w-3 h-3 mr-1" />
                  Public
                </UBadge>
                <UBadge
                  v-if="getBucketAnalysis(row.resourceId)?.allowsCrossAccount"
                  color="yellow"
                  variant="soft"
                  size="xs"
                >
                  <UIcon name="i-heroicons-arrow-path" class="w-3 h-3 mr-1" />
                  Cross-Account
                </UBadge>
                <UBadge
                  v-if="!hasSSLRequirement(row)"
                  color="red"
                  variant="soft"
                  size="xs"
                >
                  <UIcon name="i-heroicons-lock-open" class="w-3 h-3 mr-1" />
                  No SSL
                </UBadge>

                <!-- Features -->
                <UBadge
                  v-if="hasVersioning(row)"
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
                  v-if="hasPublicAccessBlock(row)"
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

                <!-- Separator for tags if they exist -->
                <span v-if="row.tags && Object.keys(row.tags).length > 0" class="text-xs text-gray-600">|</span>

                <!-- Tags -->
                <UBadge
                  v-for="(value, key) in Object.entries(row.tags).slice(0, 3)"
                  :key="key"
                  color="gray"
                  variant="outline"
                  size="xs"
                >
                  {{ key }}
                </UBadge>
                <UBadge
                  v-if="row.tags && Object.keys(row.tags).length > 3"
                  color="gray"
                  variant="outline"
                  size="xs"
                >
                  +{{ Object.keys(row.tags).length - 3 }}
                </UBadge>
              </div>
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

  <!-- Policy Details Modal -->
  <UModal v-model="policyModalOpen" :ui="{ width: 'sm:max-w-4xl' }">
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-lg font-semibold">Bucket Policy</h3>
            <p class="text-sm text-gray-400">{{ selectedBucketName }}</p>
          </div>
          <UButton icon="i-heroicons-x-mark" variant="ghost" @click="policyModalOpen = false" />
        </div>
      </template>

      <div v-if="selectedBucketPolicy" class="space-y-4">
        <!-- Analysis Summary -->
        <div v-if="selectedBucketAnalysis" class="bg-gray-800/30 rounded-lg p-4">
          <div class="text-sm font-medium text-gray-300 mb-3">Analysis</div>
          <div class="grid grid-cols-2 gap-3">
            <div class="flex items-center gap-2">
              <UIcon
                :name="selectedBucketAnalysis.isPublic ? 'i-heroicons-exclamation-triangle' : 'i-heroicons-check-circle'"
                :class="selectedBucketAnalysis.isPublic ? 'text-red-400' : 'text-green-400'"
              />
              <span class="text-sm">
                {{ selectedBucketAnalysis.isPublic ? 'Public Access' : 'Not Public' }}
              </span>
            </div>
            <div class="flex items-center gap-2">
              <UIcon
                :name="selectedBucketAnalysis.allowsCrossAccount ? 'i-heroicons-arrow-path' : 'i-heroicons-lock-closed'"
                :class="selectedBucketAnalysis.allowsCrossAccount ? 'text-yellow-400' : 'text-green-400'"
              />
              <span class="text-sm">
                {{ selectedBucketAnalysis.allowsCrossAccount ? 'Cross-Account Access' : 'Single Account' }}
              </span>
            </div>
          </div>

          <!-- Risks -->
          <div v-if="selectedBucketAnalysis.risks.length > 0" class="mt-3 space-y-2">
            <div class="text-sm font-medium text-gray-300">Risks Found:</div>
            <div
              v-for="(risk, idx) in selectedBucketAnalysis.risks"
              :key="idx"
              class="flex items-start gap-2 text-sm"
            >
              <UBadge
                :color="risk.severity === 'critical' ? 'red' : risk.severity === 'high' ? 'orange' : risk.severity === 'medium' ? 'yellow' : 'gray'"
                size="xs"
                variant="solid"
              >
                {{ risk.severity.toUpperCase() }}
              </UBadge>
              <span class="text-gray-300">{{ risk.finding }}</span>
            </div>
          </div>

          <!-- Cross-Account Principals -->
          <div v-if="selectedBucketAnalysis.crossAccountPrincipals.length > 0" class="mt-3">
            <div class="text-sm font-medium text-gray-300 mb-2">Cross-Account Principals:</div>
            <div class="flex flex-wrap gap-1">
              <UBadge
                v-for="accountId in selectedBucketAnalysis.crossAccountPrincipals"
                :key="accountId"
                color="yellow"
                variant="soft"
                size="xs"
              >
                {{ accountId }}
              </UBadge>
            </div>
          </div>
        </div>

        <!-- Policy JSON -->
        <div>
          <div class="flex items-center justify-between mb-2">
            <div class="text-sm font-medium text-gray-300">Policy Document</div>
            <UButton
              size="xs"
              variant="soft"
              icon="i-heroicons-clipboard-document"
              @click="copyPolicy"
            >
              Copy
            </UButton>
          </div>
          <pre class="bg-gray-900 rounded-lg p-4 text-xs text-gray-300 overflow-x-auto max-h-96 overflow-y-auto">{{ formatPolicyJson(selectedBucketPolicy) }}</pre>
        </div>
      </div>

      <div v-else class="text-center py-8 text-gray-400">
        No policy attached to this bucket
      </div>
    </UCard>
  </UModal>
</template>

<script setup lang="ts">
defineOptions({
  inheritAttrs: false
})

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
const analyzingPolicies = ref(false)
const policyAnalysis = ref<any>(null)
const policyModalOpen = ref(false)
const selectedBucketName = ref('')
const selectedBucketPolicy = ref<any>(null)
const selectedBucketAnalysis = ref<any>(null)

const columns = [
  { key: 'resourceId', label: 'Bucket Details' }
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
    const url = `/api/config/resources?environment=${props.environment}&resourceType=AWS::S3::Bucket&accountIds=${props.accountId}&responseDetail=full&limit=1000${nextToken.value ? `&nextToken=${nextToken.value}` : ''}`

    const response = await fetch(url)
    const data = await response.json()

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

    // Auto-analyze policies after loading buckets
    if (!append && buckets.value.length > 0) {
      await analyzePolicies()
    }
  } catch (error) {
    console.error('Error fetching buckets:', error)
    errorMessage.value = (error as Error).message || 'Unknown error'
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
  return filteredBuckets.value.filter(b => hasVersioning(b)).length
})

const encryptedCount = computed(() => {
  return filteredBuckets.value.filter(b => hasEncryption(b)).length
})

const landingZoneBucketsCount = computed(() => {
  return buckets.value.filter(b => isLandingZoneBucket(b.resourceId)).length
})

// Helper functions
const hasVersioning = (bucket: any): boolean => {
  // Check supplementaryConfiguration first
  if (bucket.supplementaryConfiguration?.BucketVersioningConfiguration) {
    try {
      const versionConfig = typeof bucket.supplementaryConfiguration.BucketVersioningConfiguration === 'string'
        ? JSON.parse(bucket.supplementaryConfiguration.BucketVersioningConfiguration)
        : bucket.supplementaryConfiguration.BucketVersioningConfiguration
      return versionConfig?.status === 'Enabled'
    } catch (e) {
      return false
    }
  }
  // Fallback to configuration
  return bucket.configuration?.versioningConfiguration?.status === 'Enabled'
}

const hasEncryption = (bucket: any): boolean => {
  // Check supplementaryConfiguration (from Config API)
  if (bucket.supplementaryConfiguration?.ServerSideEncryptionConfiguration) {
    try {
      const sseConfig = typeof bucket.supplementaryConfiguration.ServerSideEncryptionConfiguration === 'string'
        ? JSON.parse(bucket.supplementaryConfiguration.ServerSideEncryptionConfiguration)
        : bucket.supplementaryConfiguration.ServerSideEncryptionConfiguration
      return sseConfig?.rules?.length > 0
    } catch (e) {
      return false
    }
  }
  // Fallback to configuration (legacy)
  return bucket.configuration?.serverSideEncryptionConfiguration?.rules?.length > 0
}

const hasPublicAccessBlock = (bucket: any): boolean => {
  // Check supplementaryConfiguration first
  if (bucket.supplementaryConfiguration?.PublicAccessBlockConfiguration) {
    try {
      const pabConfig = typeof bucket.supplementaryConfiguration.PublicAccessBlockConfiguration === 'string'
        ? JSON.parse(bucket.supplementaryConfiguration.PublicAccessBlockConfiguration)
        : bucket.supplementaryConfiguration.PublicAccessBlockConfiguration
      return !!pabConfig && Object.keys(pabConfig).length > 0
    } catch (e) {
      return false
    }
  }
  // Fallback to configuration
  return !!bucket.configuration?.publicAccessBlockConfiguration
}

// Check if bucket has SSL requirement policy
const hasSSLRequirement = (bucket: any): boolean => {
  if (!bucket.supplementaryConfiguration?.BucketPolicy) return false

  try {
    const bucketPolicyObj = JSON.parse(bucket.supplementaryConfiguration.BucketPolicy)
    if (!bucketPolicyObj.policyText) return false

    const policy = JSON.parse(bucketPolicyObj.policyText)
    if (!policy.Statement) return false

    // Check for SSL/SecureTransport requirement
    return policy.Statement.some((statement: any) =>
      statement.Effect === 'Deny' &&
      statement.Condition?.Bool?.['aws:SecureTransport'] === 'false'
    )
  } catch (e) {
    return false
  }
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
    /^stackset-trend-micro-unin?-/i             // Trend Micro Uninstall StackSets
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
  if (/^stackset-trend-micro-unin?-/i.test(bucketName)) return 'Trend Micro'
  return null
}

const formatDate = (dateString: string) => {
  if (!dateString) return 'Unknown'
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

// Analyze bucket policies from Config data (client-side, instant, no API calls)
const analyzePolicies = async () => {
  if (filteredBuckets.value.length === 0) return

  analyzingPolicies.value = true
  try {
    const allAnalyses: any[] = []
    let policiesFound = 0

    // Analyze each bucket using data from Config
    for (const bucket of filteredBuckets.value) {
      let policy = null

      // Extract policy from supplementaryConfiguration.BucketPolicy (uppercase B)
      // Note: AWS returns double-encoded JSON strings
      if (bucket.supplementaryConfiguration?.BucketPolicy) {
        try {
          // First parse: gets { policyText: "..." }
          const bucketPolicyObj = JSON.parse(bucket.supplementaryConfiguration.BucketPolicy)

          // Second parse: gets the actual policy document
          if (bucketPolicyObj.policyText) {
            policy = JSON.parse(bucketPolicyObj.policyText)
            policiesFound++
          }
        } catch (e) {
          // Silently skip buckets with unparseable policies
        }
      }

      // Analyze the policy client-side
      const analysis = analyzeBucketPolicyClientSide(bucket.resourceId, policy, bucket.accountId || props.accountId)
      allAnalyses.push(analysis)
    }

    // Generate summary
    const summary = {
      totalBuckets: allAnalyses.length,
      bucketsWithPolicies: allAnalyses.filter(a => a.hasPolicy).length,
      publicBuckets: allAnalyses.filter(a => a.isPublic).length,
      crossAccountBuckets: allAnalyses.filter(a => a.allowsCrossAccount).length,
      criticalRisks: allAnalyses.reduce((sum, a) => sum + a.risks.filter((r: any) => r.severity === 'critical').length, 0),
      highRisks: allAnalyses.reduce((sum, a) => sum + a.risks.filter((r: any) => r.severity === 'high').length, 0),
      mediumRisks: allAnalyses.reduce((sum, a) => sum + a.risks.filter((r: any) => r.severity === 'medium').length, 0),
      lowRisks: allAnalyses.reduce((sum, a) => sum + a.risks.filter((r: any) => r.severity === 'low').length, 0)
    }

    policyAnalysis.value = { analyses: allAnalyses, summary }

    console.log(`Policy analysis: ${summary.publicBuckets} public, ${summary.crossAccountBuckets} cross-account, ${summary.criticalRisks + summary.highRisks} high-severity risks`)
  } catch (error) {
    console.error('Error analyzing policies:', error)
  } finally {
    analyzingPolicies.value = false
  }
}

// Client-side policy analysis (copied logic from server)
const analyzeBucketPolicyClientSide = (bucketName: string, policy: any, bucketAccountId: string) => {
  if (!policy || !policy.Statement) {
    return {
      bucketName,
      hasPolicy: false,
      isPublic: false,
      allowsCrossAccount: false,
      crossAccountPrincipals: [],
      publicAccess: { allowsPublicRead: false, allowsPublicWrite: false, allowsPublicList: false },
      risks: []
    }
  }

  const risks: any[] = []
  const crossAccountPrincipals: string[] = []
  let isPublic = false
  let allowsPublicRead = false
  let allowsPublicWrite = false
  let allowsPublicList = false
  let allowsCrossAccount = false

  for (const statement of policy.Statement) {
    if (statement.Effect === 'Deny') continue

    const actions = Array.isArray(statement.Action) ? statement.Action : [statement.Action]
    const principal = statement.Principal

    // Check for public access
    if (principal === '*' || principal?.AWS === '*') {
      isPublic = true
      const hasRead = actions.some((a: string) => a === 's3:GetObject' || a === 's3:*')
      const hasWrite = actions.some((a: string) => a === 's3:PutObject' || a === 's3:DeleteObject' || a === 's3:*')
      const hasList = actions.some((a: string) => a === 's3:ListBucket' || a === 's3:*')

      if (hasRead) {
        allowsPublicRead = true
        risks.push({ severity: 'critical', finding: 'Bucket allows public read access' })
      }
      if (hasWrite) {
        allowsPublicWrite = true
        risks.push({ severity: 'critical', finding: 'Bucket allows public write access' })
      }
      if (hasList) {
        allowsPublicList = true
        risks.push({ severity: 'high', finding: 'Bucket allows public list access' })
      }
    } else if (principal?.AWS) {
      // Check for cross-account
      const awsPrincipals = Array.isArray(principal.AWS) ? principal.AWS : [principal.AWS]
      for (const arn of awsPrincipals) {
        if (typeof arn === 'string' && arn !== '*') {
          const match = arn.match(/arn:aws[^:]*::(\d{12}):/)
          if (match && match[1] && match[1] !== bucketAccountId) {
            const accountId = match[1]
            allowsCrossAccount = true
            crossAccountPrincipals.push(accountId)
            risks.push({ severity: 'medium', finding: `Grants access to account ${accountId}` })
          }
        }
      }
    }
  }

  return {
    bucketName,
    hasPolicy: true,
    isPublic,
    allowsCrossAccount,
    crossAccountPrincipals: [...new Set(crossAccountPrincipals)],
    publicAccess: { allowsPublicRead, allowsPublicWrite, allowsPublicList },
    risks
  }
}

// Get policy analysis for a specific bucket
const getBucketAnalysis = (bucketName: string) => {
  if (!policyAnalysis.value) return null
  return policyAnalysis.value.analyses.find((a: any) => a.bucketName === bucketName)
}

// Show policy modal
const showPolicyModal = (bucketName: string) => {
  selectedBucketName.value = bucketName

  // Find the bucket
  const bucket = filteredBuckets.value.find(b => b.resourceId === bucketName)
  if (!bucket) return

  // Extract policy
  let policy = null
  if (bucket.supplementaryConfiguration?.BucketPolicy) {
    try {
      const bucketPolicyObj = JSON.parse(bucket.supplementaryConfiguration.BucketPolicy)
      if (bucketPolicyObj.policyText) {
        policy = JSON.parse(bucketPolicyObj.policyText)
      }
    } catch (e) {
      console.error('Failed to parse policy:', e)
    }
  }

  selectedBucketPolicy.value = policy
  selectedBucketAnalysis.value = getBucketAnalysis(bucketName)
  policyModalOpen.value = true
}

// Format policy JSON for display
const formatPolicyJson = (policy: any) => {
  return JSON.stringify(policy, null, 2)
}

// Copy policy to clipboard
const copyPolicy = async () => {
  if (!selectedBucketPolicy.value) return

  try {
    await navigator.clipboard.writeText(formatPolicyJson(selectedBucketPolicy.value))
  } catch (error) {
    console.error('Failed to copy:', error)
  }
}

onMounted(() => {
  fetchBuckets()
})

watch(() => props.accountId, () => {
  fetchBuckets()
  policyAnalysis.value = null // Clear policy analysis when account changes
})
</script>
