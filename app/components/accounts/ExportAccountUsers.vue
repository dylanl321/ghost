<template>
  <div>
    <UButton 
      icon="i-heroicons-arrow-down-tray" 
      :loading="isProcessing" 
      :disabled="isProcessing"
      @click="exportAccountUsersToCSV"
    >
      Export Account Users
    </UButton>
  </div>
</template>


<script setup lang="ts">
import { ref, computed } from 'vue'

const enclaveStore = useEnclaveStore()
const groupMembers = useGroupMembers()
const { user } = useOidcAuth()

const isProcessing = ref(false)

const token = computed(() => user.value?.accessToken || '')

const activeEnclaves = computed(() =>
  Object.entries(enclaveStore.enclaves).filter(
    ([_, data]) => data.enclaveStatus !== 'Decommissioned' && data.source === 'both'
  )
);

// --- Core Data Fetching ---

/**
 * Fetches users for all active enclaves concurrently.
 */
const fetchAccountData = async () => {
  if (!token.value) {
    console.warn('Access token missing. Skipping data fetch.')
    return []
  }

  isProcessing.value = true

  const fetchPromises = activeEnclaves.value.map(async ([accountId, data]) => {
    try {
      // Destructure and provide defaults for clean access
      const { 
        awsStandardAccountID: stdId = '', 
        awsGovCloudAccountID: govId = '', 
        projectName = 'N/A' 
      } = data

      const users: Array<GraphUser> = await groupMembers.fetchEnclaveUsers(
        stdId,
        govId,
        token.value
      )

      return {
        accountId,
        projectName,
        userEmails: users.map(u => u.userPrincipalName),
      }
    } catch (err) {
      console.error(`Error fetching users for ${accountId}:`, err)
      return {
        accountId,
        projectName: data.projectName || 'N/A',
        userEmails: [],
        error: true,
      }
    }
  })

  try {
    const results = await Promise.all(fetchPromises)
    const sortedResults = results.sort((a, b) => a.accountId.localeCompare(b.accountId))
    // console.table(sortedResults.filter(r => !r.error))
    console.log(sortedResults.filter(r => !r.error))
    return sortedResults
  } catch (err) {
    console.error('Fatal error during concurrent fetch:', err)
    return []
  } finally {
    isProcessing.value = false
  }
}

// --- CSV Export Logic ---

async function exportAccountUsersToCSV() {
  const allResults = await fetchAccountData()
  const successResults = allResults.filter(r => !r.error)

  if (successResults.length === 0) {
    console.log('No successful account data to export.')
    return
  }

  // Helper for CSV escaping: converts field, escapes quotes, wraps in quotes
  const csvEscape = (field: string | number) => 
    `"${String(field).replace(/"/g, '""')}"`

  const rows = [
    ['AWS Account ID', 'Project Name', 'User Emails'],
    ...successResults.map(account => [
      account.accountId,
      account.projectName,
      account.userEmails.join('; ')
    ])
  ]

  const csvContent = rows
    .map(r => r.map(csvEscape).join(','))
    .join('\n')

  // Trigger browser download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', 'aws-account-users.csv')
  link.click()

  // Cleanup to release memory
  URL.revokeObjectURL(url)
}

</script>
