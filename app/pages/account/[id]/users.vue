<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import AccountUsers from '~/components/accounts/AccountUsers.vue'
import type { GraphUser } from '~/composables/useGroupMembers'

// Page setup
const route = useRoute()
const accountId = computed(() => route.params.id as string)

// Composables
const awsAccountsStore = useAwsAccountsStore()
const groupMembers = useGroupMembers()
const { user } = useOidcAuth()
const enclaveStore = useEnclaveStore()

// Account info state
const accountInfo = ref<any>(null)
const loading = ref(false)
const error = ref<string | null>(null)

// Users state
const users = ref<GraphUser[]>([])
const usersLoading = ref(true)

// Get account info from store or fetch from API
const fetchAccountInfo = async () => {
  if (!accountId.value) return

  loading.value = true
  error.value = null

  try {
    // First try to get from store
    const storeAccount = awsAccountsStore.accounts[accountId.value]
    
    if (storeAccount) {
      accountInfo.value = {
        id: accountId.value,
        name: storeAccount.accountName || `Account ${accountId.value}`,
        isGovCloud: storeAccount.isGovCloud || false,
        standardAccountId: storeAccount.standardAccountId || accountId.value,
        govCloudAccountId: storeAccount.govCloudAccountId,
        status: storeAccount.accountStatus || 'Unknown'
      }
    } else {
      // Fallback to API
      const response = await fetch(`/api/get-account-info-complete?accountId=${accountId.value}`)
      if (!response.ok) {
        throw new Error(`Failed to fetch account info: ${response.statusText}`)
      }
      
      const data = await response.json()
      accountInfo.value = {
        id: accountId.value,
        name: data.dynamo_accountName || data.org_Name || `Account ${accountId.value}`,
        isGovCloud: data.dynamo_awsGovCloudAccountID === accountId.value,
        standardAccountId: data.dynamo_awsStandardAccountID || accountId.value,
        govCloudAccountId: data.dynamo_awsGovCloudAccountID,
        status: data.org_Status || 'Unknown'
      }
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to fetch account information'
    console.error('Error fetching account info:', err)
    
    // Fallback account info
    accountInfo.value = {
      id: accountId.value,
      name: `Account ${accountId.value}`,
      isGovCloud: false,
      standardAccountId: accountId.value,
      govCloudAccountId: undefined,
      status: 'Unknown'
    }
  } finally {
    loading.value = false
  }
}

// Enhanced account info computed
const enhancedAccountInfo = computed(() => {
  if (!accountInfo.value) return null
  
  return {
    ...accountInfo.value,
    // Provide display names for both account types
    displayName: accountInfo.value.name,
    accountTypeLabel: accountInfo.value.isGovCloud ? 'GovCloud' : 'Commercial',
    // Show which account IDs are available
    hasMultipleAccountIds: accountInfo.value.standardAccountId && 
                           accountInfo.value.govCloudAccountId && 
                           accountInfo.value.standardAccountId !== accountInfo.value.govCloudAccountId
  }
})

// Page metadata
definePageMeta({
  title: 'Account Users',
  description: 'View all users with access to this AWS account'
})

// Breadcrumb items
const breadcrumbItems = computed(() => [
  { label: 'Accounts', to: '/account/explorer' },
  { 
    label: enhancedAccountInfo.value?.displayName || `Account ${accountId.value}`, 
    to: `/account/${accountId.value}` 
  },
  { label: 'Users', current: true, icon: 'i-heroicons-users' }
])

// Fetch users for the account
const fetchUsers = async () => {
  if (!accountId.value) return
  
  usersLoading.value = true
  try {
    const govCloudId = enclaveStore.enclaves[accountId.value]?.awsGovCloudAccountID || enhancedAccountInfo.value?.govCloudAccountId
    users.value = await groupMembers.fetchEnclaveUsers(
      accountId.value, 
      govCloudId || '', 
      user.value?.accessToken || ''
    )
  } catch (err) {
    console.error('Error fetching users:', err)
    users.value = []
  } finally {
    usersLoading.value = false
  }
}

// Initialize data
onMounted(async () => {
  await awsAccountsStore.initialize()
  await enclaveStore.initialize()
  await fetchAccountInfo()
  await fetchUsers()
})
</script>

<template>
  <div class="space-y-6">
    <!-- Enhanced Header with Two-Column Layout -->
    <div class="space-y-4">
      <Breadcrumb :items="breadcrumbItems" />
      
      <!-- Compact Account Header Card -->
      <UCard v-if="enhancedAccountInfo" class="bg-gray-900 border border-gray-800">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6">
          <!-- Left Column: Account Info -->
          <div class="flex items-center gap-4">
            <div class="w-12 h-12 bg-primary-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
              <UIcon name="i-heroicons-building-office" class="w-6 h-6 text-primary-400" />
            </div>
            <div class="flex-1 min-w-0">
              <h2 class="text-xl font-semibold text-white truncate">{{ enhancedAccountInfo.displayName }}</h2>
              <div class="flex items-center gap-3 mt-1 flex-wrap">
                <p class="text-sm text-gray-400">
                  <span class="font-medium">Type:</span> {{ enhancedAccountInfo.accountTypeLabel }}
                </p>
                <UBadge 
                  :color="enhancedAccountInfo.status === 'ACTIVE' ? 'green' : 'yellow'" 
                  variant="soft" 
                  size="sm"
                >
                  {{ enhancedAccountInfo.status }}
                </UBadge>
                <UBadge 
                  v-if="enhancedAccountInfo.hasMultipleAccountIds" 
                  color="blue" 
                  variant="soft" 
                  size="sm"
                  title="This account has both Commercial and GovCloud account IDs"
                >
                  Multi-Environment
                </UBadge>
              </div>
              <!-- Compact Account ID Details -->
              <div class="mt-2 text-xs text-gray-500">
                <span v-if="enhancedAccountInfo.standardAccountId" class="font-mono mr-4">
                  Com: {{ enhancedAccountInfo.standardAccountId }}
                </span>
                <span v-if="enhancedAccountInfo.govCloudAccountId && enhancedAccountInfo.govCloudAccountId !== enhancedAccountInfo.standardAccountId" class="font-mono">
                  Gov: {{ enhancedAccountInfo.govCloudAccountId }}
                </span>
              </div>
            </div>
          </div>
          
          <!-- Right Column: Navigation Actions -->
          <div class="flex items-center justify-end gap-3">
            <UButton 
              :to="`/account/${accountId}`"
              icon="i-heroicons-arrow-left" 
              variant="outline" 
              size="sm"
            >
              Back to Account
            </UButton>
            <UButton 
              :to="`/account/${accountId}/groups`"
              icon="i-heroicons-user-group" 
              variant="outline" 
              size="sm"
            >
              View Groups
            </UButton>
            <UButton 
              icon="i-heroicons-users" 
              color="primary"
              variant="soft" 
              size="sm"
              disabled
            >
              Users
            </UButton>
          </div>
        </div>
      </UCard>
      
      <!-- Loading State -->
      <UCard v-else-if="loading" class="bg-gray-900 border border-gray-800">
        <div class="flex items-center gap-3 p-6 animate-pulse">
          <div class="w-12 h-12 bg-gray-700 rounded-lg flex-shrink-0"></div>
          <div class="flex-1">
            <div class="h-5 w-48 bg-gray-700 rounded mb-2"></div>
            <div class="h-3 w-32 bg-gray-700 rounded"></div>
          </div>
        </div>
      </UCard>
      
      <!-- Error State -->
      <UAlert v-else-if="error" 
        color="red" 
        icon="i-heroicons-exclamation-triangle"
        :title="error"
        description="There was an issue loading the account information."
      >
        <template #actions>
          <UButton @click="fetchAccountInfo" variant="ghost" size="xs">
            Retry
          </UButton>
        </template>
      </UAlert>
    </div>

    <!-- Users Component with enhanced account info -->
    <AccountUsers 
      v-if="enhancedAccountInfo" 
      :users="users"
      :account-id="accountId" 
      :loading="usersLoading"
    />
  </div>
</template> 