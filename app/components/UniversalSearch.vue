<template>
  <div ref="container" class="relative w-80">
    <!-- Search input -->
    <div class="flex items-center gap-1">
      <UInput
        v-model="query"
        placeholder="Search users or accounts..."
        icon="i-heroicons-magnifying-glass"
        class="flex-1"
        data-search-input
        autocomplete="off"
        @input="onSearch"
        @focus="onFocus"
        @keydown.esc="showResults = false"
        @keydown.enter.prevent="selectFirstResult"
      />
      <UTooltip text="Learn how to use Universal Search">
        <NuxtLink to="/support/docs?topic=universal-search" class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300">
          <UIcon name="i-heroicons-question-mark-circle" class="w-4 h-4" />
        </NuxtLink>
      </UTooltip>
    </div>

    <!-- Results dropdown -->
    <div
      v-if="showResults && (results.length || loading || searched)"
      class="absolute z-50 mt-1 w-full rounded-lg shadow-lg p-2 max-h-[25rem] overflow-y-auto border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
    >
      <!-- Loading indicator -->
      <div v-if="loading" class="px-2 py-2 text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
        <UIcon name="i-heroicons-arrow-path" class="animate-spin w-4 h-4" />
        Searching...
      </div>

      <!-- No results -->
      <div v-else-if="!results.length" class="px-2 py-2 text-sm text-gray-500 dark:text-gray-400">
        No users or accounts match "{{ searchedQuery }}"
      </div>

      <!-- Results -->
      <template v-else>
        <div
          v-for="result in results"
          :key="result.key"
          class="px-2 py-2 text-sm text-gray-900 dark:text-white cursor-pointer rounded border-b border-gray-200 dark:border-gray-800 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
          @click="selectResult(result)"
        >
          <div class="flex gap-2 items-center">
            <UIcon v-if="result.type === 'user'" name="i-heroicons-user" class="text-blue-500 w-5 h-5"/>
            <UIcon v-if="result.type === 'account'" name="i-heroicons-cloud" class="text-orange-500 w-5 h-5"/>
            <div>
              <div class="font-medium">{{ result.label }}</div>
              <div class="text-xs text-gray-500 dark:text-gray-400">{{ result.subLabel }}</div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>


<script setup lang="ts">
import { onClickOutside } from '@vueuse/core'

const logger = createLogger('UniversalSearch')

const { user } = useOidcAuth()
const { searchUsers } = useGraphApi()
const enclaveStore = useEnclaveStore()
const router = useRouter()

const loading = ref(false)
const query = ref('')
const results = ref<any[]>([])
const showResults = ref(false)
// True once a search has finished for the current query, so an empty result set shows a message
const searched = ref(false)
const searchedQuery = ref('')
let debounceTimer: any
const debounceTimeMs = 500
// Incremented per search so a slow Graph response cannot overwrite results for a newer query
let searchSeq = 0

// Watch the whole component, not just the dropdown: clicking back into the input must not count as "outside",
// otherwise the click that refocuses the input immediately hides the results onFocus just restored
const container = ref<HTMLElement | null>(null)
onClickOutside(container, () => {
  showResults.value = false
})

// Restore results when focusing back into search
const onFocus = () => {
  if (query.value.trim() && (results.value.length || searched.value)) {
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
      key: `account-${e.accountId || e.awsStandardAccountID}`,
      type: 'account',
      label: e.projectName || e.awsStandardAccountID,
      subLabel: `Comm: ${e.awsStandardAccountID} | Gov: ${e.awsGovCloudAccountID || "None"}`,
      urlKey: e.awsStandardAccountID
    }))
}

const onSearch = () => {
  clearTimeout(debounceTimer)

  searched.value = false

  debounceTimer = setTimeout(async () => {
    const seq = ++searchSeq
    const term = query.value.trim()
    if (!term) {
      results.value = []
      showResults.value = false
      loading.value = false
      return
    }

    loading.value = true
    showResults.value = true

    const merged_results: any[] = []

    // 1. Accounts (local enclaves) - prioritized first
    merged_results.push(...searchAccounts())

    // 2. Users (Graph API)
    try {
      const userResults = await searchUsers(user.value?.accessToken || '', term, 5)
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
      logger.warn('User search failed', e)
    }

    // A newer search started while this one waited on Graph; drop these stale results
    if (seq !== searchSeq) return

    results.value = merged_results
    searchedQuery.value = term
    searched.value = true
    loading.value = false
    showResults.value = true
  }, debounceTimeMs)
}

const selectFirstResult = () => {
  const first = results.value[0]
  // Only act on results for what is currently typed, not ones from before the last keystroke
  if (first && searched.value && !loading.value) selectResult(first)
}

const selectResult = (result: any) => {
  logger.info('Selected:', result)
  clearTimeout(debounceTimer)
  showResults.value = false
  query.value = ""
  results.value = []
  searched.value = false

  if (result.type === "account") {
    router.push(`/account/${result.urlKey}`) 
  } else if (result.type === "user") {
    router.push(`/account/user/${convertToUsernameSlug(result.urlKey)}`) 
  }
}
</script>

