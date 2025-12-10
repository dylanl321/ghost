<template>
  <div class="space-y-4">
    <!-- Header: Search and Actions -->
    <div class="flex items-center justify-between gap-4">
      <!-- Search -->
      <div v-if="config.searchable" class="flex-1 max-w-md">
        <UInput
          v-model="searchQuery"
          icon="i-heroicons-magnifying-glass"
          placeholder="Search..."
          size="sm"
        />
      </div>

      <!-- Actions -->
      <div class="flex items-center gap-2">
        <!-- Column Visibility Toggle -->
        <UPopover v-if="config.columnToggle" mode="hover">
          <UButton
            icon="i-heroicons-eye"
            size="xs"
            color="gray"
            variant="outline"
          >
            Columns
          </UButton>
          <template #panel>
            <div class="p-3 space-y-2 min-w-[200px]">
              <div
                v-for="col in columns"
                :key="col.key"
                class="flex items-center gap-2"
              >
                <input
                  :id="`col-${col.key}`"
                  v-model="visibleColumns[col.key]"
                  type="checkbox"
                  class="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded"
                >
                <label
                  :for="`col-${col.key}`"
                  class="text-sm text-gray-300 cursor-pointer"
                >
                  {{ col.label }}
                </label>
              </div>
            </div>
          </template>
        </UPopover>

        <!-- Export Buttons -->
        <UButton
          v-if="config.exportCsv"
          icon="i-heroicons-arrow-down-tray"
          size="xs"
          color="blue"
          variant="outline"
          @click="exportToCSV"
        >
          CSV
        </UButton>

        <UButton
          v-if="config.exportPdf"
          icon="i-heroicons-document-arrow-down"
          size="xs"
          color="blue"
          variant="outline"
          @click="exportToPDF"
        >
          PDF
        </UButton>
      </div>
    </div>

    <!-- Table -->
    <div class="overflow-x-auto border border-gray-700 rounded-lg">
      <table class="min-w-full divide-y divide-gray-700">
        <!-- Header -->
        <thead class="bg-gray-800">
          <tr>
            <th
              v-for="col in visibleColumnsArray"
              :key="col.key"
              :class="[
                'px-4 py-3 text-xs font-medium text-gray-300 tracking-wider',
                col.align === 'right' ? 'text-right' :
                col.align === 'center' ? 'text-center' : 'text-left',
                col.sortable !== false && config.sortable ? 'cursor-pointer hover:bg-gray-700' : ''
              ]"
              @click="col.sortable !== false && config.sortable ? sortBy(col.key) : null"
            >
              <div class="flex items-center gap-1" :class="col.align === 'right' ? 'justify-end' : col.align === 'center' ? 'justify-center' : 'justify-start'">
                <span>{{ col.label }}</span>
                <Icon
                  v-if="col.sortable !== false && config.sortable && sortColumn === col.key"
                  :name="sortDirection === 'asc' ? 'i-heroicons-arrow-up' : 'i-heroicons-arrow-down'"
                  class="w-3 h-3"
                />
                <UTooltip v-if="col.helpLink" :text="col.helpTooltip || 'Learn more'">
                  <NuxtLink :to="col.helpLink" class="text-gray-400 hover:text-gray-300" @click.stop>
                    <UIcon name="i-heroicons-question-mark-circle" class="w-3.5 h-3.5" />
                  </NuxtLink>
                </UTooltip>
              </div>
            </th>
          </tr>
        </thead>

        <!-- Body -->
        <tbody class="bg-gray-900 divide-y divide-gray-700">
          <tr
            v-for="(row, idx) in paginatedData"
            :key="getRowKey(row, idx)"
            class="hover:bg-gray-800"
          >
            <td
              v-for="col in visibleColumnsArray"
              :key="col.key"
              :class="[
                'px-4 py-3 text-sm',
                col.align === 'right' ? 'text-right' :
                col.align === 'center' ? 'text-center' : 'text-left',
                col.class || 'text-gray-300'
              ]"
            >
              <!-- Custom slot if provided -->
              <slot v-if="$slots[`cell-${col.key}`]" :name="`cell-${col.key}`" :row="row" :value="getCellValue(row, col.key)">
              </slot>
              <!-- Formatted value -->
              <span v-else-if="col.format">
                {{ col.format(getCellValue(row, col.key), row) }}
              </span>
              <!-- Raw value -->
              <span v-else>
                {{ getCellValue(row, col.key) }}
              </span>
            </td>
          </tr>

          <!-- Empty state -->
          <tr v-if="paginatedData.length === 0">
            <td
              :colspan="visibleColumnsArray.length"
              class="px-4 py-8 text-center text-gray-400"
            >
              <Icon name="i-heroicons-inbox" class="w-8 h-8 mx-auto mb-2 text-gray-500" />
              <p>{{ config.emptyMessage || 'No data available' }}</p>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    <div v-if="config.paginated && filteredData.length > 0" class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <span class="text-sm text-gray-400">Rows per page:</span>
        <USelect
          v-model="pageSize"
          :options="pageSizeOptions"
          size="xs"
          class="w-20"
        />
      </div>

      <div class="flex items-center gap-4">
        <span class="text-sm text-gray-400">
          Showing {{ startRow }} to {{ endRow }} of {{ filteredData.length }} rows
        </span>
        <div class="flex items-center gap-1">
          <UButton
            icon="i-heroicons-chevron-left"
            size="xs"
            color="gray"
            :disabled="currentPage === 1"
            @click="currentPage--"
          />
          <span class="text-sm text-gray-300 px-2">
            Page {{ currentPage }} of {{ totalPages }}
          </span>
          <UButton
            icon="i-heroicons-chevron-right"
            size="xs"
            color="gray"
            :disabled="currentPage === totalPages"
            @click="currentPage++"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'

// Column definition type
export interface TableColumn {
  key: string
  label: string
  sortable?: boolean
  align?: 'left' | 'center' | 'right'
  format?: (value: any, row: any) => string
  class?: string
  default?: boolean // Whether column is visible by default
  helpLink?: string // Optional link to documentation
  helpTooltip?: string // Optional tooltip text for help icon
}

// Configuration options
export interface TableConfig {
  searchable?: boolean
  sortable?: boolean
  paginated?: boolean
  columnToggle?: boolean
  exportCsv?: boolean
  exportPdf?: boolean
  emptyMessage?: string
  rowKey?: string | ((row: any) => string | number)
}

// Props
const props = withDefaults(defineProps<{
  columns: TableColumn[]
  data: any[]
  config?: TableConfig
  title?: string
}>(), {
  config: () => ({
    searchable: true,
    sortable: true,
    paginated: true,
    columnToggle: true,
    exportCsv: true,
    exportPdf: false,
    emptyMessage: 'No data available'
  })
})

// State
const searchQuery = ref('')
const sortColumn = ref('')
const sortDirection = ref<'asc' | 'desc'>('asc')
const currentPage = ref(1)
const pageSize = ref(25)

const pageSizeOptions = [
  { label: '10', value: 10 },
  { label: '25', value: 25 },
  { label: '50', value: 50 },
  { label: '100', value: 100 }
]

// Column visibility state
const visibleColumns = ref<Record<string, boolean>>(
  props.columns.reduce((acc, col) => {
    acc[col.key] = col.default !== false // Default to visible unless explicitly set to false
    return acc
  }, {} as Record<string, boolean>)
)

// Computed: Visible columns array
const visibleColumnsArray = computed(() => {
  return props.columns.filter(col => visibleColumns.value[col.key])
})

// Helper: Get cell value from row using key (supports nested keys)
const getCellValue = (row: any, key: string) => {
  if (!key.includes('.')) return row[key]

  // Support nested keys like 'user.name'
  const keys = key.split('.')
  let value = row
  for (const k of keys) {
    if (value == null) return null
    value = value[k]
  }
  return value
}

// Helper: Get row key
const getRowKey = (row: any, idx: number): string | number => {
  if (typeof props.config.rowKey === 'function') {
    return props.config.rowKey(row)
  }
  if (typeof props.config.rowKey === 'string') {
    return getCellValue(row, props.config.rowKey) ?? idx
  }
  return idx
}

// Filtered data (by search)
const filteredData = computed(() => {
  if (!props.config.searchable || !searchQuery.value) {
    return props.data
  }

  const query = searchQuery.value.toLowerCase()
  return props.data.filter(row => {
    return props.columns.some(col => {
      const value = getCellValue(row, col.key)
      if (value == null) return false
      return String(value).toLowerCase().includes(query)
    })
  })
})

// Sorted data
const sortedData = computed(() => {
  if (!props.config.sortable || !sortColumn.value) {
    return filteredData.value
  }

  const column = sortColumn.value
  const direction = sortDirection.value

  return [...filteredData.value].sort((a, b) => {
    const aVal = getCellValue(a, column)
    const bVal = getCellValue(b, column)

    // Handle null/undefined
    if (aVal == null && bVal == null) return 0
    if (aVal == null) return direction === 'asc' ? 1 : -1
    if (bVal == null) return direction === 'asc' ? -1 : 1

    // Compare values
    let comparison = 0
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      comparison = aVal - bVal
    } else {
      comparison = String(aVal).localeCompare(String(bVal))
    }

    return direction === 'asc' ? comparison : -comparison
  })
})

// Pagination
const totalPages = computed(() => {
  if (!props.config.paginated) return 1
  return Math.ceil(sortedData.value.length / pageSize.value)
})

const startRow = computed(() => {
  if (sortedData.value.length === 0) return 0
  return (currentPage.value - 1) * pageSize.value + 1
})

const endRow = computed(() => {
  return Math.min(currentPage.value * pageSize.value, sortedData.value.length)
})

const paginatedData = computed(() => {
  if (!props.config.paginated) {
    return sortedData.value
  }

  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return sortedData.value.slice(start, end)
})

// Methods
const sortBy = (column: string) => {
  if (sortColumn.value === column) {
    sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortColumn.value = column
    sortDirection.value = 'asc'
  }
}

const exportToCSV = () => {
  const csvRows: string[] = []

  // Header
  const headers = visibleColumnsArray.value.map(col => col.label)
  csvRows.push(headers.join(','))

  // Data rows
  sortedData.value.forEach(row => {
    const values = visibleColumnsArray.value.map(col => {
      const value = getCellValue(row, col.key)
      if (value == null) return ''

      // Apply formatting if provided
      const formatted = col.format ? col.format(value, row) : String(value)

      // Escape quotes and wrap in quotes if contains comma
      const escaped = String(formatted).replace(/"/g, '""')
      return escaped.includes(',') ? `"${escaped}"` : escaped
    })
    csvRows.push(values.join(','))
  })

  // Create and download
  const csvContent = csvRows.join('\n')
  const blob = new Blob([csvContent], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${props.title || 'table'}-${new Date().toISOString().split('T')[0]}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

const exportToPDF = () => {
  // TODO: Implement PDF export using existing usePDFExport composable
  console.log('PDF export not yet implemented')
}

// Watch: Reset page when search changes
watch(searchQuery, () => {
  currentPage.value = 1
})

// Watch: Reset page when page size changes
watch(pageSize, () => {
  currentPage.value = 1
})
</script>
