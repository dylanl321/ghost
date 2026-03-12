<template>
  <div>
    <!-- Tables Grid -->
    <div v-if="tables.length > 0" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <!-- Render each table -->
      <div
        v-for="table in tables"
        :key="table.id"
        :class="[
          'bg-gray-900 border border-gray-700 rounded-lg overflow-hidden',
          getTableWidthClass(table)
        ]"
      >
        <!-- Table Header -->
        <div class="px-6 py-4 border-b border-gray-700 bg-gray-800/50">
          <h3 class="text-lg font-semibold text-white">{{ table.title }}</h3>
          <p v-if="table.description" class="text-sm text-gray-400 mt-1">
            {{ table.description }}
          </p>
        </div>

        <!-- Table Content -->
        <div class="p-6">
          <!-- Loading State -->
          <div v-if="isLoading" class="flex items-center justify-center py-12">
            <div class="text-center">
              <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-blue-500 mx-auto mb-2" />
              <p class="text-gray-400">Loading table data...</p>
            </div>
          </div>

          <!-- Error State -->
          <div v-else-if="hasError(table)" class="flex items-center justify-center py-12">
            <div class="text-center">
              <UIcon name="i-heroicons-exclamation-triangle" class="w-8 h-8 text-yellow-500 mx-auto mb-2" />
              <p class="text-gray-400">{{ table.config?.emptyMessage || 'No data available' }}</p>
            </div>
          </div>

          <!-- Data Table -->
          <DataTable
            v-else
            :columns="table.columns"
            :data="getTableData(table)"
            :config="table.config"
            :title="table.id"
          >
            <!-- Custom slot for status column with badge -->
            <template #cell-status="{ value }">
              <UBadge
                :color="getStatusBadgeColor(value)"
                variant="soft"
                size="xs"
              >
                {{ value }}
              </UBadge>
            </template>
          </DataTable>
        </div>
      </div>
    </div>

    <!-- No Tables Available -->
    <div v-else-if="!isLoading" class="bg-gray-900 border border-gray-700 rounded-lg p-12 text-center">
      <UIcon name="i-heroicons-table-cells" class="w-12 h-12 text-gray-600 mx-auto mb-4" />
      <p class="text-gray-400">No tables available for this selection</p>
      <p class="text-sm text-gray-500 mt-2">
        Budget health data is only available for current period selections
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { NormalizedDataset } from '~/types/costs'
import type { TableDefinition, AccountMetadata } from '~/composables/useTableRegistry'
import DataTable from '~/components/shared/DataTable.vue'

const props = defineProps<{
  tables: TableDefinition[]
  dataset: NormalizedDataset | null
  dataMode?: 'billable' | 'proforma'
  accountsList?: AccountMetadata[]
  selectedAccounts?: string[]
}>()

// Check if we're loading (no dataset yet)
const isLoading = computed(() => !props.dataset)

// Check if a specific table has an error or no data
const hasError = (table: TableDefinition) => {
  if (!props.dataset) return false
  if (!table.extractor) return true

  try {
    const data = table.extractor(props.dataset, props.dataMode || 'billable', props.accountsList, props.selectedAccounts)
    return !data || (Array.isArray(data) && data.length === 0)
  } catch (error) {
    console.warn(`Error extracting data for table ${table.id}:`, error)
    return true
  }
}

// Get table data by running the extractor
const getTableData = (table: TableDefinition) => {
  if (!props.dataset || !table.extractor) return []

  try {
    return table.extractor(props.dataset, props.dataMode || 'billable', props.accountsList, props.selectedAccounts)
  } catch (error) {
    console.error(`Error extracting data for table ${table.id}:`, error)
    return []
  }
}

// Get table width class based on layout metadata
const getTableWidthClass = (table: TableDefinition) => {
  const width = table.layout?.width || 'full'
  switch (width) {
    case 'full':
      return 'col-span-full'
    case 'half':
      return 'col-span-full md:col-span-2 lg:col-span-2'
    case 'third':
      return 'col-span-full md:col-span-1 lg:col-span-1'
    default:
      return 'col-span-full'
  }
}

// Get badge color based on status text
const getStatusBadgeColor = (status: string) => {
  switch (status) {
    case 'Critical':
      return 'red'
    case 'Over Budget':
      return 'orange'
    case 'Warning':
      return 'yellow'
    case 'Healthy':
      return 'green'
    case 'Underutilized':
      return 'blue'
    default:
      return 'gray'
  }
}
</script>
