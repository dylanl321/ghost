<script setup lang="ts">
import AccountGroups from '~/components/accounts/AccountGroups.vue'

// Page setup
const route = useRoute()
const accountId = computed(() => route.params.id as string)

// Composables
const awsAccountsStore = useAwsAccountsStore()

// Account info state
const accountInfo = ref<any>(null)
const loading = ref(false)
const error = ref<string | null>(null)

// Get account info from store or fetch from API
const fetchAccountInfo = async () => {
  if (!accountId.value) return

  loading.value = true
  error.value = null

  try {
    // First try to get from user accounts store
    const storeAccount = awsAccountsStore.accounts[accountId.value]

    if (storeAccount) {
      console.log('✅ Found account in user store:', storeAccount)
      accountInfo.value = {
        id: accountId.value,
        name: storeAccount.accountName || `Account ${accountId.value}`,
        isGovCloud: storeAccount.isGovCloud || false,
        standardAccountId: storeAccount.standardAccountId || accountId.value,
        govCloudAccountId: storeAccount.govCloudAccountId,
        status: storeAccount.accountStatus || 'Unknown'
      }
    } else {
      // Try to find in all system accounts
      await awsAccountsStore.initializeAllAccounts()
      const systemAccount = awsAccountsStore.findAccountById(accountId.value)

      if (systemAccount) {
        console.log('✅ Found account in system accounts:', systemAccount)
        accountInfo.value = {
          id: accountId.value,
          name: systemAccount.accountName || `Account ${accountId.value}`,
          isGovCloud: systemAccount.isGovCloud || false,
          standardAccountId: systemAccount.standardAccountId || accountId.value,
          govCloudAccountId: systemAccount.govCloudAccountId,
          status: systemAccount.accountStatus || 'Unknown'
        }
      } else {
        // Fallback to API
        console.log('🔍 Fetching account info from API...')
        const response = await fetch(`/api/get-account-info-complete?accountId=${accountId.value}`)
        if (!response.ok) {
          throw new Error(`Failed to fetch account info: ${response.statusText}`)
        }

        const data = await response.json()
        console.log('✅ Account data from API:', data)
        accountInfo.value = {
          id: accountId.value,
          name: data.dynamo_accountName || data.org_Name || `Account ${accountId.value}`,
          isGovCloud: data.dynamo_awsGovCloudAccountID === accountId.value,
          standardAccountId: data.dynamo_awsStandardAccountID || accountId.value,
          govCloudAccountId: data.dynamo_awsGovCloudAccountID,
          status: data.org_Status || 'Unknown'
        }
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
  title: 'Account Groups',
  description: 'View all Azure AD groups related to this AWS account'
})

// Initialize data
onMounted(async () => {
  await awsAccountsStore.initialize()
  await fetchAccountInfo()
})
</script>

<template>
  <div class="space-y-6 p-6">
    <!-- Enhanced Header -->
    <div class="flex flex-col gap-4">

      <!-- Account Context Card -->
      <UCard v-if="enhancedAccountInfo" class="bg-gray-900 border border-gray-800">
        <div class="flex items-center justify-between p-4">
          <div class="flex items-center gap-4">
            <div class="w-12 h-12 bg-primary-500/20 rounded-lg flex items-center justify-center">
              <UIcon name="i-heroicons-building-office" class="w-6 h-6 text-primary-400" />
            </div>
            <div>
              <h2 class="text-xl font-semibold text-white">{{ enhancedAccountInfo.displayName }}</h2>
              <div class="flex items-center gap-3 mt-1">
                <p class="text-sm text-gray-400">
                  <span class="font-medium">Account Type:</span> {{ enhancedAccountInfo.accountTypeLabel }}
                </p>
                <UBadge :color="enhancedAccountInfo.status === 'ACTIVE' ? 'green' : 'yellow'" variant="soft" size="sm">
                  {{ enhancedAccountInfo.status }}
                </UBadge>
                <UBadge v-if="enhancedAccountInfo.hasMultipleAccountIds" color="blue" variant="soft" size="sm"
                  title="This account has both Commercial and GovCloud account IDs">
                  Multi-Environment
                </UBadge>
              </div>
              <!-- Account ID Details -->
              <div class="mt-2 text-xs text-gray-500 space-y-1">
                <div v-if="enhancedAccountInfo.standardAccountId">
                  <span class="font-mono">Commercial: {{ enhancedAccountInfo.standardAccountId }}</span>
                </div>
                <div
                  v-if="enhancedAccountInfo.govCloudAccountId && enhancedAccountInfo.govCloudAccountId !== enhancedAccountInfo.standardAccountId">
                  <span class="font-mono">GovCloud: {{ enhancedAccountInfo.govCloudAccountId }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Navigation Actions -->
          <div class="flex items-center gap-2">
            <UButton :to="`/account/${accountId}`" icon="i-heroicons-arrow-left" variant="outline" size="sm">
              Back to Account
            </UButton>
            <UButton :to="`/account/${accountId}/users`" icon="i-heroicons-users" variant="outline" size="sm">
              View Users
            </UButton>
          </div>
        </div>
      </UCard>

      <!-- Loading State -->
      <UCard v-else-if="loading" class="bg-gray-900 border border-gray-800">
        <div class="flex items-center gap-3 p-4 animate-pulse">
          <div class="w-12 h-12 bg-gray-700 rounded-lg" />
          <div>
            <div class="h-5 w-48 bg-gray-700 rounded mb-2" />
            <div class="h-3 w-32 bg-gray-700 rounded" />
          </div>
        </div>
      </UCard>

      <!-- Error State -->
      <UAlert v-else-if="error" color="red" icon="i-heroicons-exclamation-triangle" :title="error"
        description="There was an issue loading the account information.">
        <template #actions>
          <UButton variant="ghost" size="xs" @click="fetchAccountInfo">
            Retry
          </UButton>
        </template>
      </UAlert>
    </div>

    <!-- Groups Component with enhanced account info -->
    <AccountGroups v-if="enhancedAccountInfo" :account-id="enhancedAccountInfo.id"
      :account-name="enhancedAccountInfo.displayName" :standard-account-id="enhancedAccountInfo.standardAccountId"
      :gov-cloud-account-id="enhancedAccountInfo.govCloudAccountId" />
  </div>
</template>