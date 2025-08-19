<template>
  <UContainer class="py-8">
    <div class="space-y-6">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-3xl font-bold text-highlighted">AWS Accounts</h1>
          <p class="text-muted mt-1">Manage and monitor your AWS account portfolio</p>
        </div>
        
        <div class="flex gap-2">
          <UButton
            icon="i-heroicons-arrow-path"
            :loading="loading"
            @click="syncAccountData()"
          >
            Sync Data
          </UButton>
          
          <UButton
            icon="i-heroicons-plus"
            color="primary"
          >
            Add Account
          </UButton>
        </div>
      </div>

      <!-- Stats -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricDisplay
          label="Total Accounts"
          :value="accountStats.total"
        />
        <MetricDisplay
          label="Active Accounts"
          :value="accountStats.active"
          :trend="accountStats.active > 0 ? 5.2 : 0"
        />
        <MetricDisplay
          label="GovCloud Paired"
          :value="accountStats.govCloudPaired"
        />
        <MetricDisplay
          label="Environments"
          :value="accountStats.environments.length"
        />
      </div>

      <!-- Filters -->
      <UCard>
        <template #header>
          <h2 class="text-lg font-semibold">Filters</h2>
        </template>
        
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          <USelect
            v-model="filters.status"
            placeholder="All Statuses"
            :options="[
              { label: 'All Statuses', value: '' },
              { label: 'Active', value: 'ACTIVE' },
              { label: 'Suspended', value: 'SUSPENDED' },
              { label: 'Closed', value: 'CLOSED' }
            ]"
          />
          
          <USelect
            v-model="filters.environment"
            placeholder="All Environments"
            :options="[
              { label: 'All Environments', value: '' },
              ...accountStats.environments.map(env => ({
                label: env.charAt(0).toUpperCase() + env.slice(1),
                value: env
              }))
            ]"
          />
          
          <USelect
            v-model="filters.hasGovCloud"
            placeholder="GovCloud Status"
            :options="[
              { label: 'All Accounts', value: undefined },
              { label: 'GovCloud Paired', value: true },
              { label: 'Commercial Only', value: false }
            ]"
          />
          
          <UInput
            v-model="filters.projectCode"
            placeholder="Project Code"
            icon="i-heroicons-magnifying-glass"
          />
        </div>
      </UCard>

      <!-- Error State -->
      <UAlert
        v-if="error"
        color="error"
        variant="soft"
        :title="error"
        :close-button="{ icon: 'i-heroicons-x-mark-20-solid', color: 'gray', variant: 'link', padded: false }"
        @close="error = null"
      />

      <!-- Loading State -->
      <div v-if="loading && accounts.length === 0" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div v-for="i in 6" :key="i" class="animate-pulse">
          <div class="bg-neutral-200 dark:bg-neutral-700 rounded-lg h-64"></div>
        </div>
      </div>

      <!-- Accounts Grid -->
      <div v-else-if="filteredAccounts.length > 0" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <AccountCard
          v-for="account in filteredAccounts"
          :key="account.accountId"
          :account="account"
          @view-details="viewAccountDetails"
          @edit-account="editAccount"
          @delete-account="deleteAccount"
        />
      </div>

      <!-- Empty State -->
      <UCard v-else-if="!loading">
        <div class="text-center py-12">
          <div class="text-6xl mb-4">🏛️</div>
          <h3 class="text-lg font-semibold text-highlighted mb-2">No accounts found</h3>
          <p class="text-muted mb-4">
            {{ accounts.length === 0 ? 'Get started by adding your first AWS account.' : 'Try adjusting your filters.' }}
          </p>
          <UButton
            v-if="accounts.length === 0"
            icon="i-heroicons-plus"
            color="primary"
          >
            Add Account
          </UButton>
        </div>
      </UCard>

      <!-- Organizational Units Breakdown -->
      <UCard v-if="Object.keys(accountsByOU).length > 1">
        <template #header>
          <h2 class="text-lg font-semibold">By Organizational Unit</h2>
        </template>
        
        <div class="space-y-4">
          <div v-for="(ouAccounts, ou) in accountsByOU" :key="ou">
            <div class="flex items-center justify-between mb-2">
              <h3 class="font-medium text-highlighted">{{ ou }}</h3>
              <UBadge color="neutral" variant="soft">
                {{ ouAccounts.length }} accounts
              </UBadge>
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              <div
                v-for="account in ouAccounts.slice(0, 6)"
                :key="account.accountId"
                class="p-3 bg-neutral-50 dark:bg-neutral-800 rounded flex items-center justify-between"
              >
                <div>
                  <div class="text-sm font-medium">{{ account.accountName }}</div>
                  <div class="text-xs text-muted">{{ account.accountId }}</div>
                </div>
                <UBadge
                  :color="account.accountStatus === 'ACTIVE' ? 'success' : 'warning'"
                  size="sm"
                >
                  {{ account.accountStatus }}
                </UBadge>
              </div>
            </div>
            
            <div v-if="ouAccounts.length > 6" class="text-center mt-2">
              <UButton variant="ghost" size="sm">
                View all {{ ouAccounts.length }} accounts
              </UButton>
            </div>
          </div>
        </div>
      </UCard>
    </div>
  </UContainer>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import type { AccountInfo } from '../../server/types/aws'

// Use the composable
const {
  accounts,
  loading,
  error,
  fetchAccounts,
  syncAccountData,
  accountsByOU,
  accountStats
} = useAccounts()

// Filters
const filters = reactive({
  status: '',
  environment: '',
  hasGovCloud: undefined as boolean | undefined,
  projectCode: ''
})

// Computed filtered accounts
const filteredAccounts = computed(() => {
  return accounts.value.filter(account => {
    if (filters.status && account.accountStatus !== filters.status) return false
    if (filters.environment && account.environment !== filters.environment) return false
    if (filters.hasGovCloud !== undefined && account.hasGovCloud !== filters.hasGovCloud) return false
    if (filters.projectCode && !account.projectCode?.includes(filters.projectCode)) return false
    return true
  })
})

// Event handlers
const viewAccountDetails = (account: AccountInfo) => {
  // Navigate to account detail page
  navigateTo(`/accounts/${account.accountId}`)
}

const editAccount = (account: AccountInfo) => {
  // Open edit modal or navigate to edit page
  console.log('Edit account:', account.accountId)
  // You could use a modal composable here
  // const { open } = useModal()
  // open(AccountEditModal, { account })
}

const deleteAccount = (account: AccountInfo) => {
  // Show confirmation dialog
  console.log('Delete account:', account.accountId)
  // You could use a confirmation dialog here
  // const { confirm } = useDialog()
  // confirm('Are you sure?', 'This action cannot be undone')
}

// Page metadata
definePageMeta({
  title: 'AWS Accounts Demo',
  description: 'Example page showing AccountCard component integration'
})
</script>