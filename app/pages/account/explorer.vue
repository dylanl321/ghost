<template>
  <div class="space-y-6 p-6 max-w-[1600px] mx-auto">
    <!-- Header card -->
    <UCard>
      <template #header>
        <div class="p-2">
          <h1 class="text-3xl font-bold mb-2 text-gray-900 dark:text-white">Enclave Explorer</h1>
          <p class="text-sm text-gray-500 dark:text-gray-400">
            Advanced AWS enclave/account filtering and exploration
          </p>
        </div>
      </template>
    </UCard>

    <!-- Filters card -->
    <UCard>
      <template #header>
        <div class="flex justify-between items-center p-2">
          <h1 class="text-xl font-bold text-gray-900 dark:text-white">Filters</h1>
          <UButton icon="i-heroicons-funnel" variant="ghost" @click="resetFilters">Reset Filters</UButton>
        </div>
      </template>

      <div class="flex flex-wrap items-center gap-5 gap-y-6 mb-6">
        <!-- LOB filter -->
        <div class="flex items-center">
          <label for="lobSelection" class="text-sm text-gray-600 dark:text-gray-400 mr-2">LOB:</label>
          <USelect id="lobSelection" v-model="lobFilter" :options="lobOptions" class="w-40" />
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-5 gap-y-6 mb-6">
        <!-- Status filter -->
        <div class="flex items-center">
          <label for="statusSelection" class="text-sm text-gray-600 dark:text-gray-400 mr-2">Status:</label>
          <div class="flex gap-1">
            <UButton v-for="item in statusOptions" :key="item" size="xs" variant="solid"
              :color="statusFilter === item ? 'emerald' : 'gray'" @click="statusFilter = item">
              {{ item }}
            </UButton>
          </div>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-5 gap-y-6 mb-6">
        <!-- Environment filter -->
        <div class="flex items-center">
          <label for="envSelection" class="text-sm text-gray-600 dark:text-gray-400 mr-2">Environment:</label>
          <div class="flex gap-1">
            <UButton v-for="item in envOptions" :key="item" size="xs" variant="solid"
              :color="envFilter === item ? 'emerald' : 'gray'" @click="envFilter = item">
              {{ item }}
            </UButton>
          </div>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-5 gap-y-6 mb-6">
        <!-- SAWSE filter -->
        <div class="flex items-center">
          <label for="lobSelection" class="text-sm text-gray-600 dark:text-gray-400 mr-2">SAWSE:</label>
          <UCheckbox v-model="sawseCheckbox" />
        </div>

        <!-- My Accounts filter -->
        <div class="flex items-center">
          <label for="lobSelection" class="text-sm text-gray-600 dark:text-gray-400 mr-2">My Enclaves:</label>
          <UCheckbox v-model="myEnclavesCheckbox" />
        </div>
      </div>

      <!-- Search -->
      <div class="flex flex-wrap items-center">
        <USelect v-model="searchScope" :options="searchScopeOptions" class="w-48 mr-1" />
        <UInput v-model="search" :placeholder="`Search ${searchScope}...`" icon="i-heroicons-magnifying-glass"
          class="w-96" />
      </div>

    </UCard>

    <!-- Table card -->
    <UCard>
      <template #header>
        <div class="flex items-center justify-between p-2">
          <div class="flex items-center gap-3">
            <h1 class="text-xl font-bold text-gray-900 dark:text-white">Results</h1>
            <UBadge color="emerald" variant="subtle">{{ filteredRows.length }} enclaves found</UBadge>
          </div>
          <div>
            <UTooltip text="Export these results to CSV">
              <UButton icon="i-heroicons-arrow-down-tray" @click="() => exportToCSV(filteredRows)">Export</UButton>
            </UTooltip>
          </div>
        </div>
      </template>
      <div class="max-h-[600px] overflow-y-auto">
        <UTable :rows="paginatedRows" :columns="columns" :loading="loading">

          <!-- Project Name column -->
          <template #projectName-data="{ row }">
            <div class="flex items-center gap-2 mb-2">
              <span class="w-3 h-3 rounded-full"
                :class="row.enclaveStatus !== 'Decommissioned' ? 'bg-green-500' : 'bg-red-500'" />
              <span>{{ row.projectName || row.accountId }}</span>
            </div>
            <p class="text-xs">{{ row.awsAccountEmail }}</p>
          </template>

          <!-- Account IDs column -->
          <template #accountIds-data="{ row }">
            <div class="flex flex-col gap-1">
              <span>
                <UBadge color="orange" variant="subtle">Comm</UBadge>
                {{ row.awsStandardAccountID || '—' }}
              </span>
              <span>
                <UBadge color="blue" variant="subtle">Gov</UBadge>
                {{ row.awsGovCloudAccountID || '—' }}
              </span>
            </div>
          </template>

          <!-- Platform info column -->
          <template #platformInfo-data="{ row }">
            <div class="flex flex-col gap-1">
              <UTooltip :text="row.awsGovCloudAccountID ? 'GovCloud Paired' : 'Commercial Only'">
                <p>{{ row.awsGovCloudAccountID ? "GovCloud" : "Commercial" }}</p>
              </UTooltip>

              <UTooltip v-if="row.isAWSStdEnv" text="Standard AWS Environment">
                <UBadge color="orange" size="xs">SAWSE</UBadge>
              </UTooltip>

              <UBadge v-if="row.dataType" :color="getDataTypeColor(row.dataType)" size="xs" class="w-fit">
                <UIcon name="i-heroicons-shield-check" class="w-3 h-3" />
                {{ row.dataType }}
              </UBadge>

            </div>
          </template>

          <!-- Admins column -->
          <template #admins-data="{ row }">
            <div v-if="row.primaryAccountAdminName || row.primaryAccountAdminUsername.replace('.', ' ')"
              class="flex items-center">
              <UIcon name="i-heroicons-user" class="mr-1" />
              <span>{{ row.primaryAccountAdminName || row.primaryAccountAdminUsername.replace('.', ' ') }}</span>
            </div>
            <div v-if="row.delegateAccountAdminName || row.delegateAccountAdminUsername.replace('.', ' ')"
              class="flex items-center">
              <UIcon name="i-heroicons-user-plus" class="mr-1" />
              <span>{{ row.delegateAccountAdminName || row.delegateAccountAdminUsername.replace('.', ' ') }}</span>
            </div>
            <div v-if="row.costManagerName || row.costManagerUsername.replace('.', ' ')" class="flex items-center">
              <UIcon name="i-heroicons-currency-dollar" class="mr-1" />
              <span>{{ row.costManagerName || row.costManagerUsername.replace('.', ' ') }}</span>
            </div>
          </template>

          <!-- LOB column -->
          <template #lineOfBusiness-data="{ row }">
            <p>{{ row.linesOfBusiness || "IT" }}</p>
          </template>

          <!-- Actions column -->
          <template #actions-data="{ row }">
            <UDropdown :items="getActionItems(row)">
              <UButton color="gray" variant="ghost" icon="i-heroicons-ellipsis-vertical" />
              <template #items>
                <ULink :to="`/account/${row.accountId}`"
                  class="block px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-800">
                  Account Details
                </ULink>
              </template>
            </UDropdown>
          </template>

        </UTable>
      </div>

      <!-- Pagination -->
      <div class="flex justify-end mt-4">
        <UPagination v-model="page" :page-count="pageCount" :total="filteredRows.length" />
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const enclaveStore = useEnclaveStore()
const userGroupStore = useUserGroupStore()
const loading = ref(false)

// search + filters
const search = ref('')
const searchScope = ref<'All Fields' | 'Project Name' | 'Personnel' | 'Account IDs'>('All Fields')
const searchScopeOptions = ['All Fields', 'Project Name', 'Personnel', 'Account IDs']
const statusFilter = ref<'All' | 'Active' | 'Decommissioned'>('Active')
const statusOptions: ('All' | 'Active' | 'Decommissioned')[] = ['All', 'Active', 'Decommissioned']
const envFilter = ref<'All' | 'Commercial Only' | 'GovCloud Paired'>('All')
const envOptions: ('All' | 'Commercial Only' | 'GovCloud Paired')[] = ['All', 'Commercial Only', 'GovCloud Paired']
const lobFilter = ref<'All' | 'MSS' | 'SIS' | 'Cyber' | 'SC&I' | 'LAS' | 'IT'>('All')
const lobOptions = ['All', 'MSS', 'SIS', 'Cyber', 'SC&I', 'LAS', 'IT']
const sawseCheckbox = ref<boolean>(false)
const myEnclavesCheckbox = ref<boolean>(false)

// pagination
const page = ref(1)
const pageCount = 25

const columns = [
  { key: 'projectName', label: 'Project Name' },
  { key: 'accountIds', label: 'Account IDs' },
  { key: 'platformInfo', label: 'Platform Info' },
  { key: 'admins', label: 'Admins' },
  { key: 'lineOfBusiness', label: 'LOB' },
  { key: 'actions', label: '' }
]

const getActionItems = (account: AWSEnclaveData) => {
  // Always use commercial account ID for navigation (primary identifier)
  const accountId = account.awsStandardAccountID

  const actionItems: any = [
    [
      {
        label: 'Account Details',
        icon: 'i-heroicons-document-text',
        to: `/account/${accountId}`,
        description: 'View full account details and overview'
      },
    ],
  ]

  // Add utility actions
  const utilityActions = []

  if (account.recordLink) {
    utilityActions.push({
      label: 'View Record',
      icon: 'i-heroicons-arrow-top-right-on-square',
      click: () => window.open(account.recordLink, '_blank'),
      description: 'Open source record in new tab'
    })
  }

  if (utilityActions.length > 0) {
    actionItems.push(utilityActions)
  }

  return actionItems
}

const getDataTypeColor = (dataType?: string) => {
  if (!dataType) return 'gray';

  const typeLower = dataType.toLowerCase();
  if (typeLower.includes('pii') || typeLower.includes('personal')) return 'amber';
  if (typeLower.includes('public')) return 'green';
  if (typeLower.includes('sensitive') || typeLower.includes('confidential')) return 'red';
  if (typeLower.includes('internal')) return 'blue';

  return 'indigo';
}

const allRows = computed(() => Object.values(enclaveStore.enclaves || {}))

const filteredRows = computed(() => {
  const query = search.value.toLowerCase()

  return allRows.value.filter(e => {
    let valuesToSearch: (string | undefined)[] = []

    if (searchScope.value === 'All Fields') {
      valuesToSearch = [
        e.projectName,
        e.awsStandardAccountID,
        e.awsGovCloudAccountID,
        e.linesOfBusiness,
        e.accountStatus,
        e.primaryAccountAdminName,
        e.primaryAccountAdminUsername,
        e.primaryAccountAdminUsername?.replace('.', ' '),
        e.delegateAccountAdminName,
        e.delegateAccountAdminUsername,
        e.delegateAccountAdminUsername?.replace('.', ' '),
        e.costManagerName,
        e.costManagerUsername,
        e.costManagerUsername?.replace('.', ' '),
      ]
    }

    if (searchScope.value === 'Project Name') {
      valuesToSearch = [
        e.projectName
      ]
    }

    if (searchScope.value === 'Personnel') {
      valuesToSearch = [
        e.primaryAccountAdminName,
        e.primaryAccountAdminUsername,
        e.primaryAccountAdminUsername?.replace('.', ' '),
        e.delegateAccountAdminName,
        e.delegateAccountAdminUsername,
        e.delegateAccountAdminUsername?.replace('.', ' '),
        e.costManagerName,
        e.costManagerUsername,
        e.costManagerUsername?.replace('.', ' '),
      ]
    }

    if (searchScope.value === 'Account IDs') {
      valuesToSearch = [
        e.awsStandardAccountID,
        e.awsGovCloudAccountID
      ]
    }

    const matchesSearch = !query || valuesToSearch.some(val => String(val || '').toLowerCase().includes(query))

    const matchesStatus =
      statusFilter.value === 'All' ||
      (statusFilter.value === 'Active' && e.enclaveStatus !== 'Decommissioned') ||
      (statusFilter.value === 'Decommissioned' && e.enclaveStatus === 'Decommissioned')

    const matchesEnvironment =
      envFilter.value === 'All' ||
      (envFilter.value === 'GovCloud Paired' && e.awsGovCloudAccountID !== '') ||
      (envFilter.value === 'Commercial Only' && e.awsGovCloudAccountID === '')

    const matchesLOB =
      lobFilter.value === 'All' ||
      (lobFilter.value === (e.linesOfBusiness ?? 'IT'))

    const matchesSAWSE =
      sawseCheckbox.value === false ||
      e.isAWSStdEnv

    const matchesMyEnclaves =
      myEnclavesCheckbox.value === false ||
      Object.keys(userGroupStore.myEnclaves).some(accountId => accountId === e.awsStandardAccountID)

    return matchesSearch && matchesStatus && matchesEnvironment && matchesLOB && matchesSAWSE && matchesMyEnclaves
  })
})

const paginatedRows = computed(() => {
  const start = (page.value - 1) * pageCount
  return filteredRows.value.slice(start, start + pageCount)
})

function resetFilters() {
  search.value = ''
  searchScope.value = 'All Fields'
  statusFilter.value = 'Active'
  envFilter.value = 'All'
  lobFilter.value = 'All'
  sawseCheckbox.value = false
  myEnclavesCheckbox.value = false
}

</script>
