<template>
  <div class="space-y-6">
    <!-- Header -->
    <div>
      <h2 class="text-2xl font-bold text-gray-900 dark:text-white">Data Validation</h2>
      <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Validate API responses against direct AWS Cost Explorer queries to ensure data accuracy
      </p>
    </div>

    <!-- Metric Cards -->
    <div v-if="validationResult" class="grid grid-cols-1 gap-4 sm:grid-cols-4">
      <UCard>
        <div class="text-sm text-gray-400">Overall Status</div>
        <div class="mt-2 flex items-center gap-2">
          <UBadge
            :color="validationResult.summary.overallStatus === 'PASS' ? 'green' : 'red'"
            variant="soft"
            size="lg"
          >
            {{ validationResult.summary.overallStatus }}
          </UBadge>
        </div>
      </UCard>

      <UCard>
        <div class="text-sm text-gray-400">Total Tests</div>
        <p class="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
          {{ validationResult.summary.totalTests }}
        </p>
      </UCard>

      <UCard>
        <div class="text-sm text-gray-400">Tests Passed</div>
        <p class="mt-2 text-2xl font-bold text-green-600">
          {{ validationResult.summary.passed }}
        </p>
      </UCard>

      <UCard>
        <div class="text-sm text-gray-400">Tests Failed</div>
        <p class="mt-2 text-2xl font-bold text-red-600">
          {{ validationResult.summary.failed }}
        </p>
      </UCard>
    </div>

    <!-- Controls -->
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold">Validation Settings</h3>
          <div class="flex items-center gap-2">
            <UButton
              v-if="validationResult"
              icon="i-heroicons-arrow-down-tray"
              color="gray"
              variant="ghost"
              @click="downloadCsv"
              :loading="downloadingCsv"
            >
              Download CSV
            </UButton>
            <UButton
              icon="i-heroicons-play"
              @click="runValidation"
              :loading="loading"
            >
              Run Validation
            </UButton>
          </div>
        </div>
      </template>

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Date Range
          </label>
          <USelect
            v-model="selectedPeriod"
            :options="periodOptions"
            :disabled="loading"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Environment
          </label>
          <USelect
            v-model="selectedEnvironment"
            :options="environmentOptions"
            :disabled="loading"
          />
        </div>

        <div class="flex items-end">
          <label class="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              v-model="includeProforma"
              :disabled="loading"
              class="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <span class="text-sm text-gray-700 dark:text-gray-300">
              Include Proforma Validation
            </span>
          </label>
        </div>
      </div>

      <UAlert
        v-if="validationResult"
        :color="validationResult.summary.overallStatus === 'PASS' ? 'green' : 'red'"
        variant="soft"
        class="mt-4"
      >
        <template #icon>
          <Icon
            :name="validationResult.summary.overallStatus === 'PASS' ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'"
            class="w-5 h-5"
          />
        </template>
        <template #title>
          {{ validationResult.summary.overallStatus === 'PASS' ? 'All validations passed' : 'Some validations failed' }}
        </template>
        <template #description>
          Last validated: {{ formatTimestamp(validationResult.timestamp) }}
          ({{ validationResult.dateRange.description }})
        </template>
      </UAlert>

      <UAlert v-if="error" color="red" variant="soft" class="mt-4">
        <template #title>Validation Error</template>
        <template #description>{{ error }}</template>
      </UAlert>
    </UCard>

    <!-- Test Results -->
    <UCard v-if="validationResult && validationResult.tests.length > 0">
      <template #header>
        <h3 class="text-lg font-semibold">Test Results</h3>
      </template>

      <UTable
        :rows="validationResult.tests"
        :columns="testColumns"
      >
        <template #name-data="{ row }">
          <div class="font-medium text-gray-900 dark:text-white">
            {{ row.name }}
          </div>
        </template>

        <template #passed-data="{ row }">
          <UBadge
            :color="row.passed ? 'green' : 'red'"
            variant="soft"
          >
            {{ row.passed ? 'PASS' : 'FAIL' }}
          </UBadge>
        </template>

        <template #message-data="{ row }">
          <div class="text-sm text-gray-600 dark:text-gray-400">
            {{ row.message }}
          </div>
        </template>

        <template #details-data="{ row }">
          <div class="text-xs space-y-1">
            <div class="flex justify-between gap-4">
              <span class="text-gray-500">AWS:</span>
              <span class="font-mono">${{ row.details.awsValue.toFixed(2) }}</span>
            </div>
            <div class="flex justify-between gap-4">
              <span class="text-gray-500">API:</span>
              <span class="font-mono">${{ row.details.apiValue.toFixed(2) }}</span>
            </div>
            <div class="flex justify-between gap-4">
              <span class="text-gray-500">Diff:</span>
              <span class="font-mono" :class="row.details.difference > 0 ? 'text-red-600' : 'text-green-600'">
                ${{ row.details.difference.toFixed(2) }}
              </span>
            </div>
          </div>
        </template>
      </UTable>
    </UCard>

    <!-- Account Comparisons -->
    <UCard v-if="validationResult && showAccountComparisons">
      <template #header>
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold">
            Account-Level Comparisons ({{ filteredAccountComparisons.length }} accounts)
          </h3>
          <div class="flex items-center gap-2">
            <UInput
              v-model="accountSearch"
              icon="i-heroicons-magnifying-glass"
              placeholder="Search accounts..."
              size="sm"
              class="w-64"
            />
            <USelect
              v-model="accountFilter"
              :options="accountFilterOptions"
              size="sm"
              class="w-40"
            />
          </div>
        </div>
      </template>

      <UTable
        :rows="paginatedAccountComparisons"
        :columns="accountColumns"
      >
        <template #accountId-data="{ row }">
          <div class="font-mono text-sm">{{ row.accountId }}</div>
        </template>

        <template #accountName-data="{ row }">
          <div class="font-medium text-gray-900 dark:text-white">
            {{ row.accountName }}
          </div>
        </template>

        <template #awsBillable-data="{ row }">
          <div class="font-mono text-sm">${{ row.awsBillable.toFixed(2) }}</div>
        </template>

        <template #apiBillable-data="{ row }">
          <div class="font-mono text-sm">${{ row.apiBillable.toFixed(2) }}</div>
        </template>

        <template #billableMatch-data="{ row }">
          <UBadge
            :color="row.billableMatch ? 'green' : 'red'"
            variant="soft"
            size="xs"
          >
            {{ row.billableMatch ? 'YES' : 'NO' }}
          </UBadge>
        </template>

        <template #awsProforma-data="{ row }">
          <div v-if="includeProforma" class="font-mono text-sm">${{ row.awsProforma.toFixed(2) }}</div>
          <div v-else class="text-gray-400 text-sm">N/A</div>
        </template>

        <template #apiProforma-data="{ row }">
          <div v-if="includeProforma" class="font-mono text-sm">${{ row.apiProforma.toFixed(2) }}</div>
          <div v-else class="text-gray-400 text-sm">N/A</div>
        </template>

        <template #proformaMatch-data="{ row }">
          <UBadge
            v-if="includeProforma"
            :color="row.proformaMatch ? 'green' : 'red'"
            variant="soft"
            size="xs"
          >
            {{ row.proformaMatch ? 'YES' : 'NO' }}
          </UBadge>
          <div v-else class="text-gray-400 text-sm">N/A</div>
        </template>

        <template #notes-data="{ row }">
          <div class="text-xs text-gray-500">{{ row.notes || '-' }}</div>
        </template>
      </UTable>

      <div class="mt-4 flex items-center justify-between">
        <div class="text-sm text-gray-500">
          Showing {{ paginatedAccountComparisons.length }} of {{ filteredAccountComparisons.length }} accounts
        </div>
        <div class="flex items-center gap-2">
          <UButton
            icon="i-heroicons-chevron-left"
            size="xs"
            color="gray"
            variant="ghost"
            :disabled="currentPage === 1"
            @click="currentPage--"
          />
          <span class="text-sm text-gray-500">
            Page {{ currentPage }} of {{ totalPages }}
          </span>
          <UButton
            icon="i-heroicons-chevron-right"
            size="xs"
            color="gray"
            variant="ghost"
            :disabled="currentPage === totalPages"
            @click="currentPage++"
          />
        </div>
      </div>
    </UCard>

    <!-- Empty State -->
    <UCard v-if="!validationResult && !loading" class="text-center py-12">
      <Icon name="i-heroicons-clipboard-document-check" class="mx-auto h-12 w-12 text-gray-400" />
      <h3 class="mt-2 text-sm font-semibold text-gray-900 dark:text-white">No validation results</h3>
      <p class="mt-1 text-sm text-gray-500">
        Click "Run Validation" to start validating your cost APIs
      </p>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

// State
const validationResult = ref<any>(null)
const loading = ref(false)
const downloadingCsv = ref(false)
const error = ref<string | null>(null)
const selectedPeriod = ref('lastMonth')
const selectedEnvironment = ref('commercial')
const includeProforma = ref(true)
const accountSearch = ref('')
const accountFilter = ref('all')
const currentPage = ref(1)
const itemsPerPage = 20

// Options
const periodOptions = [
  { label: 'Last Month', value: 'lastMonth' },
  { label: 'This Month', value: 'thisMonth' },
  { label: 'Last 30 Days', value: 'last30days' },
  { label: 'Last 90 Days', value: 'last90days' },
  { label: 'This Quarter', value: 'thisQuarter' },
  { label: 'Last Quarter', value: 'lastQuarter' },
  { label: 'Year to Date', value: 'ytd' },
  { label: 'Last Year', value: 'lastYear' }
]

const environmentOptions = [
  { label: 'Commercial', value: 'commercial' },
  { label: 'GovCloud', value: 'govcloud' }
]

const accountFilterOptions = [
  { label: 'All Accounts', value: 'all' },
  { label: 'Mismatches Only', value: 'mismatches' },
  { label: 'Passed Only', value: 'passed' }
]

// Table columns
const testColumns = [
  { key: 'name', label: 'Test Name', class: 'w-64' },
  { key: 'passed', label: 'Status', class: 'w-24' },
  { key: 'message', label: 'Message' },
  { key: 'details', label: 'Details', class: 'w-48' }
]

const accountColumns = computed(() => {
  const cols = [
    { key: 'accountId', label: 'Account ID', class: 'w-40' },
    { key: 'accountName', label: 'Account Name', class: 'w-64' },
    { key: 'awsBillable', label: 'AWS Billable', class: 'w-32' },
    { key: 'apiBillable', label: 'API Billable', class: 'w-32' },
    { key: 'billableMatch', label: 'Match', class: 'w-20' }
  ]

  if (includeProforma.value) {
    cols.push(
      { key: 'awsProforma', label: 'AWS Proforma', class: 'w-32' },
      { key: 'apiProforma', label: 'API Proforma', class: 'w-32' },
      { key: 'proformaMatch', label: 'Match', class: 'w-20' }
    )
  }

  cols.push({ key: 'notes', label: 'Notes', class: 'w-48' })

  return cols
})

// Computed
const showAccountComparisons = computed(() => {
  return validationResult.value?.accountComparisons && validationResult.value.accountComparisons.length > 0
})

const filteredAccountComparisons = computed(() => {
  if (!validationResult.value?.accountComparisons) return []

  let filtered = validationResult.value.accountComparisons

  // Apply search filter
  if (accountSearch.value) {
    const search = accountSearch.value.toLowerCase()
    filtered = filtered.filter((account: any) =>
      account.accountId.toLowerCase().includes(search) ||
      account.accountName.toLowerCase().includes(search)
    )
  }

  // Apply status filter
  if (accountFilter.value === 'mismatches') {
    filtered = filtered.filter((account: any) => !account.billableMatch || !account.proformaMatch)
  } else if (accountFilter.value === 'passed') {
    filtered = filtered.filter((account: any) => account.billableMatch && account.proformaMatch)
  }

  return filtered
})

const totalPages = computed(() => {
  return Math.ceil(filteredAccountComparisons.value.length / itemsPerPage)
})

const paginatedAccountComparisons = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage
  const end = start + itemsPerPage
  return filteredAccountComparisons.value.slice(start, end)
})

// Methods
async function runValidation() {
  loading.value = true
  error.value = null

  try {
    const params = new URLSearchParams({
      period: selectedPeriod.value,
      environment: selectedEnvironment.value,
      includeProforma: includeProforma.value.toString()
    })

    const response = await $fetch(`/api/admin/validate-costs?${params}`)
    validationResult.value = response.data
    currentPage.value = 1
  } catch (err: any) {
    error.value = err.message || 'Failed to run validation'
    console.error('Validation error:', err)
  } finally {
    loading.value = false
  }
}

async function downloadCsv() {
  if (!validationResult.value) return

  downloadingCsv.value = true

  try {
    const params = new URLSearchParams({
      period: selectedPeriod.value,
      environment: selectedEnvironment.value,
      includeProforma: includeProforma.value.toString(),
      downloadCsv: 'true'
    })

    const response = await fetch(`/api/admin/validate-costs?${params}`)
    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cost-validation-${validationResult.value.dateRange.startDate}_${validationResult.value.dateRange.endDate}.csv`
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(url)
    document.body.removeChild(a)
  } catch (err: any) {
    error.value = err.message || 'Failed to download CSV'
    console.error('Download error:', err)
  } finally {
    downloadingCsv.value = false
  }
}

function formatTimestamp(timestamp: string): string {
  return new Date(timestamp).toLocaleString()
}
</script>
