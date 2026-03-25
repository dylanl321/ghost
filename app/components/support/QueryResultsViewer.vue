<template>
  <div class="space-y-4">
    <!-- Header with count, type badge, view toggle, actions -->
    <div class="flex items-center justify-between flex-wrap gap-2">
      <div class="flex items-center gap-3">
        <UBadge color="blue" variant="soft">
          {{ totalCount }} {{ totalCount === 1 ? 'result' : 'results' }}
        </UBadge>
        <UBadge :color="queryTypeColor" variant="outline">
          {{ queryTypeLabel }}
        </UBadge>
        <span v-if="executionTime" class="text-xs text-gray-500">
          {{ executionTime }}ms
        </span>
      </div>
      <div class="flex items-center gap-2">
        <UButtonGroup size="xs">
          <UButton
            :color="viewMode === 'table' ? 'primary' : 'gray'"
            @click="viewMode = 'table'"
          >
            <Icon name="i-heroicons-table-cells" class="w-4 h-4 mr-1" />
            Table
          </UButton>
          <UButton
            :color="viewMode === 'json' ? 'primary' : 'gray'"
            @click="viewMode = 'json'"
          >
            <Icon name="i-heroicons-code-bracket" class="w-4 h-4 mr-1" />
            JSON
          </UButton>
        </UButtonGroup>
        <UDropdown :items="exportMenuItems">
          <UButton color="gray" size="xs">
            <Icon name="i-heroicons-arrow-down-tray" class="w-4 h-4 mr-1" />
            Export
          </UButton>
        </UDropdown>
        <UButton
          color="gray"
          variant="ghost"
          size="xs"
          @click="$emit('close')"
        >
          <Icon name="i-heroicons-x-mark" class="w-4 h-4" />
        </UButton>
      </div>
    </div>

    <!-- Table View -->
    <div v-if="viewMode === 'table'" class="overflow-x-auto">
      <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
        <thead class="bg-gray-50 dark:bg-gray-800">
          <tr>
            <th
              v-for="col in tableColumns"
              :key="col.key"
              class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
              @click="sortBy(col.key)"
            >
              <div class="flex items-center gap-1">
                {{ col.label }}
                <Icon
                  v-if="sortColumn === col.key"
                  :name="sortDirection === 'asc' ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'"
                  class="w-3 h-3"
                />
              </div>
            </th>
          </tr>
        </thead>
        <tbody class="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
          <tr
            v-for="(record, idx) in paginatedRecords"
            :key="idx"
            class="hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <td
              v-for="col in tableColumns"
              :key="col.key"
              class="px-4 py-2 text-sm text-gray-900 dark:text-gray-100"
            >
              <span v-if="col.type === 'date'" class="whitespace-nowrap">
                {{ formatDate(record[col.key]) }}
              </span>
              <span v-else-if="col.type === 'object' || col.type === 'array'" class="text-xs font-mono text-gray-500 truncate max-w-[200px] block">
                {{ formatComplex(record[col.key]) }}
              </span>
              <span v-else class="truncate max-w-[300px] block" :title="String(record[col.key] ?? '')">
                {{ record[col.key] ?? '-' }}
              </span>
            </td>
          </tr>
          <tr v-if="paginatedRecords.length === 0">
            <td :colspan="tableColumns.length" class="px-4 py-8 text-center text-gray-500">
              No results found
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- JSON View -->
    <div v-else class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 overflow-x-auto">
      <pre class="text-xs text-gray-700 dark:text-gray-300 font-mono whitespace-pre-wrap">{{ formattedJson }}</pre>
    </div>

    <!-- Pagination -->
    <div v-if="viewMode === 'table' && totalPages > 1" class="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
      <div class="text-sm text-gray-500">
        Showing {{ startIndex + 1 }}-{{ endIndex }} of {{ sortedRecords.length }}
      </div>
      <div class="flex items-center gap-2">
        <UButton
          size="xs"
          color="gray"
          :disabled="currentPage === 1"
          @click="currentPage--"
        >
          <Icon name="i-heroicons-chevron-left" class="w-4 h-4" />
        </UButton>
        <span class="text-sm text-gray-600 dark:text-gray-400">
          Page {{ currentPage }} of {{ totalPages }}
        </span>
        <UButton
          size="xs"
          color="gray"
          :disabled="currentPage === totalPages"
          @click="currentPage++"
        >
          <Icon name="i-heroicons-chevron-right" class="w-4 h-4" />
        </UButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const logger = createLogger('QueryResultsViewer')

interface AttributeSchema {
  name: string
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'date'
  label: string
}

const props = withDefaults(defineProps<{
  records: Record<string, any>[]
  attributeSchema?: AttributeSchema[]
  totalCount: number
  queryType: string
  executionTime?: number
}>(), {
  attributeSchema: () => [],
  executionTime: 0
})

defineEmits<{
  (e: 'close'): void
}>()

const viewMode = ref<'table' | 'json'>('table')
const currentPage = ref(1)
const pageSize = 25
const sortColumn = ref<string>('')
const sortDirection = ref<'asc' | 'desc'>('asc')

// Query type styling
const queryTypeColor = computed(() => {
  switch (props.queryType) {
    case 'config': return 'purple'
    case 'cloudwatch': return 'orange'
    case 'cloudtrail': return 'blue'
    default: return 'gray'
  }
})

const queryTypeLabel = computed(() => {
  switch (props.queryType) {
    case 'config': return 'AWS Config'
    case 'cloudwatch': return 'CloudWatch Logs'
    case 'cloudtrail': return 'CloudTrail'
    default: return props.queryType
  }
})

// Build table columns from schema or infer from records
const tableColumns = computed(() => {
  if (props.attributeSchema && props.attributeSchema.length > 0) {
    return props.attributeSchema.map(attr => ({
      key: attr.name,
      label: attr.label,
      type: attr.type
    }))
  }

  // Infer from first record
  if (props.records.length === 0) return []

  const firstRecord = props.records[0]
  return Object.keys(firstRecord).map(key => ({
    key,
    label: formatLabel(key),
    type: inferType(firstRecord[key])
  }))
})

// Sorting
function sortBy(column: string) {
  if (sortColumn.value === column) {
    sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortColumn.value = column
    sortDirection.value = 'asc'
  }
  currentPage.value = 1
}

const sortedRecords = computed(() => {
  if (!sortColumn.value) return props.records

  return [...props.records].sort((a, b) => {
    const aVal = a[sortColumn.value]
    const bVal = b[sortColumn.value]

    if (aVal === bVal) return 0
    if (aVal === null || aVal === undefined) return 1
    if (bVal === null || bVal === undefined) return -1

    const comparison = aVal < bVal ? -1 : 1
    return sortDirection.value === 'asc' ? comparison : -comparison
  })
})

// Pagination
const totalPages = computed(() => Math.ceil(sortedRecords.value.length / pageSize))
const startIndex = computed(() => (currentPage.value - 1) * pageSize)
const endIndex = computed(() => Math.min(startIndex.value + pageSize, sortedRecords.value.length))
const paginatedRecords = computed(() => sortedRecords.value.slice(startIndex.value, endIndex.value))

// JSON view
const formattedJson = computed(() => JSON.stringify(props.records, null, 2))

// Export menu
const exportMenuItems = computed(() => [
  [{
    label: 'Copy as JSON',
    icon: 'i-heroicons-clipboard-document',
    click: () => copyToClipboard('json')
  }],
  [{
    label: 'Copy as CSV',
    icon: 'i-heroicons-table-cells',
    click: () => copyToClipboard('csv')
  }]
])

// Helpers
function formatLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim()
}

function inferType(value: any): string {
  if (value === null || value === undefined) return 'string'
  if (Array.isArray(value)) return 'array'
  if (value instanceof Date) return 'date'
  if (typeof value === 'object') return 'object'
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return 'date'
  return 'string'
}

function formatDate(value: any): string {
  if (!value) return '-'
  try {
    const date = typeof value === 'number' ? new Date(value) : new Date(value)
    return date.toLocaleString()
  } catch {
    return String(value)
  }
}

function formatComplex(value: any): string {
  if (value === null || value === undefined) return '-'
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

async function copyToClipboard(format: 'json' | 'csv') {
  try {
    let text: string

    if (format === 'json') {
      text = JSON.stringify(props.records, null, 2)
    } else {
      // CSV format
      const columns = tableColumns.value.map(c => c.key)
      const header = columns.join(',')
      const rows = props.records.map(record =>
        columns.map(col => {
          const val = record[col]
          if (val === null || val === undefined) return ''
          if (typeof val === 'object') return `"${JSON.stringify(val).replace(/"/g, '""')}"`
          if (typeof val === 'string' && (val.includes(',') || val.includes('"') || val.includes('\n'))) {
            return `"${val.replace(/"/g, '""')}"`
          }
          return String(val)
        }).join(',')
      )
      text = [header, ...rows].join('\n')
    }

    await navigator.clipboard.writeText(text)
  } catch (err) {
    logger.error('Failed to copy to clipboard:', err)
  }
}

// Reset pagination when records change
watch(() => props.records, () => {
  currentPage.value = 1
})
</script>
