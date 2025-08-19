<template>
  <UContainer class="py-8">
    <h1 class="text-3xl font-bold mb-8">Account API Test Suite</h1>
    
    <!-- Debug Info -->
    <UCard class="mb-4">
      <template #header>
        <h2 class="text-lg font-semibold">Debug Info</h2>
      </template>
      <div class="space-y-2 text-sm">
        <p>Filters count: {{ filters.length }}</p>
        <p>Loading: {{ loading }}</p>
        <p>Response exists: {{ !!response }}</p>
        <UButton size="sm" color="info" @click="debugTest">Test Click</UButton>
      </div>
    </UCard>
    
    <!-- Quick Test Buttons -->
    <div class="mb-8">
      <h2 class="text-xl font-semibold mb-4">Quick Tests</h2>
      <div class="flex flex-wrap gap-2">
        <UButton 
          v-for="test in quickTests" 
          :key="test.name"
          size="sm"
          :color="(test.color as any) || 'primary'"
          @click="() => runQuickTest(test)"
        >
          {{ test.name }}
        </UButton>
      </div>
    </div>

    <!-- Advanced Filter Builder -->
    <UCard class="mb-8">
      <template #header>
        <h2 class="text-xl font-semibold">Advanced Filter Builder</h2>
      </template>
      
      <div class="space-y-4">
        <!-- Source & Enrichment -->
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium mb-1">Source</label>
            <USelect v-model="filterParams.source" :items="sourceOptions" />
          </div>
          
          <div>
            <label class="block text-sm font-medium mb-1">Enrichment Level</label>
            <USelect v-model="filterParams.enrichment" :items="enrichmentOptions" />
          </div>
        </div>

        <!-- Search -->
        <div>
          <label class="block text-sm font-medium mb-1">Search (case-insensitive)</label>
          <UInput v-model="filterParams.search" placeholder="Search across all fields..." />
        </div>

        <!-- Dynamic Filters -->
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <label class="text-sm font-medium">Filters</label>
            <UButton size="xs" @click="addFilter">Add Filter</UButton>
          </div>
          
          <div v-for="(filter, index) in filters" :key="index" class="flex gap-2">
            <UInput 
              v-model="filter.key" 
              placeholder="Field name"
              class="flex-1"
              list="field-suggestions"
            />
            <USelect 
              v-model="filter.operator" 
              :items="operatorOptions"
              class="w-40"
            />
            <UInput 
              v-model="filter.value" 
              placeholder="Value"
              class="flex-1"
            />
            <UButton 
              color="error" 
              size="sm" 
              variant="soft"
              @click="removeFilter(index)"
            >
              X
            </UButton>
          </div>
        </div>

        <!-- Sorting -->
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium mb-1">Sort By</label>
            <UInput v-model="filterParams.sortBy" placeholder="Field name" list="field-suggestions" />
          </div>
          
          <div>
            <label class="block text-sm font-medium mb-1">Order</label>
            <USelect v-model="filterParams.order" :items="orderOptions" />
          </div>
        </div>

        <!-- Account Type Filter -->
        <div>
          <label class="block text-sm font-medium mb-1">Account Type</label>
          <USelect v-model="filterParams.accountType" :items="accountTypeOptions" />
        </div>

        <!-- Active Accounts Only Toggle -->
        <div>
          <label class="flex items-center space-x-2">
            <UCheckbox v-model="filterParams.activeOnly" />
            <span class="text-sm font-medium">Active Accounts Only (exclude Decommissioned)</span>
          </label>
        </div>

        <!-- Action Buttons -->
        <div class="flex gap-2">
          <UButton color="primary" @click="executeQuery">Execute Query</UButton>
          <UButton variant="outline" @click="clearFilters">Clear All</UButton>
          <UButton variant="soft" @click="copyUrl">Copy URL</UButton>
        </div>
      </div>

      <!-- Field Suggestions (HTML5 datalist) -->
      <datalist id="field-suggestions">
        <option v-for="field in fieldSuggestions" :key="field" :value="field" />
      </datalist>
    </UCard>

    <!-- Request/Response Display -->
    <div class="grid grid-cols-2 gap-4 mb-8">
      <!-- Request -->
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold">Request</h3>
        </template>
        <div class="space-y-2">
          <div class="text-sm font-medium text-highlighted">Endpoint:</div>
          <code class="block p-2 bg-neutral-100 dark:bg-neutral-800 rounded text-xs break-all text-highlighted">{{ currentUrl }}</code>
          <div class="text-sm font-medium text-highlighted">Method: {{ currentMethod }}</div>
          <div v-if="currentBody" class="mt-2">
            <div class="text-sm font-medium text-highlighted">Body:</div>
            <pre class="p-2 bg-neutral-100 dark:bg-neutral-800 rounded text-xs overflow-auto text-highlighted">{{ JSON.stringify(currentBody, null, 2) }}</pre>
          </div>
        </div>
      </UCard>

      <!-- Response -->
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold">Response</h3>
        </template>
        <div v-if="loading" class="text-center py-8">
          <div class="animate-spin text-3xl">Loading...</div>
        </div>
        <div v-else-if="error" class="text-error">
          <div class="font-semibold mb-2">Error:</div>
          <pre class="text-xs overflow-auto">{{ JSON.stringify(error, null, 2) }}</pre>
        </div>
        <div v-else-if="response">
          <div class="text-sm font-medium text-highlighted mb-2">
            Status: <span :class="response.success ? 'text-success' : 'text-error'">{{ response.success ? 'Success' : 'Failed' }}</span>
          </div>
          <div class="text-sm font-medium text-highlighted mb-2">
            Count: {{ response.metadata?.count || response.data?.length || 0 }}
          </div>
          <div class="text-sm font-medium text-highlighted mb-2">
            Sample Data Keys: {{ response.data?.[0] ? Object.keys(response.data[0]).join(', ') : 'No data' }}
          </div>
          <pre class="p-2 bg-neutral-100 dark:bg-neutral-800 rounded text-xs overflow-auto max-h-96 text-highlighted">{{ JSON.stringify(response, null, 2) }}</pre>
        </div>
      </UCard>
    </div>

    <!-- Results Table -->
    <UCard v-if="response?.data?.length > 0">
      <template #header>
        <div class="flex justify-between items-center">
          <h3 class="text-lg font-semibold">Results Table ({{ response.data.length }} accounts)</h3>
          <div class="text-sm text-muted">
            Columns: {{ tableColumns.length }} | First row keys: {{ Object.keys(response.data[0] || {}).length }}
          </div>
        </div>
      </template>
      
      <div class="space-y-4">
        <!-- Debug info -->
        <details class="text-xs">
          <summary class="cursor-pointer text-highlighted font-medium">Debug Table Data</summary>
          <div class="mt-2 space-y-2">
            <div><strong>Columns:</strong> {{ JSON.stringify(tableColumns, null, 2) }}</div>
            <div><strong>First Row:</strong> {{ JSON.stringify(response.data[0], null, 2) }}</div>
          </div>
        </details>
        
        <!-- Simple table fallback to test if UTable is the issue -->
        <div class="border rounded-lg overflow-hidden">
          <table class="w-full text-xs">
            <thead class="bg-neutral-50 dark:bg-neutral-800">
              <tr>
                <th
v-for="col in tableColumns.slice(0, 6)" :key="col.id" 
                    class="px-3 py-2 text-left font-medium text-highlighted border-b">
                  {{ col.label }}
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-neutral-200 dark:divide-neutral-700">
              <tr
v-for="(row, idx) in response.data.slice(0, 10)" :key="idx"
                  class="hover:bg-neutral-50 dark:hover:bg-neutral-800">
                <td
v-for="col in tableColumns.slice(0, 6)" :key="col.id" 
                    class="px-3 py-2 text-highlighted border-b">
                  {{ row[col.key] || '-' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        
        <!-- Original UTable (commented for debugging) -->
        <!-- <UTable 
          :rows="response.data.slice(0, 20)"
          :columns="tableColumns"
          class="text-xs"
        /> -->
      </div>
      
      <div v-if="response.data.length > 20" class="mt-4 text-sm text-muted text-center">
        Showing first 20 of {{ response.data.length }} results
      </div>
    </UCard>
  </UContainer>
</template>

<script setup lang="ts">
// All Vue composables and Nuxt utilities are auto-imported

// State
const loading = ref(false)
const error = ref<any>(null)
const response = ref<any>(null)
const currentUrl = ref('')
const currentMethod = ref('GET')
const currentBody = ref<any>(null)

// Filter parameters
const filterParams = ref({
  source: 'full',
  enrichment: 'full',
  search: '',
  sortBy: '',
  order: 'asc',
  accountType: 'all',
  activeOnly: true
})

const filters = ref<any[]>([])

// Options
const sourceOptions = [
  { label: 'Full (Organizations + DynamoDB)', value: 'full' },
  { label: 'Organizations Only', value: 'organizations-only' },
  { label: 'Statistics', value: 'statistics' }
]

const enrichmentOptions = [
  { label: 'Simple (IDs, names, status)', value: 'simple' },
  { label: 'Basic (+ project info)', value: 'basic' },
  { label: 'Full (everything)', value: 'full' }
]

const operatorOptions = [
  { label: 'Equals', value: 'eq' },
  { label: 'Not Equals', value: 'ne' },
  { label: 'Contains', value: 'contains' },
  { label: 'Not Contains', value: 'not_contains' },
  { label: 'Begins With', value: 'begins_with' },
  { label: 'Not Begins With', value: 'not_begins_with' },
  { label: 'Greater Than', value: 'gt' },
  { label: 'Greater or Equal', value: 'gte' },
  { label: 'Less Than', value: 'lt' },
  { label: 'Less or Equal', value: 'lte' },
  { label: 'In List', value: 'in' },
  { label: 'Not In List', value: 'not_in' }
]

const orderOptions = [
  { label: 'Ascending', value: 'asc' },
  { label: 'Descending', value: 'desc' }
]

const accountTypeOptions = [
  { label: 'All', value: 'all' },
  { label: 'Commercial Only', value: 'commercial-only' },
  { label: 'GovCloud Paired', value: 'govcloud-paired' }
]

// Field suggestions for autocomplete
const fieldSuggestions = [
  'id', 'govId', 'name', 'email', 'accountType',
  'requestID', 'projectName', 'projectType', 'projectNumber',
  'estimatedMonthlyCharge', 'platformType', 'linesOfBusiness',
  'primaryAccountAdminUsername', 'costManagerUsername',
  'isAWSStdEnv', 'isDirectConnect', 'enclaveType', 'enclaveStatus',
  'region', 'accountAlias', 'organizationStatus'
]

// Quick test configurations
const quickTests = [
  {
    name: 'All Accounts (Simple)',
    color: 'primary',
    params: { enrichment: 'simple' }
  },
  {
    name: 'Search "Dylan"',
    color: 'primary',
    params: { search: 'dylan' }
  },
  {
    name: 'GovCloud Paired Only',
    color: 'primary',
    params: { accountType: 'govcloud-paired', enrichment: 'basic' }
  },
  {
    name: 'High Budget (>$1000)',
    color: 'warning',
    filters: [{ key: 'estimatedMonthlyCharge', operator: 'gt', value: '1000' }],
    params: { enrichment: 'basic', sortBy: 'estimatedMonthlyCharge', order: 'desc' }
  },
  {
    name: 'Active Accounts',
    color: 'success',
    filters: [{ key: 'organizationStatus', operator: 'eq', value: 'ACTIVE' }],
    params: { enrichment: 'simple' }
  },
  {
    name: 'Suspended Accounts',
    color: 'error',
    filters: [{ key: 'organizationStatus', operator: 'eq', value: 'SUSPENDED' }],
    params: { enrichment: 'simple' }
  },
  {
    name: 'Decommissioned Accounts',
    color: 'neutral',
    filters: [{ key: 'enclaveStatus', operator: 'eq', value: 'Decommissioned' }],
    params: { enrichment: 'simple', activeOnly: false }
  },
  {
    name: 'Commercial Accounts',
    color: 'info',
    filters: [{ key: 'accountType', operator: 'eq', value: 'commercial' }],
    params: { enrichment: 'basic' }
  },
  {
    name: 'GovCloud Accounts',
    color: 'secondary',
    filters: [{ key: 'accountType', operator: 'eq', value: 'govcloud' }],
    params: { enrichment: 'basic' }
  },
  {
    name: 'Project: MUOS',
    color: 'info',
    filters: [{ key: 'projectName', operator: 'contains', value: 'MUOS' }],
    params: { enrichment: 'basic' }
  },
  {
    name: 'Enclave: Cloud',
    color: 'info',
    filters: [{ key: 'enclaveType', operator: 'eq', value: 'Cloud' }],
    params: { enrichment: 'basic' }
  },
  {
    name: 'Platform: Gov Sensitive',
    color: 'secondary',
    filters: [{ key: 'platformType', operator: 'contains', value: 'Government Sensitive' }],
    params: { enrichment: 'basic' }
  },
  {
    name: 'Lookup by ID',
    color: 'neutral',
    isLookup: true,
    body: { accountId: '003194893154' }
  }
]

// Computed
const tableColumns = computed(() => {
  if (!response.value?.data?.[0]) {
    console.log('🔍 No data for table columns')
    return []
  }
  
  const firstItem = response.value.data[0]
  console.log('🔍 First item for table:', firstItem)
  const keys = Object.keys(firstItem).filter(k => k !== '_metadata')
  console.log('🔍 Available keys:', keys)
  
  const columns = keys.slice(0, 8).map(key => ({
    id: key,
    key: key,
    label: key.charAt(0).toUpperCase() + key.slice(1),
    header: key.charAt(0).toUpperCase() + key.slice(1)
  }))
  
  console.log('🔍 Generated columns:', columns)
  return columns
})

// Methods
const debugTest = () => {
  console.log('Debug test clicked!')
  console.log('Vue is reactive, filters count will increase')
  filters.value.push({ key: 'test', operator: 'eq', value: 'debug' })
}

const addFilter = () => {
  console.log('Adding filter')
  filters.value.push({ key: '', operator: 'eq', value: '' })
}

const removeFilter = (index: number) => {
  console.log('Removing filter at index:', index)
  filters.value.splice(index, 1)
}

const clearFilters = () => {
  console.log('Clearing all filters')
  filterParams.value = {
    source: 'full',
    enrichment: 'full',
    search: '',
    sortBy: '',
    order: 'asc',
    accountType: 'all',
    activeOnly: true
  }
  filters.value = []
  response.value = null
  error.value = null
}

const buildUrl = () => {
  const params = new URLSearchParams()
  
  // Updated to use the correct API endpoints
  if (filterParams.value.enrichment && filterParams.value.enrichment !== 'full') {
    params.append('enrichment', filterParams.value.enrichment)
  }
  if (filterParams.value.search) {
    params.append('search', filterParams.value.search)
  }
  if (filterParams.value.sortBy) {
    params.append('sortBy', filterParams.value.sortBy)
  }
  if (filterParams.value.order && filterParams.value.order !== 'asc') {
    params.append('order', filterParams.value.order)
  }
  
  // Include decommissioned accounts if activeOnly is false
  if (!filterParams.value.activeOnly) {
    params.append('includeDecommissioned', 'true')
  }
  
  // Add limit for testing
  params.append('limit', '50')
  
  return `/api/accounts/list?${params.toString()}`
}

const executeQuery = async () => {
  console.log('Executing query...')
  loading.value = true
  error.value = null
  response.value = null
  
  try {
    currentUrl.value = buildUrl()
    currentMethod.value = 'GET'
    currentBody.value = null
    
    console.log('🌐 Fetching:', currentUrl.value)
    const res = await $fetch(currentUrl.value)
    console.log('✅ Response:', res)
    response.value = res
  } catch (err: any) {
    console.error('❌ Query error:', err)
    error.value = {
      message: err.message || 'Unknown error',
      data: err.data || null,
      statusCode: err.statusCode || null
    }
  } finally {
    loading.value = false
  }
}

const runQuickTest = async (test: any) => {
  console.log('🚀 Running quick test:', test.name)
  console.log('🚀 Test object:', test)
  
  if (test.isLookup) {
    // Run lookup endpoint test
    loading.value = true
    error.value = null
    response.value = null
    
    try {
      currentUrl.value = '/api/accounts/lookup'
      currentMethod.value = 'POST'
      currentBody.value = test.body
      
      console.log('Fetching lookup:', currentUrl.value, test.body)
      const res = await $fetch(currentUrl.value, {
        method: 'POST',
        body: test.body
      })
      
      console.log('Lookup response:', res)
      response.value = res
    } catch (err: any) {
      console.error('Lookup error:', err)
      error.value = err.message || err
    } finally {
      loading.value = false
    }
  } else {
    // Set up filter params
    filterParams.value = {
      source: 'full',
      enrichment: 'full',
      search: '',
      sortBy: '',
      order: 'asc',
      accountType: 'all',
      activeOnly: true,
      ...test.params
    }
    
    filters.value = test.filters || []
    
    // Execute query
    await executeQuery()
  }
}

const copyUrl = () => {
  const fullUrl = window.location.origin + buildUrl()
  navigator.clipboard.writeText(fullUrl)
  
  // Visual feedback
  alert('URL Copied to clipboard!')
}
</script>