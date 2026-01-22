<template>
  <div class="relative w-80">
    <!-- Search input -->
    <div class="flex items-center gap-1">
      <UInput
        v-model="query"
        placeholder="Search users or accounts..."
        icon="i-heroicons-magnifying-glass"
        class="flex-1"
        @input="onSearch"
        @focus="onFocus"
      />
      <UTooltip text="Learn how to use Universal Search">
        <NuxtLink to="/support/docs?topic=universal-search" class="text-gray-400 hover:text-gray-300">
          <UIcon name="i-heroicons-question-mark-circle" class="w-4 h-4" />
        </NuxtLink>
      </UTooltip>
    </div>

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
      <template v-else>
        <div
          v-for="result in results"
          :key="result.key"
          class="px-2 py-2 text-sm text-white cursor-pointer rounded border-b border-gray-800 hover:bg-gray-800 transition"
          @click="selectResult(result)"
        >
          <div class="flex gap-2 items-center">
            <UIcon v-if="result.type === 'user'" name="i-heroicons-user" class="text-blue-500 w-5 h-5"/>
            <UIcon v-if="result.type === 'account'" name="i-heroicons-cloud" class="text-orange-500 w-5 h-5"/>
            <div>
              <div class="font-medium">{{ result.label }}</div>
              <div class="text-xs text-gray-400">{{ result.subLabel }}</div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>


<script setup lang="ts">
import { onClickOutside } from '@vueuse/core'

const { user } = useOidcAuth()
const { searchUsers } = useGraphApi()
const enclaveStore = useEnclaveStore()
const router = useRouter()

const loading = ref(false)
const query = ref('')
const results = ref<any[]>([])
const showResults = ref(false)
let debounceTimer: any
const debounceTimeMs = 500

const dropdown = ref(null)
onClickOutside(dropdown, () => {
  showResults.value = false
})

// Restore results when focusing back into search
const onFocus = () => {
  if (query.value.trim() && results.value.length) {
    showResults.value = true
  }
}

// Search accounts (local, enclaves)
function searchAccounts() {
  const enclaves = Object.values(enclaveStore.enclaves || {})
  return enclaves
    .filter(e =>
      e.projectName?.toLowerCase().includes(query.value.toLowerCase()) ||
      e.awsGovCloudAccountID?.includes(query.value) ||
      e.awsStandardAccountID?.includes(query.value) ||
      e.requestID?.toString().includes(query.value) ||
      e.awsAccountEmail?.toLowerCase().includes(query.value.toLowerCase())
    )
    .map(e => ({
      key: `account-${e.accountId}`,
      type: 'account',
      label: e.projectName || e.awsStandardAccountID,
      subLabel: `Comm: ${e.awsStandardAccountID} | Gov: ${e.awsGovCloudAccountID || "None"}`,
      urlKey: e.awsStandardAccountID
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

    // 1. Accounts (local enclaves) - prioritized first
    merged_results.push(...searchAccounts())

    // 2. Users (Graph API)
    try {
      const userResults = await searchUsers(user.value?.accessToken || '', query.value, 5)
      merged_results.push(
        ...userResults.map(u => ({
          key: `user-${u.id}`,
          type: 'user',
          label: u.displayName,
          subLabel: u.userPrincipalName,
          urlKey: u.userPrincipalName
        }))
      )
    } catch (e) {
      console.warn('User search failed', e)
    }

    results.value = merged_results
    loading.value = false
    showResults.value = true
  }, debounceTimeMs)
}

const selectResult = (result: any) => {
  console.log('Selected:', result)
  showResults.value = false
  query.value = ""

  if (result.type === "account") {
    router.push(`/account/${result.urlKey}`) 
  } else if (result.type === "user") {
    router.push(`/account/user/${convertToUsernameSlug(result.urlKey)}`) 
  }
}
</script>

