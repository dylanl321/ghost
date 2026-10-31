<template>
  <div class="space-y-4">
    <!-- Mode Toggle -->
    <div class="flex items-center gap-2">
      <UButton :color="mode === 'manual' ? 'primary' : 'gray'" size="xs" @click="mode = 'manual'">
        <Icon name="i-heroicons-command-line" class="w-3.5 h-3.5 mr-1" />
        Manual Query
      </UButton>
      <UButton :color="mode === 'ai' ? 'primary' : 'gray'" size="xs" @click="mode = 'ai'">
        <Icon name="i-heroicons-sparkles" class="w-3.5 h-3.5 mr-1" />
        AI Assist
      </UButton>
    </div>

    <!-- Manual Mode -->
    <div v-if="mode === 'manual'" class="space-y-4">
      <div class="flex gap-4 flex-wrap">
        <USelect v-model="resourceType" :options="resourceTypeOptions" placeholder="Select resource type" class="w-64" />
        <UInput v-model="query" placeholder="Search by name or ID" class="flex-1 min-w-[200px]" @keyup.enter="searchResources" />
        <USelect v-model="environment" :options="environmentOptions" class="w-40" />
        <UButton color="primary" :loading="loading" @click="searchResources">
          <Icon name="i-heroicons-magnifying-glass" class="w-4 h-4 mr-1" />
          Search
        </UButton>
      </div>
      <div class="flex items-center gap-2 text-xs text-gray-400">
        <Icon name="i-heroicons-light-bulb" class="w-3.5 h-3.5" />
        <span>Search across EC2, S3, IAM, Lambda, RDS, Security Groups, ENIs, EBS, VPCs, Subnets, ELBs, and CloudFront.</span>
      </div>
    </div>

    <!-- AI Mode -->
    <div v-else class="space-y-4">
      <UTextarea v-model="aiQuery" placeholder="Describe what you're looking for (e.g., 'Find all S3 buckets without encryption' or 'Show EC2 instances tagged as production')" :rows="2" />
      <div class="flex gap-4">
        <USelect v-model="environment" :options="environmentOptions" class="w-40" />
        <UButton color="primary" :loading="aiLoading" :disabled="!aiQuery.trim()" @click="generateResourceQuery">
          <Icon name="i-heroicons-sparkles" class="w-4 h-4 mr-1" />
          Generate Query
        </UButton>
      </div>

      <div v-if="generatedQuery" class="bg-gray-100 dark:bg-gray-800 rounded-lg p-3 space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Generated Config SQL:</span>
          <UButton size="xs" variant="ghost" @click="copyToClipboard(generatedQuery)">
            <Icon name="i-heroicons-clipboard" class="w-4 h-4" />
          </UButton>
        </div>
        <pre class="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap overflow-x-auto">{{ generatedQuery }}</pre>
        <p v-if="queryExplanation" class="text-xs text-gray-500 italic">{{ queryExplanation }}</p>
        <UButton color="primary" size="sm" :loading="loading" @click="executeGeneratedResourceQuery">
          Execute Query
        </UButton>
      </div>
    </div>

    <!-- Results -->
    <div v-if="results.length > 0" class="space-y-2">
      <div class="flex items-center justify-between">
        <span class="text-sm text-gray-600 dark:text-gray-400">Found {{ results.length }} resources</span>
        <UButton size="xs" variant="ghost" color="gray" @click="exportResults">
          <Icon name="i-heroicons-arrow-down-tray" class="w-4 h-4 mr-1" />
          Export CSV
        </UButton>
      </div>
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead>
            <tr>
              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Resource ID</th>
              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Account</th>
              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Region</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
            <tr v-for="resource in results" :key="resource.resourceId" class="hover:bg-gray-50 dark:hover:bg-gray-800/30">
              <td class="px-4 py-2 text-sm font-mono text-gray-900 dark:text-white">{{ resource.resourceId }}</td>
              <td class="px-4 py-2 text-sm text-gray-900 dark:text-white">{{ resource.resourceName || '-' }}</td>
              <td class="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">{{ resource.resourceType?.split('::').pop() }}</td>
              <td class="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">{{ resource.accountId }}</td>
              <td class="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">{{ resource.awsRegion }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="error" class="bg-red-50 dark:bg-red-900/20 rounded-lg p-4">
      <div class="flex items-center gap-2 text-red-600 dark:text-red-400">
        <Icon name="i-heroicons-exclamation-triangle" class="w-5 h-5" />
        <span>{{ error }}</span>
      </div>
    </div>

    <!-- Query Results Modal -->
    <UModal v-model="showQueryResultsModal" :ui="{ width: 'max-w-6xl' }">
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Query Results</h3>
            <UButton color="gray" variant="ghost" icon="i-heroicons-x-mark" @click="showQueryResultsModal = false" />
          </div>
        </template>
        <QueryResultsViewer v-if="queryResults" :records="queryResults.records" :attribute-schema="queryResults.attributeSchema" :total-count="queryResults.totalCount" :query-type="queryResults.queryType" :execution-time="queryResults.executionTime" @close="showQueryResultsModal = false" />
      </UCard>
    </UModal>
  </div>
</template>

<script setup lang="ts">
const toast = useToast()

const environmentOptions = [
  { label: 'GovCloud', value: 'govcloud' },
  { label: 'Commercial', value: 'commercial' }
]

const resourceTypeOptions = [
  { label: 'EC2 Instance', value: 'AWS::EC2::Instance' },
  { label: 'S3 Bucket', value: 'AWS::S3::Bucket' },
  { label: 'Security Group', value: 'AWS::EC2::SecurityGroup' },
  { label: 'IAM Role', value: 'AWS::IAM::Role' },
  { label: 'Lambda Function', value: 'AWS::Lambda::Function' },
  { label: 'RDS Instance', value: 'AWS::RDS::DBInstance' },
  { label: 'Network Interface', value: 'AWS::EC2::NetworkInterface' },
  { label: 'EBS Volume', value: 'AWS::EC2::Volume' },
  { label: 'VPC', value: 'AWS::EC2::VPC' },
  { label: 'Subnet', value: 'AWS::EC2::Subnet' },
  { label: 'ELB', value: 'AWS::ElasticLoadBalancingV2::LoadBalancer' },
  { label: 'CloudFront', value: 'AWS::CloudFront::Distribution' }
]

const mode = ref<'manual' | 'ai'>('manual')
const resourceType = ref('')
const query = ref('')
const environment = ref<'commercial' | 'govcloud'>('govcloud')
const aiQuery = ref('')
const generatedQuery = ref('')
const queryExplanation = ref('')
const loading = ref(false)
const aiLoading = ref(false)
const results = ref<any[]>([])
const error = ref('')
const showQueryResultsModal = ref(false)
const queryResults = ref<any>(null)

async function searchResources() {
  loading.value = true; error.value = ''; results.value = []
  try {
    const response = await $fetch('/api/config/resources', {
      params: { resourceType: resourceType.value || undefined, resourceName: query.value || undefined, environment: environment.value, responseDetail: 'simple', limit: 50 }
    })
    results.value = (response as any).data.resources || []
  } catch (err: any) {
    error.value = err.data?.error?.message || err.message || 'Failed to search resources'
  } finally { loading.value = false }
}

async function generateResourceQuery() {
  if (!aiQuery.value.trim()) { error.value = 'Please describe what you want to find'; return }
  aiLoading.value = true; error.value = ''
  try {
    const response = await $fetch('/api/support/ai-query-generator', {
      method: 'POST', body: { naturalLanguageQuery: aiQuery.value, queryType: 'config', context: { environment: environment.value } }
    })
    const data = (response as any).data
    generatedQuery.value = data.generatedQuery; queryExplanation.value = data.explanation
  } catch (err: any) {
    error.value = err.data?.error?.message || err.message || 'Failed to generate query'
  } finally { aiLoading.value = false }
}

async function executeGeneratedResourceQuery() {
  if (!generatedQuery.value) { error.value = 'No query to execute'; return }
  loading.value = true; error.value = ''
  try {
    const response = await $fetch('/api/support/execute-query', {
      method: 'POST', body: { queryType: 'config', query: generatedQuery.value, environment: environment.value, limit: 100 }
    })
    queryResults.value = (response as any).data; showQueryResultsModal.value = true
  } catch (err: any) {
    error.value = err.data?.error?.message || err.message || 'Failed to execute query'
  } finally { loading.value = false }
}

function exportResults() {
  if (!results.value.length) return
  const headers = ['Resource ID', 'Name', 'Type', 'Account', 'Region']
  const rows = results.value.map(r => [r.resourceId, r.resourceName || '', r.resourceType?.split('::').pop() || '', r.accountId, r.awsRegion].join(','))
  const csv = [headers.join(','), ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = `resource-search-${Date.now()}.csv`; a.click()
  URL.revokeObjectURL(url)
  toast.add({ title: 'Results exported as CSV', icon: 'i-heroicons-arrow-down-tray', color: 'green', timeout: 2000 })
}
</script>
