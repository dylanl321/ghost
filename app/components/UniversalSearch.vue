<template>
  <div class="relative w-80">
    <!-- Search input -->
    <UInput
      v-model="query"
      placeholder="Search users or accounts..."
      icon="i-heroicons-magnifying-glass"
      @input="onSearch"
    />

    <!-- Results dropdown -->
    <div
      v-if="results.length && showResults"
      ref="dropdown"
      class="absolute z-10 mt-1 w-full bg-gray-800 rounded-lg shadow-lg p-2 max-h-80 overflow-y-auto"
    >
      <div v-for="item in results" :key="item.key"
        class="px-2 py-1 text-sm text-white hover:bg-gray-700 cursor-pointer rounded"
        @click="selectResult(item)"
      >
        <div class="font-medium">{{ item.label }}</div>
        <div class="text-xs text-gray-400">{{ item.subLabel }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onClickOutside } from '@vueuse/core'
// import { searchUsers } from '~/utils/searchUsers'

const { user } = useOidcAuth()
const { searchUsers } = useGraphApi()
const enclaveStore = useEnclaveStore()

const query = ref('')
const results = ref<any[]>([])
const showResults = ref(false)
let debounceTimer: any

const dropdown = ref(null)
onClickOutside(dropdown, () => {
  showResults.value = false
})

// Search accounts (local, enclaves)
function searchAccounts() {
  const enclaves = Object.values(enclaveStore.enclaves || {})
  return enclaves
    .filter(e =>
      e.accountName?.toLowerCase().includes(query.value.toLowerCase()) ||
      e.awsGovCloudAccountID?.includes(query.value) ||
      e.awsStandardAccountID?.includes(query.value) ||
      e.requestID?.toString().includes(query.value)
    )
    .map(e => ({
      key: `account-${e.accountId}`,
      type: 'account',
      label: e.accountName || e.accountId,
      subLabel: `Comm: ${e.awsStandardAccountID} | Gov: ${e.awsGovCloudAccountID}`
    }))
}

const onSearch = () => {
  clearTimeout(debounceTimer)

  debounceTimer = setTimeout(async () => {
    if (!query.value.trim()) {
      results.value = []
      showResults.value = false
      return
    }

    const merged_results: any[] = []

    // 1. Users (Graph API)
    try {
      const userResults = await searchUsers(user.value?.accessToken || '', query.value, 5)
      merged_results.push(
        ...userResults.map(u => ({
          key: `user-${u.id}`,
          type: 'user',
          label: u.displayName,
          subLabel: u.mail || u.userPrincipalName
        }))
      )
    } catch (e) {
      console.warn('User search failed', e)
    }

    // 2. Accounts (local enclaves)
    merged_results.push(...searchAccounts())

    results.value = merged_results
    showResults.value = merged_results.length > 0
  }, 300)
}

const selectResult = (item: any) => {
  console.log('Selected:', item)
  showResults.value = false
}
</script>
