<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <div class="text-base font-semibold text-gray-900 dark:text-white">Top Critical / High Findings</div>
        <UBadge color="gray" variant="soft" size="sm">{{ (findings || []).length }} shown</UBadge>
      </div>
    </template>

    <UTable :rows="findings" :columns="columns" @select="onRowClick" class="cursor-pointer">
      <template #severity-data="{ row }">
        <UBadge :color="severityColor(row.severity)" variant="subtle" size="sm">
          {{ row.severity }}
        </UBadge>
      </template>

      <template #title-data="{ row }">
        <div class="max-w-xs truncate text-sm text-gray-900 dark:text-white" :title="row.title">
          {{ row.title }}
        </div>
      </template>

      <template #accountName-data="{ row }">
        <NuxtLink :to="`/account/${row.accountId}?tab=3`" class="text-sm text-primary-600 dark:text-primary-400 hover:underline" @click.stop>
          {{ row.accountName }}
        </NuxtLink>
      </template>

      <template #resourceType-data="{ row }">
        <div class="text-sm text-gray-500 dark:text-gray-400 font-mono text-xs">
          {{ shortResourceType(row.resourceType) }}
        </div>
      </template>
    </UTable>
  </UCard>
</template>

<script setup lang="ts">
import type { SecurityFindingSummary } from '#shared/types/security-dashboard'

const props = defineProps<{
  findings: SecurityFindingSummary[]
}>()

const router = useRouter()

function onRowClick(row: SecurityFindingSummary) {
  router.push(`/account/${row.accountId}?tab=3`)
}

const columns = [
  { key: 'severity', label: 'Severity' },
  { key: 'title', label: 'Title' },
  { key: 'accountName', label: 'Account' },
  { key: 'productName', label: 'Product' },
  { key: 'resourceType', label: 'Resource Type' },
  { key: 'region', label: 'Region' },
]

function severityColor(severity: string): 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'gray' {
  switch (severity) {
    case 'CRITICAL': return 'red'
    case 'HIGH': return 'orange'
    case 'MEDIUM': return 'yellow'
    case 'LOW': return 'green'
    case 'INFORMATIONAL': return 'blue'
    default: return 'gray'
  }
}

// Strip the "Aws" prefix from resource types for concise display (e.g. AwsEc2Instance -> Ec2Instance)
function shortResourceType(rt: string): string {
  return rt.replace(/^Aws/, '')
}
</script>
