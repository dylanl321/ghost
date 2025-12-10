<template>
  <div class="space-y-3">
    <!-- Quick Selection Buttons -->
    <div class="flex flex-wrap gap-2">
      <UButton
        size="xs"
        :color="isAllSelected ? 'blue' : 'gray'"
        :variant="isAllSelected ? 'solid' : 'soft'"
        @click="selectAll"
      >
        All Accounts ({{ totalAccountCount }})
      </UButton>
      <UButton
        size="xs"
        color="gray"
        variant="soft"
        @click="clearAll"
      >
        Clear All
      </UButton>
      <div class="border-l border-gray-300 dark:border-gray-600 mx-1" />
      <UButton
        size="xs"
        color="gray"
        variant="soft"
        @click="selectCommercial"
      >
        Commercial Only ({{ commercialCount }})
      </UButton>
      <UButton
        size="xs"
        color="gray"
        variant="soft"
        @click="selectGovCloud"
      >
        GovCloud Only ({{ govCloudCount }})
      </UButton>
    </div>

    <!-- Search -->
    <div class="flex items-center gap-2">
      <UInput
        v-model="searchQuery"
        icon="i-heroicons-magnifying-glass"
        placeholder="Search accounts..."
        class="flex-1"
      />
    </div>

    <!-- Account List -->
    <div class="border border-gray-200 dark:border-gray-700 rounded-lg max-h-[400px] overflow-y-auto">
      <!-- Header -->
      <div class="sticky top-0 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-2 flex items-center justify-between text-xs font-medium text-gray-600 dark:text-gray-400">
        <div class="flex items-center gap-2">
          <UCheckbox
            :model-value="isAllSelected"
            :indeterminate="isSomeSelected && !isAllSelected"
            @update:model-value="toggleAll"
          />
          <span>Account Name</span>
        </div>
        <span>Type</span>
      </div>

      <!-- Account Rows -->
      <div class="divide-y divide-gray-200 dark:divide-gray-700">
        <div
          v-for="account in filteredAccounts"
          :key="account.accountId"
          class="px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <label class="flex items-center justify-between cursor-pointer">
            <div class="flex items-center gap-3 flex-1 min-w-0">
              <UCheckbox
                :model-value="isSelected(account.accountId)"
                @update:model-value="toggle(account.accountId)"
              />
              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {{ account.accountName || account.projectName || account.accountId }}
                </div>
                <div class="text-xs text-gray-500 dark:text-gray-400">
                  {{ account.accountId }}
                  <span v-if="account.awsGovCloudAccountID" class="ml-2">
                    GC: {{ account.awsGovCloudAccountID }}
                  </span>
                </div>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <UBadge
                v-if="account.awsGovCloudAccountID"
                color="purple"
                variant="soft"
                size="xs"
              >
                GovCloud
              </UBadge>
              <UBadge
                v-else
                color="blue"
                variant="soft"
                size="xs"
              >
                Commercial
              </UBadge>
            </div>
          </label>
        </div>

        <!-- Empty State -->
        <div v-if="filteredAccounts.length === 0" class="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
          <UIcon name="i-heroicons-magnifying-glass" class="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p class="text-sm">No accounts found</p>
        </div>
      </div>
    </div>

    <!-- Selection Summary -->
    <div class="text-xs text-gray-600 dark:text-gray-400 flex items-center justify-between">
      <span>
        {{ selectedCount }} of {{ filteredAccounts.length }} accounts selected
      </span>
      <span v-if="selectedCount > 0" class="text-blue-600 dark:text-blue-400">
        {{ selectedCommercialCount }} Commercial, {{ selectedGovCloudCount }} GovCloud
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { AWSEnclaveData } from '~/shared/types/accounts'

const selectedAccountIds = defineModel<string[]>({ default: () => [] })

// State
const searchQuery = ref('')
const accounts = ref<AWSEnclaveData[]>([])
const loading = ref(false)

// Computed
const filteredAccounts = computed(() => {
  let filtered = accounts.value

  // Filter out decommissioned accounts and null/undefined entries
  filtered = filtered.filter(a => {
    if (!a) return false
    const enclaveStatus = (a.enclaveStatus || '').toLowerCase()
    const accountStatus = (a.accountStatus || '').toLowerCase()
    return !enclaveStatus.includes('decommission') && !accountStatus.includes('decommission')
  })

  // Search filter
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    filtered = filtered.filter(a =>
      a.accountName?.toLowerCase().includes(query) ||
      a.projectName?.toLowerCase().includes(query) ||
      a.accountId?.includes(query) ||
      a.awsGovCloudAccountID?.includes(query)
    )
  }

  // Sort: Commercial first, then by name
  return filtered.sort((a, b) => {
    // GovCloud accounts go after commercial
    if (a.awsGovCloudAccountID && !b.awsGovCloudAccountID) return 1
    if (!a.awsGovCloudAccountID && b.awsGovCloudAccountID) return -1

    // Then sort by name
    const nameA = a.accountName || a.projectName || a.accountId
    const nameB = b.accountName || b.projectName || b.accountId
    return nameA.localeCompare(nameB)
  })
})

const totalAccountCount = computed(() => accounts.value.length)

const commercialCount = computed(() =>
  accounts.value.filter(a => !a.awsGovCloudAccountID).length
)

const govCloudCount = computed(() =>
  accounts.value.filter(a => a.awsGovCloudAccountID).length
)

const selectedCount = computed(() => selectedAccountIds.value.length)

const selectedCommercialCount = computed(() => {
  return selectedAccountIds.value.filter(id => {
    const account = accounts.value.find(a => a.accountId === id)
    return account && !account.awsGovCloudAccountID
  }).length
})

const selectedGovCloudCount = computed(() => {
  return selectedAccountIds.value.filter(id => {
    const account = accounts.value.find(a => a.accountId === id)
    return account && account.awsGovCloudAccountID
  }).length
})

const isAllSelected = computed(() => {
  return selectedAccountIds.value.length === filteredAccounts.value.length &&
         filteredAccounts.value.length > 0
})

const isSomeSelected = computed(() => {
  return selectedAccountIds.value.length > 0 && !isAllSelected.value
})

// Methods
function isSelected(accountId: string): boolean {
  return selectedAccountIds.value.includes(accountId)
}

function toggle(accountId: string) {
  const index = selectedAccountIds.value.indexOf(accountId)
  if (index > -1) {
    selectedAccountIds.value.splice(index, 1)
  } else {
    selectedAccountIds.value.push(accountId)
  }
}

function toggleAll() {
  if (isAllSelected.value) {
    // Deselect all from filtered list
    const filteredIds = filteredAccounts.value.map(a => a.accountId)
    selectedAccountIds.value = selectedAccountIds.value.filter(id => !filteredIds.includes(id))
  } else {
    // Select all from filtered list
    const filteredIds = filteredAccounts.value.map(a => a.accountId)
    const newIds = filteredIds.filter(id => !selectedAccountIds.value.includes(id))
    selectedAccountIds.value.push(...newIds)
  }
}

function selectAll() {
  selectedAccountIds.value = []
  // Empty array = all accounts in backend
}

function clearAll() {
  selectedAccountIds.value = []
}

function selectCommercial() {
  selectedAccountIds.value = accounts.value
    .filter(a => !a.awsGovCloudAccountID)
    .map(a => a.accountId)
}

function selectGovCloud() {
  selectedAccountIds.value = accounts.value
    .filter(a => a.awsGovCloudAccountID)
    .map(a => a.accountId)
}

function getStatusColor(status: string): string {
  const s = status?.toUpperCase() || ''
  if (s === 'ACTIVE' || s === 'PROVISIONED') return 'green'
  if (s === 'SUSPENDED' || s === 'DELETED') return 'red'
  if (s === 'PENDING') return 'yellow'
  return 'gray'
}

// Load accounts on mount
onMounted(async () => {
  loading.value = true
  try {
    console.log('[DatasetAccountSelector] Fetching accounts...')
    const response = await $fetch<{ success: boolean; data: AWSEnclaveData[] }>('/api/accounts/list')
    console.log('[DatasetAccountSelector] Response:', response)
    console.log('[DatasetAccountSelector] Accounts count:', response.data?.length)
    accounts.value = response.data || []
    console.log('[DatasetAccountSelector] Loaded accounts:', accounts.value.length)

    // Debug: Show sample account statuses
    if (accounts.value.length > 0) {
      const sampleAccounts = accounts.value.slice(0, 5)
      console.log('[DatasetAccountSelector] Sample accounts:', sampleAccounts.map(a => ({
        id: a.accountId,
        name: a.accountName,
        enclaveStatus: a.enclaveStatus,
        accountStatus: a.accountStatus
      })))
    }
  } catch (error) {
    console.error('[DatasetAccountSelector] Failed to load accounts:', error)
    // TODO: Show error toast
  } finally {
    loading.value = false
  }
})

// Debug computed values
watch(filteredAccounts, (newVal) => {
  console.log('[DatasetAccountSelector] Filtered accounts:', newVal.length)
}, { immediate: true })
</script>
