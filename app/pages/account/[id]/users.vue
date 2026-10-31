<script setup lang="ts">
import AccountUsers from '~/components/accounts/AccountUsers.vue'
import type { GraphUser } from '~/composables/useGroupMembers'
import type { DataExportConfig, ColumnConfig } from '#shared/types/export'

const logger = createLogger('IDC Sessions')

// Page setup
const route = useRoute()
const accountId = computed(() => route.params.id as string)

// Shared composable for account info
const { enhancedAccountInfo, loading, error, fetchAccountInfo, initialize } = useAccountInfo(accountId)

// Additional composables
const groupMembers = useGroupMembers()
const { user } = useOidcAuth()
const enclaveStore = useEnclaveStore()
const idcSessions = useIDCSessions()
const { exportData, isExporting } = useDataExport()
const toast = useToast()

// Users state
const users = ref<GraphUser[]>([])
const usersLoading = ref(true)

// IDC session state
const idcSessionsData = ref<any[]>([])
const idcSessionsLoading = ref(false)
const showSessionStatus = ref(true)
const idcConfigured = ref(true)

// Page metadata
definePageMeta({
  keepalive: false,
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
    logger.error('Error fetching users:', err)
    users.value = []
  } finally {
    usersLoading.value = false
  }
}

// Fetch IDC sessions for the account
const fetchIDCSessions = async () => {
  if (!accountId.value) return

  idcSessionsLoading.value = true
  try {
    const environment = 'govcloud'
    const sessions = await idcSessions.fetchAccountSessions(accountId.value, environment)
    idcSessionsData.value = sessions
  } catch (err: any) {
    logger.error('Error:', err)
    showSessionStatus.value = false
    idcConfigured.value = false
    idcSessionsData.value = []
  } finally {
    idcSessionsLoading.value = false
  }
}

// ---------------------------------------------------------------------------
// User access list export
// Flattens GraphUser[] into rows suitable for an SSP user-access list.
// roles[] is joined with "; " so each user is a single row.
// ---------------------------------------------------------------------------
interface UserExportRow {
  displayName: string
  userPrincipalName: string
  roles: string
}

const exportRows = computed<UserExportRow[]>(() =>
  [...users.value]
    .sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''))
    .map(u => ({
      displayName: u.displayName || '',
      userPrincipalName: u.userPrincipalName || '',
      roles: (u.roles || []).join('; ')
    }))
)

const exportColumns: ColumnConfig[] = [
  { key: 'displayName', header: 'Display Name', format: 'text' },
  { key: 'userPrincipalName', header: 'User Principal Name', format: 'text' },
  { key: 'roles', header: 'Roles', format: 'text' }
]

function buildExportConfig(): DataExportConfig {
  const accountName = enhancedAccountInfo.value?.displayName || `Account ${accountId.value}`
  return {
    title: `${accountName} - User Access List`,
    subtitle: `AWS Account ${accountId.value}`,
    metadata: {
      generatedBy: user.value?.claims?.name || user.value?.claims?.email || 'GHOST',
      timestamp: new Date().toISOString(),
      scope: 'single-account' as const,
      selectedAccounts: [accountId.value],
      selectedAccountsCount: 1
    },
    sheets: [
      {
        name: 'Users',
        type: 'table' as const,
        description: `${exportRows.value.length} users with access to ${accountName}`,
        data: exportRows.value,
        columns: exportColumns
      }
    ],
    options: {
      filename: `${accountName}-user-access-list`
    }
  }
}

async function onExport(format: 'csv' | 'xlsx') {
  if (exportRows.value.length === 0) {
    toast.add({ title: 'No users to export', color: 'yellow', timeout: 3000 })
    return
  }
  await exportData(buildExportConfig(), format)
}

// Copy the user access list to the clipboard as tab-separated rows,
// ready to paste directly into the SSP user-access table (Excel/Word).
async function onCopyToClipboard() {
  if (exportRows.value.length === 0) {
    toast.add({ title: 'No users to copy', color: 'yellow', timeout: 3000 })
    return
  }
  const header = ['Display Name', 'User Principal Name', 'Roles'].join('\t')
  const lines = exportRows.value.map(r =>
    [r.displayName, r.userPrincipalName, r.roles].join('\t')
  )
  const text = [header, ...lines].join('\n')
  try {
    await navigator.clipboard.writeText(text)
    toast.add({
      title: 'Copied to clipboard',
      description: `${exportRows.value.length} users copied. Paste into the SSP user access list.`,
      color: 'green',
      timeout: 3000
    })
  } catch (err) {
    logger.error('Clipboard copy failed:', err)
    toast.add({
      title: 'Copy failed',
      description: 'Clipboard access was blocked. Use the CSV or Excel export instead.',
      color: 'red',
      timeout: 5000
    })
  }
}

const exportMenuItems = computed(() => [
  [
    {
      label: 'Copy to clipboard',
      icon: 'i-heroicons-clipboard-document',
      click: onCopyToClipboard
    },
    {
      label: 'Download CSV',
      icon: 'i-heroicons-document-text',
      click: () => onExport('csv')
    },
    {
      label: 'Download Excel',
      icon: 'i-heroicons-table-cells',
      click: () => onExport('xlsx')
    }
  ]
])

// Initialize data
onMounted(async () => {
  // Enclave data only labels accounts; the user list still loads without it
  await enclaveStore.initialize().catch((err) => {
    logger.error('Failed to load enclave data:', err)
  })
  await initialize()
  await fetchUsers()
  // Fetch IDC sessions in parallel (don't block on this)
  fetchIDCSessions()
})
</script>

<template>
  <div class="space-y-6">
    <!-- Enhanced Header with Two-Column Layout -->
    <div class="space-y-4">
      <Breadcrumb :items="breadcrumbItems" />
      
      <!-- Compact Account Header Card -->
      <UCard v-if="enhancedAccountInfo">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6">
          <!-- Left Column: Account Info -->
          <div class="flex items-center gap-4">
            <div class="w-12 h-12 bg-primary-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
              <UIcon name="i-heroicons-building-office" class="w-6 h-6 text-primary-400" />
            </div>
            <div class="flex-1 min-w-0">
              <h2 class="text-xl font-semibold text-gray-900 dark:text-white truncate">{{ enhancedAccountInfo.displayName }}</h2>
              <div class="flex items-center gap-3 mt-1 flex-wrap">
                <p class="text-sm text-gray-600 dark:text-gray-400">
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
              <div class="mt-2 text-xs text-gray-500 dark:text-gray-400">
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
            <UDropdown
              :items="exportMenuItems"
              :popper="{ placement: 'bottom-end' }"
            >
              <UButton
                icon="i-heroicons-arrow-down-tray"
                color="primary"
                variant="solid"
                size="sm"
                :loading="isExporting"
                :disabled="isExporting || usersLoading || users.length === 0"
              >
                Export Users
              </UButton>

              <template #item="{ item }">
                <div class="flex items-center gap-2 w-full">
                  <UIcon :name="item.icon" class="w-4 h-4" />
                  <span class="flex-1 text-left">{{ item.label }}</span>
                </div>
              </template>
            </UDropdown>

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
      <UCard v-else-if="loading">
        <div class="flex items-center gap-3 p-6 animate-pulse">
          <div class="w-12 h-12 bg-gray-200 dark:bg-gray-700 rounded-lg flex-shrink-0"></div>
          <div class="flex-1">
            <div class="h-5 w-48 bg-gray-200 dark:bg-gray-700 rounded mb-2"></div>
            <div class="h-3 w-32 bg-gray-200 dark:bg-gray-700 rounded"></div>
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

    <!-- Users Component with enhanced account info and IDC sessions -->
    <AccountUsers
      v-if="enhancedAccountInfo"
      :users="users"
      :account-id="accountId"
      :loading="usersLoading"
      :idc-sessions="idcSessionsData"
      :show-session-status="showSessionStatus"
      show-all
    />
  </div>
</template>
