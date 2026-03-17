<template>
  <div>
    <UTable
      v-if="groups.length > 0"
      :rows="groups"
      :columns="columns"
      :ui="{ td: { base: 'text-xs' }, th: { base: 'text-xs' } }"
    >
      <template #cveId-data="{ row }">
        <a
          :href="`https://nvd.nist.gov/vuln/detail/${row.cveId}`"
          target="_blank"
          rel="noopener noreferrer"
          class="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 font-mono text-xs underline"
        >
          {{ row.cveId }}
        </a>
      </template>
      <template #title-data="{ row }">
        <span class="line-clamp-2">{{ row.title }}</span>
      </template>
      <template #severity-data="{ row }">
        <UBadge :color="severityColor(row.severity)" variant="soft" size="xs">
          {{ row.severity }}
        </UBadge>
      </template>
    </UTable>

    <div v-if="groups.length === 0" class="flex flex-col items-center justify-center py-10 gap-2">
      <UIcon name="i-heroicons-bug-ant" class="w-10 h-10 text-gray-300" />
      <p class="text-sm text-gray-500">No Inspector CVE findings for this account</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CveFindingGroup } from '../../../../shared/types/security-dashboard'
import type { FindingSeverity } from '../../../../shared/types/security-hub'

defineProps<{
  groups: CveFindingGroup[]
}>()

const columns = [
  { key: 'cveId', label: 'CVE ID' },
  { key: 'title', label: 'Title' },
  { key: 'count', label: 'Count', sortable: true },
  { key: 'severity', label: 'Severity' },
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
