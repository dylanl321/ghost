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
      v-if="(results.length || loading) && showResults"
      ref="dropdown"
      class="absolute z-10 mt-1 w-full rounded-lg shadow-lg p-2 max-h-[25rem] overflow-y-auto border border-gray-800 bg-[#0e1625]"
    >
      <!-- Loading indicator -->
      <div v-if="loading" class="px-2 py-2 text-sm text-gray-400 flex items-center gap-2">
        <UIcon name="i-heroicons-arrow-path" class="animate-spin w-4 h-4" />
        Searching...
      </div>

      <!-- Results -->
      <div
        v-for="item in results"
        v-else
        :key="item.key"
        class="px-2 py-2 text-sm text-white cursor-pointer rounded border-b border-gray-800"
        @click="selectResult(item)"
      >
        <div class="flex gap-2 items-center">
          <!-- <UserAvatar v-if="item.type === 'user'" size="sm" :user-principal-name="item.subLabel" :display-name="item.label" /> -->
          <UIcon v-if="item.type === 'user'" name="i-heroicons-user" class="text-blue-500 w-5 h-5"/>
          <div>
            <div class="font-medium">{{ item.label }}</div>
            <div class="text-xs text-gray-400">{{ item.subLabel }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>


<script setup lang="ts">
import { onClickOutside } from '@vueuse/core'

const { user } = useOidcAuth()
const { searchUsers } = useGraphApi()
const enclaveStore = useEnclaveStore()

const loading = ref(false)
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

    loading.value = true
    showResults.value = true

    const merged_results: any[] = []

    // 1. Users (Graph API)
    try {
      const userResults = await searchUsers(user.value?.accessToken || '', query.value, 5)
      merged_results.push(
        ...userResults.map(u => ({
          key: `user-${u.id}`,
          type: 'user',
          label: u.displayName,
          subLabel: u.userPrincipalName || u.mail
        }))
      )
    } catch (e) {
      console.warn('User search failed', e)
    }

    // 2. Accounts (local enclaves)
    merged_results.push(...searchAccounts())

    results.value = merged_results
    loading.value = false
    showResults.value = true
  }, 300)
}

const selectResult = (item: any) => {
  console.log('Selected:', item)
  showResults.value = false
}
</script>
