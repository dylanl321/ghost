<template>
  <Story
    title="Account Card"
    group="dashboard"
    :layout="{ type: 'grid', width: '400px' }"
  >
    <!-- Active Account -->
    <Variant title="Active Account">
      <AccountCard 
        :account="activeAccount"
        @view-details="onViewDetails"
        @edit-account="onEditAccount"
        @delete-account="onDeleteAccount"
      />
    </Variant>

    <!-- GovCloud Account -->
    <Variant title="GovCloud Account">
      <AccountCard 
        :account="govCloudAccount"
        @view-details="onViewDetails"
        @edit-account="onEditAccount"
        @delete-account="onDeleteAccount"
      />
    </Variant>

    <!-- Suspended Account -->
    <Variant title="Suspended Account">
      <AccountCard 
        :account="suspendedAccount"
        @view-details="onViewDetails"
        @edit-account="onEditAccount"
        @delete-account="onDeleteAccount"
      />
    </Variant>

    <!-- Minimal Data -->
    <Variant title="Minimal Data">
      <AccountCard 
        :account="minimalAccount"
        @view-details="onViewDetails"
        @edit-account="onEditAccount"
        @delete-account="onDeleteAccount"
      />
    </Variant>

    <!-- No Actions -->
    <Variant title="No Actions">
      <AccountCard 
        :account="activeAccount"
        :show-actions="false"
        @view-details="onViewDetails"
        @edit-account="onEditAccount"
        @delete-account="onDeleteAccount"
      />
    </Variant>

    <!-- No Footer -->
    <Variant title="No Footer">
      <AccountCard 
        :account="activeAccount"
        :show-footer="false"
        @view-details="onViewDetails"
        @edit-account="onEditAccount"
        @delete-account="onDeleteAccount"
      />
    </Variant>

    <!-- Live API Example -->
    <Variant title="Live API Data">
      <div v-if="isLoading" class="p-8 text-center">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500 mx-auto"></div>
        <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">Loading account data...</p>
      </div>
      
      <div v-else-if="apiError" class="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded">
        <p class="text-red-600 dark:text-red-400 text-sm">{{ apiError }}</p>
        <button 
          @click="fetchLiveData"
          class="mt-2 px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
        >
          Retry
        </button>
      </div>
      
      <AccountCard 
        v-else-if="liveAccount"
        :account="liveAccount"
        @view-details="onViewDetails"
        @edit-account="onEditAccount"
        @delete-account="onDeleteAccount"
      />
      
      <div v-else class="p-4 text-center">
        <button 
          @click="fetchLiveData"
          class="px-4 py-2 bg-primary-600 text-white rounded hover:bg-primary-700"
        >
          Load Live Account Data
        </button>
        <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Fetches data from http://localhost:3001/api/organization/overview
        </p>
        <p class="mt-1 text-xs text-green-500 dark:text-green-400">
          ✅ Nuxt dev server is running on port 3001
        </p>
      </div>
    </Variant>

    <template #controls>
      <div class="space-y-4">
        <div class="p-4 bg-gray-50 dark:bg-gray-800 rounded">
          <p class="text-sm text-gray-600 dark:text-gray-400">
            Click the action buttons to see console logs. Check browser console for event details.
          </p>
        </div>
        
        <div class="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded">
          <h4 class="font-medium text-blue-900 dark:text-blue-100 mb-2">Live API Integration</h4>
          <p class="text-sm text-blue-700 dark:text-blue-300 mb-2">
            The "Live API Data" variant demonstrates fetching real account data from your API endpoints.
          </p>
          <div class="text-xs text-blue-600 dark:text-blue-400 space-y-1">
            <div>• Click "Load Live Account Data" to fetch from http://localhost:3001/api/organization/overview</div>
            <div>• Loading states and error handling included</div>
            <div>• Uses the same API endpoints as your main application</div>
            <div class="text-green-600 dark:text-green-400 mt-2">
              ✅ <strong>Ready to use:</strong> Nuxt dev server is running on port 3001
            </div>
          </div>
        </div>
      </div>
    </template>
  </Story>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import AccountCard from './AccountCard.vue'
import type { AccountInfo } from '../../server/types/aws'

// Sample account data
const activeAccount: AccountInfo = {
  accountId: '123456789012',
  accountName: 'Production Web Services',
  accountEmail: 'prod-web@company.com',
  accountStatus: 'ACTIVE',
  organizationalUnit: 'Production/WebServices',
  parentId: 'ou-root-123456789',
  projectCode: 'WEB-PROD-001',
  environment: 'prod',
  technicalContact: 'tech-lead@company.com',
  businessContact: 'product-manager@company.com',
  accountType: 'commercial-only',
  hasGovCloud: false,
  createdDate: '2023-01-15T10:30:00Z',
  modifiedDate: '2024-08-10T14:22:00Z',
  tags: {
    'CostCenter': 'CC-12345',
    'Project': 'WebServices',
    'Environment': 'Production'
  }
}

const govCloudAccount: AccountInfo = {
  accountId: '987654321098',
  govCloudAccountId: '123456789012',
  accountName: 'Secure Government Platform',
  accountEmail: 'secure-gov@company.gov',
  accountStatus: 'ACTIVE',
  organizationalUnit: 'GovCloud/SecureServices',
  parentId: 'ou-gov-987654321',
  projectCode: 'GOV-SEC-001',
  environment: 'prod',
  technicalContact: 'security@company.gov',
  businessContact: 'compliance@company.gov',
  accountType: 'govcloud-paired',
  hasGovCloud: true,
  createdDate: '2023-03-20T08:15:00Z',
  modifiedDate: '2024-08-15T16:45:00Z',
  tags: {
    'Classification': 'CUI',
    'Compliance': 'FedRAMP'
  }
}

const suspendedAccount: AccountInfo = {
  accountId: '555666777888',
  accountName: 'Legacy Development Account',
  accountEmail: 'legacy-dev@company.com',
  accountStatus: 'SUSPENDED',
  organizationalUnit: 'Development/Legacy',
  parentId: 'ou-dev-555666777',
  projectCode: 'LEG-DEV-999',
  environment: 'dev',
  technicalContact: 'legacy-team@company.com',
  accountType: 'commercial-only',
  hasGovCloud: false,
  createdDate: '2022-05-10T12:00:00Z',
  modifiedDate: '2024-06-01T09:30:00Z',
  tags: {
    'Status': 'Deprecated'
  }
}

const minimalAccount: AccountInfo = {
  accountId: '999888777666',
  accountStatus: 'ACTIVE',
  accountType: 'commercial-only',
  hasGovCloud: false
}

// Event handlers
const onViewDetails = (account: AccountInfo) => {
  console.log('View Details clicked for:', account.accountId, account.accountName)
}

const onEditAccount = (account: AccountInfo) => {
  console.log('Edit Account clicked for:', account.accountId, account.accountName)
}

const onDeleteAccount = (account: AccountInfo) => {
  console.log('Delete Account clicked for:', account.accountId, account.accountName)
}

// Live API integration
const isLoading = ref(false)
const apiError = ref<string | null>(null)
const liveAccount = ref<AccountInfo | null>(null)

const fetchLiveData = async () => {
  isLoading.value = true
  apiError.value = null
  
  try {
    // Use the correct API server URL (Nuxt dev server on port 3001)
    const apiUrl = 'http://localhost:3001/api/organization/overview'
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        // Add any auth headers if needed
        // 'Authorization': 'Bearer token-here'
      },
      // Handle CORS if needed
      mode: 'cors'
    })
    
    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`)
    }
    
    const contentType = response.headers.get('content-type')
    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text()
      throw new Error(`Expected JSON response, got ${contentType}. Response: ${text.substring(0, 200)}...`)
    }
    
    const data = await response.json()
    
    // Transform the API response to match AccountInfo interface
    // Adjust this based on your actual API response structure
    if (data.success && data.data?.accounts?.length > 0) {
      const firstAccount = data.data.accounts[0]
      liveAccount.value = {
        accountId: firstAccount.accountId || firstAccount.id || 'N/A',
        accountName: firstAccount.accountName || firstAccount.name || 'Live Account',
        accountEmail: firstAccount.accountEmail || firstAccount.email || 'api@company.com',
        accountStatus: firstAccount.accountStatus || firstAccount.status || 'ACTIVE',
        organizationalUnit: firstAccount.organizationalUnit || firstAccount.ou || 'API/Live',
        parentId: firstAccount.parentId || firstAccount.parent || 'ou-live-123',
        projectCode: firstAccount.projectCode || 'API-LIVE-001',
        environment: firstAccount.environment || 'live',
        technicalContact: firstAccount.technicalContact || 'api-team@company.com',
        businessContact: firstAccount.businessContact || 'api-business@company.com',
        accountType: firstAccount.accountType || 'commercial-only',
        hasGovCloud: firstAccount.hasGovCloud || false,
        createdDate: firstAccount.createdDate || new Date().toISOString(),
        modifiedDate: firstAccount.modifiedDate || new Date().toISOString(),
        govCloudAccountId: firstAccount.govCloudAccountId,
        tags: firstAccount.tags || {
          'Source': 'Live API',
          'Loaded': new Date().toLocaleString()
        }
      }
    } else {
      // Handle case where API returns success but no accounts
      throw new Error('No accounts found in API response')
    }
    
  } catch (error) {
    console.error('Failed to fetch live account data:', error)
    apiError.value = error instanceof Error ? error.message : 'Failed to load account data'
    liveAccount.value = null
  } finally {
    isLoading.value = false
  }
}
</script>