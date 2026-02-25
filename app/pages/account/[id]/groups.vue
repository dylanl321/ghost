<script setup lang="ts">
import AccountGroups from '~/components/accounts/AccountGroups.vue'

// Page setup
const route = useRoute()
const accountId = computed(() => route.params.id as string)

// Shared composable for account info
const { enhancedAccountInfo, loading, error, fetchAccountInfo, initialize } = useAccountInfo(accountId)

// Page metadata
definePageMeta({
  keepalive: false,
  title: 'Account Groups',
  description: 'View all Azure AD groups related to this AWS account'
})

// Initialize data
onMounted(() => {
  initialize()
})
</script>

<template>
  <div class="space-y-6 p-6">
    <!-- Enhanced Header -->
    <div class="flex flex-col gap-4">

      <!-- Account Context Card -->
      <UCard v-if="enhancedAccountInfo">
        <div class="flex items-center justify-between p-4">
          <div class="flex items-center gap-4">
            <div class="w-12 h-12 bg-primary-500/20 rounded-lg flex items-center justify-center">
              <UIcon name="i-heroicons-building-office" class="w-6 h-6 text-primary-400" />
            </div>
            <div>
              <h2 class="text-xl font-semibold text-gray-900 dark:text-white">{{ enhancedAccountInfo.displayName }}</h2>
              <div class="flex items-center gap-3 mt-1">
                <p class="text-sm text-gray-600 dark:text-gray-400">
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
              <div class="mt-2 text-xs text-gray-500 dark:text-gray-400 space-y-1">
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
      <UCard v-else-if="loading">
        <div class="flex items-center gap-3 p-4 animate-pulse">
          <div class="w-12 h-12 bg-gray-200 dark:bg-gray-700 rounded-lg" />
          <div>
            <div class="h-5 w-48 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
            <div class="h-3 w-32 bg-gray-200 dark:bg-gray-700 rounded" />
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
