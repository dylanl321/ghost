<template>
  <div class="space-y-6">
    <!-- Header card -->
    <UCard>
      <template #header>
        <div>
          <h1 class="text-2xl font-bold mb-1">Enclave Explorer</h1>
          <p class="text-sm text-gray-400">
            Advanced enclave/account filtering and exploration
          </p>
        </div>
      </template>
    </UCard>

    <!-- Filters card -->
    <UCard>
      <template #header>
        <h1 class="text-xl font-bold">Filters</h1>
      </template>

      <div class="flex flex-wrap items-center gap-2 gap-y-6">
        <!-- Search input -->
        <UInput
          v-model="search"
          placeholder="Search enclaves by name, Comm ID, or Gov ID..."
          icon="i-heroicons-magnifying-glass"
          class="w-96"
        />

        <!-- Status filter -->
        <div class="flex items-center gap-2">
          <div class="border-l border-gray-800 h-6 mx-1" />
          <label for="statusSelection" class="text-sm text-gray-400">Status:</label>
          <USelect
            id="statusSelection"
            v-model="statusFilter"
            :options="statusOptions"
            class="w-40"
          />
        </div>

        <!-- Environment filter -->
        <div class="flex items-center gap-2">
          <div class="border-l border-gray-800 h-6 mx-1" />
          <label for="envSelection" class="text-sm text-gray-400">Environment:</label>
          <USelect
            id="envSelection"
            v-model="envFilter"
            :options="envOptions"
            class="w-40"
          />
        </div>

        <!-- LOB filter -->
        <div class="flex items-center gap-2">
          <div class="border-l border-gray-800 h-6 mx-1" />
          <label for="lobSelection" class="text-sm text-gray-400">LOB:</label>
          <USelect
            id="lobSelection"
            v-model="lobFilter"
            :options="lobOptions"
            class="w-40"
          />
        </div>
      </div>
    </UCard>

    <!-- Table card -->
    <UCard>
      <div class="max-h-[600px] overflow-y-auto">
        <UTable
          :rows="paginatedRows"
          :columns="columns"
          :loading="loading"
        >
          <!-- Project Name column -->
          <template #projectName-data="{ row }">
            <div class="flex items-center gap-2">
              <span
                class="w-3 h-3 rounded-full"
                :class="row.accountStatus === 'ACTIVE' ? 'bg-green-500' : 'bg-red-500'"
              />
              <span>{{ row.projectName || row.accountId }}</span>
            </div>
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

          <!-- LOB column -->
          <template #lineOfBusiness-data="{ row }">
            <p>{{ row.linesOfBusiness || "IT" }}</p>
          </template>
        </UTable>
      </div>

      <!-- Pagination -->
      <div class="flex justify-end mt-4">
        <UPagination
          v-model="page"
          :page-count="pageCount"
          :total="filteredRows.length"
        />
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const enclaveStore = useEnclaveStore()
const loading = ref(false)

// search + filters
const search = ref('')
const statusFilter = ref<'All' | 'Active' | 'Decommissioned'>('Active')
const statusOptions = ['All', 'Active', 'Decommissioned']
const envFilter = ref<'All' | 'Commercial Only' | 'GovCloud Paired'>('All')
const envOptions = ['All', 'Commercial Only', 'GovCloud Paired']
const lobFilter = ref<'All' | 'MSS' | 'SIS' | 'Cyber' | 'SC&I' | 'LAS' | 'IT'>('All')
const lobOptions = ['All', 'MSS', 'SIS', 'Cyber', 'SC&I', 'LAS', 'IT']

// pagination
const page = ref(1)
const pageCount = 25

const columns = [
  { key: 'projectName', label: 'Project Name' },
  { key: 'accountIds', label: 'Account IDs' },
  { key: 'lineOfBusiness', label: 'LOB' }
]

const allRows = computed(() => Object.values(enclaveStore.enclaves || {}))

const filteredRows = computed(() => {
  const query = search.value.toLowerCase()
  return allRows.value.filter(e => {
    const matchesSearch =
      !query ||
      (e.projectName || '').toLowerCase().includes(query) ||
      (e.awsStandardAccountID || '').includes(query) ||
      (e.awsGovCloudAccountID || '').includes(query)

    const matchesStatus =
      statusFilter.value === 'All' ||
      (statusFilter.value === 'Active' && e.accountStatus === 'ACTIVE') ||
      (statusFilter.value === 'Decommissioned' && e.accountStatus !== 'ACTIVE')
    
    const matchesEnvironment =
      envFilter.value === 'All' ||
      (envFilter.value === 'GovCloud Paired' && e.awsGovCloudAccountID !== '') ||
      (envFilter.value === 'Commercial Only' && e.awsGovCloudAccountID === '')
    
    const matchesLOB =
      lobFilter.value === 'All' ||
      (lobFilter.value === (e.linesOfBusiness ?? 'IT'))
    
    return matchesSearch && matchesStatus && matchesEnvironment && matchesLOB
  })
})

const paginatedRows = computed(() => {
  const start = (page.value - 1) * pageCount
  return filteredRows.value.slice(start, start + pageCount)
})
</script>
