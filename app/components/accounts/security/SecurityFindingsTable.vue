<template>
  <div class="space-y-3">
    <UTable
      :rows="paginatedRows"
      :columns="columns"
      :ui="{ wrapper: 'overflow-x-auto' }"
    >
      <!-- Severity badge -->
      <template #severity-data="{ row }">
        <UBadge :color="severityColor(row.severity)" variant="soft" size="xs" class="font-semibold">
          {{ row.severity }}
        </UBadge>
      </template>

      <!-- Title with expandable detail -->
      <template #title-data="{ row }">
        <div>
          <button
            class="text-left text-sm font-medium text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            @click="toggleExpanded(row.id)"
          >
            {{ row.title }}
          </button>
          <!-- Expanded detail row -->
          <div v-if="expandedIds.has(row.id)" class="mt-2 p-3 rounded-lg bg-gray-50 dark:bg-gray-800 text-xs text-gray-600 dark:text-gray-300 space-y-1">
            <div v-if="row.recommendation">
              <span class="font-semibold">Recommendation:</span> {{ row.recommendation }}
            </div>
            <div v-if="row.remediationUrl">
              <a :href="row.remediationUrl" target="_blank" rel="noopener noreferrer" class="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                <UIcon name="i-heroicons-arrow-top-right-on-square" class="w-3 h-3" />
                Remediation Guide
              </a>
            </div>
            <div v-if="!row.recommendation && !row.remediationUrl" class="text-gray-500 italic">
              No remediation details available
            </div>
          </div>
        </div>
      </template>

      <!-- Product -->
      <template #productName-data="{ row }">
        <span class="text-sm text-gray-700 dark:text-gray-300">{{ row.productName }}</span>
      </template>

      <!-- Resource type -->
      <template #resourceType-data="{ row }">
        <span class="text-xs text-gray-500 dark:text-gray-400 font-mono">{{ row.resourceType }}</span>
      </template>

      <!-- Region -->
      <template #region-data="{ row }">
        <span class="text-xs text-gray-500 dark:text-gray-400">{{ row.region }}</span>
      </template>

      <!-- Updated at -->
      <template #updatedAt-data="{ row }">
        <span class="text-xs text-gray-500 dark:text-gray-400">{{ formatDate(row.updatedAt) }}</span>
      </template>
    </UTable>

    <!-- Pagination -->
    <div v-if="totalPages > 1" class="flex justify-between items-center pt-2">
      <span class="text-xs text-gray-500 dark:text-gray-400">
        Showing {{ startIndex + 1 }}-{{ endIndex }} of {{ props.findings.length }}
      </span>
      <UPagination
        v-model="currentPage"
        :page-count="PAGE_SIZE"
        :total="props.findings.length"
        size="xs"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { SecurityFindingSummary } from '../../../../shared/types/security-dashboard'

const props = defineProps<{
  findings: SecurityFindingSummary[]
}>()

const PAGE_SIZE = 10
const currentPage = ref(1)

const columns = [
  { key: 'severity', label: 'Severity' },
  { key: 'title', label: 'Title' },
  { key: 'productName', label: 'Product' },
  { key: 'resourceType', label: 'Resource Type' },
  { key: 'region', label: 'Region' },
  { key: 'updatedAt', label: 'Updated' }
]

const startIndex = computed(() => (currentPage.value - 1) * PAGE_SIZE)
const endIndex = computed(() => Math.min(startIndex.value + PAGE_SIZE, props.findings.length))
const totalPages = computed(() => Math.ceil(props.findings.length / PAGE_SIZE))

const paginatedRows = computed(() =>
  props.findings.slice(startIndex.value, endIndex.value)
)

// Track which rows are expanded to show recommendation details
const expandedIds = ref(new Set<string>())

function toggleExpanded(id: string) {
  if (expandedIds.value.has(id)) {
    expandedIds.value.delete(id)
  } else {
    expandedIds.value.add(id)
  }
  // Trigger reactivity
  expandedIds.value = new Set(expandedIds.value)
}

function severityColor(severity: string) {
  switch (severity) {
    case 'CRITICAL': return 'red'
    case 'HIGH': return 'orange'
    case 'MEDIUM': return 'yellow'
    case 'LOW': return 'green'
    default: return 'blue'
  }
}

function formatDate(iso: string) {
  if (!iso) return '-'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
</script>
