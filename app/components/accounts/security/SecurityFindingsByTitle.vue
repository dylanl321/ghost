<template>
  <div>
    <UTable
      v-if="groups.length > 0"
      :rows="paginatedRows"
      :columns="columns"
      :ui="{ td: { base: 'text-xs' }, th: { base: 'text-xs' } }"
    >
      <template #title-data="{ row }">
        <span class="line-clamp-2">{{ row.title }}</span>
      </template>
      <template #severity-data="{ row }">
        <UBadge :color="severityColor(row.severity)" variant="soft" size="xs">
          {{ row.severity }}
        </UBadge>
      </template>
      <template #productName-data="{ row }">
        <span class="text-gray-600 dark:text-gray-400">{{ row.productName }}</span>
      </template>
    </UTable>

    <!-- Pagination -->
    <div v-if="totalPages > 1" class="flex justify-center mt-4">
      <UPagination v-model="currentPage" :total="groups.length" :page-count="pageSize" />
    </div>

    <div v-if="groups.length === 0" class="flex flex-col items-center justify-center py-10 gap-2">
      <UIcon name="i-heroicons-document-magnifying-glass" class="w-10 h-10 text-gray-300" />
      <p class="text-sm text-gray-500">No findings title data available</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TitleFindingGroup } from '../../../../shared/types/security-dashboard'
import type { FindingSeverity } from '../../../../shared/types/security-hub'

const props = defineProps<{
  groups: TitleFindingGroup[]
}>()

const pageSize = 15
const currentPage = ref(1)

const totalPages = computed(() => Math.ceil(props.groups.length / pageSize))

const paginatedRows = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  return props.groups.slice(start, start + pageSize)
})

const columns = [
  { key: 'title', label: 'Finding Title' },
  { key: 'count', label: 'Count', sortable: true },
  { key: 'severity', label: 'Severity' },
  { key: 'productName', label: 'Product' },
]

function severityColor(severity: FindingSeverity): string {
  const map: Record<FindingSeverity, string> = {
    CRITICAL: 'red',
    HIGH: 'orange',
    MEDIUM: 'yellow',
    LOW: 'gray',
    INFORMATIONAL: 'blue',
  }
  return map[severity] || 'gray'
}
</script>
