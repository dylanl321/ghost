<template>
  <UCard>
    <template #header>
      <div class="text-lg font-semibold">Resource Search</div>
    </template>

    <!-- Search + filters row -->
    <div class="flex flex-wrap items-center gap-3 mb-4">
      <UInput
        v-model="searchInput"
        icon="i-heroicons-magnifying-glass"
        placeholder="Search resource type or address..."
        class="flex-1 min-w-[200px]"
      />
      <USelectMenu
        v-model="actionFilter"
        :options="actionOptions"
        value-attribute="value"
        option-attribute="label"
        class="w-40"
        placeholder="Action"
      />
      <USelectMenu
        v-model="appliedFilter"
        :options="appliedOptions"
        value-attribute="value"
        option-attribute="label"
        class="w-40"
        placeholder="Applied"
      />
    </div>

    <!-- Loading state -->
    <CenteredLoadingSpinner v-if="loading" />

    <!-- Empty state -->
    <div v-else-if="!results.length && hasSearched" class="text-center py-8 text-gray-400">
      No resources found matching your search
    </div>

    <!-- Prompt to search -->
    <div v-else-if="!results.length && !hasSearched" class="text-center py-8 text-gray-400">
      Enter a search term to find resources across pipeline runs
    </div>

    <!-- Results table -->
    <div v-else>
      <UTable
        :rows="results"
        :columns="columns"
      >
        <template #account_id-data="{ row }">
          <code class="text-xs text-gray-300 bg-gray-800 px-2 py-1 rounded">
            {{ row.account_id }}
          </code>
        </template>

        <template #resource_address-data="{ row }">
          <code class="text-xs text-gray-300 bg-gray-800 px-2 py-1 rounded break-all" :title="row.resource_address">
            {{ formatResourceAddress(row.resource_address) }}
          </code>
        </template>

        <template #action-data="{ row }">
          <UBadge
            :color="getActionColor(row.action)"
            variant="soft"
            size="sm"
          >
            {{ row.action }}
          </UBadge>
        </template>

        <template #applied-data="{ row }">
          <UIcon
            :name="row.applied ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'"
            :class="row.applied ? 'text-green-400' : 'text-red-400'"
            class="w-5 h-5"
          />
        </template>

        <template #timestamp-data="{ row }">
          <div class="text-sm">
            <div class="text-white">{{ formatDate(row.timestamp) }}</div>
            <div class="text-gray-400 text-xs">{{ formatTime(row.timestamp) }}</div>
          </div>
        </template>
      </UTable>

      <!-- Pagination -->
      <div class="flex justify-between items-center mt-4">
        <div class="text-sm text-gray-400">
          Showing {{ paginationStart }}-{{ paginationEnd }} of {{ totalResults }} results
        </div>
        <UPagination
          v-if="totalResults > pageSize"
          v-model="page"
          :page-count="pageSize"
          :total="totalResults"
        />
      </div>
    </div>

    <!-- Check Other Accounts button (only when scoped to a single account) -->
    <div v-if="props.accountId && hasSearched && results.length > 0" class="border-t border-gray-700 mt-4 pt-4">
      <UButton
        color="primary"
        variant="soft"
        icon="i-heroicons-globe-alt"
        :loading="deploymentLoading"
        @click="checkOtherAccounts"
      >
        Check Other Accounts
      </UButton>

      <!-- Cross-account summary badge -->
      <div v-if="deploymentSummary" class="mt-3">
        <UBadge color="blue" variant="soft" size="lg">
          Found in {{ deploymentSummary.totalAccounts }} accounts, applied in {{ deploymentSummary.appliedAccounts }}, failed in {{ deploymentSummary.failedAccounts }}
        </UBadge>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
interface SearchResult {
  account_id: string
  resource_address: string
  resource_type: string
  action: string
  applied: boolean
  timestamp: string
}

interface DeploymentSummary {
  totalAccounts: number
  appliedAccounts: number
  failedAccounts: number
}

const props = defineProps<{
  accountId?: string
}>()

// Search and filter state
const searchInput = ref('')
const searchQuery = ref('')
const actionFilter = ref('all')
const appliedFilter = ref('all')
const page = ref(1)
const pageSize = 25
const days = 30

// Data state
const loading = ref(false)
const hasSearched = ref(false)
const results = ref<SearchResult[]>([])
const totalResults = ref(0)

// Deployment status state (cross-account)
const deploymentLoading = ref(false)
const deploymentSummary = ref<DeploymentSummary | null>(null)

// Filter options
const actionOptions = [
  { label: 'All', value: 'all' },
  { label: 'Create', value: 'create' },
  { label: 'Update', value: 'update' },
  { label: 'Destroy', value: 'destroy' },
  { label: 'Replace', value: 'replace' }
]

const appliedOptions = [
  { label: 'All', value: 'all' },
  { label: 'Applied', value: 'applied' },
  { label: 'Not Applied', value: 'not_applied' }
]

// Table columns
const columns = [
  { key: 'account_id', label: 'Account ID' },
  { key: 'resource_address', label: 'Resource Address' },
  { key: 'resource_type', label: 'Resource Type' },
  { key: 'action', label: 'Action', sortable: true },
  { key: 'applied', label: 'Applied' },
  { key: 'timestamp', label: 'Timestamp', sortable: true }
]

// Pagination helpers
const paginationStart = computed(() => {
  if (totalResults.value === 0) return 0
  return (page.value - 1) * pageSize + 1
})

const paginationEnd = computed(() => {
  return Math.min(page.value * pageSize, totalResults.value)
})

// Debounce search input: update searchQuery 300ms after the user stops typing
let debounceTimer: ReturnType<typeof setTimeout> | null = null

watch(searchInput, (value) => {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    searchQuery.value = value
  }, 300)
})

// Fetch results when search query, filters, or page changes
watch([searchQuery, actionFilter, appliedFilter], () => {
  page.value = 1
  deploymentSummary.value = null
  fetchResults()
})

watch(page, () => {
  fetchResults()
})

async function fetchResults() {
  if (!searchQuery.value.trim()) {
    results.value = []
    totalResults.value = 0
    hasSearched.value = false
    return
  }

  loading.value = true
  hasSearched.value = true

  try {
    const params = new URLSearchParams({
      q: searchQuery.value,
      days: String(days),
      page: String(page.value),
      limit: String(pageSize)
    })

    if (props.accountId) {
      params.set('account_id', props.accountId)
    }
    if (actionFilter.value !== 'all') {
      params.set('action', actionFilter.value)
    }
    if (appliedFilter.value !== 'all') {
      params.set('applied', appliedFilter.value)
    }

    const data = await $fetch<any>(`/api/pipelines/resource-search?${params.toString()}`)
    results.value = data.data || []
    totalResults.value = data.pagination?.total || 0
  } catch (err: any) {
    console.error('Error searching resources:', err)
    results.value = []
    totalResults.value = 0
  } finally {
    loading.value = false
  }
}

// Cross-account deployment status check — reuses the search API with the same query but no account filter
async function checkOtherAccounts() {
  if (!searchQuery.value.trim()) return

  deploymentLoading.value = true

  try {
    const params = new URLSearchParams({
      q: searchQuery.value,
      days: String(days),
      page: '1',
      limit: '2000'
    })

    const data = await $fetch<any>(`/api/pipelines/resource-search?${params.toString()}`)
    const allResults = data.data || []

    // Group by account_id to compute cross-account summary
    const accountMap = new Map<string, { applied: boolean, failed: boolean }>()
    for (const r of allResults) {
      const existing = accountMap.get(r.account_id)
      if (!existing) {
        accountMap.set(r.account_id, { applied: r.applied === true, failed: r.applied === false })
      } else {
        if (r.applied === true) existing.applied = true
        if (r.applied === false) existing.failed = true
      }
    }

    deploymentSummary.value = {
      totalAccounts: accountMap.size,
      appliedAccounts: Array.from(accountMap.values()).filter(a => a.applied).length,
      failedAccounts: Array.from(accountMap.values()).filter(a => a.failed && !a.applied).length
    }
  } catch (err: any) {
    console.error('Error fetching deployment status:', err)
    deploymentSummary.value = null
  } finally {
    deploymentLoading.value = false
  }
}

// Strip SHA digests and long hashes from Terraform resource addresses for readability
function formatResourceAddress(address: string): string {
  if (!address) return '-'
  return address.replace(/sha256:[a-f0-9]{64}/gi, 'sha256:...')
    .replace(/[a-f0-9]{64}/gi, (match) => match.substring(0, 8) + '...')
}

// Helpers
function getActionColor(action: string): string {
  if (action === 'create') return 'green'
  if (action === 'update') return 'blue'
  if (action === 'destroy') return 'red'
  if (action === 'replace') return 'yellow'
  return 'gray'
}

function formatDate(timestamp: string): string {
  if (!timestamp) return 'N/A'
  const date = new Date(timestamp)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

function formatTime(timestamp: string): string {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit'
  })
}
</script>
