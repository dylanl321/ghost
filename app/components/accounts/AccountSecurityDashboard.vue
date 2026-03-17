<template>
  <div class="space-y-4 mt-4">
    <!-- Loading shimmer -->
    <div v-if="loading" class="space-y-4">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <UCard v-for="i in 3" :key="i">
          <div class="animate-pulse space-y-3">
            <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
            <div class="h-32 bg-gray-200 dark:bg-gray-700 rounded" />
          </div>
        </UCard>
      </div>
      <UCard>
        <div class="animate-pulse space-y-3">
          <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4" />
          <div class="h-48 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>
      </UCard>
    </div>

    <!-- Error state -->
    <div v-else-if="error" class="flex flex-col items-center justify-center py-16 gap-4">
      <UIcon name="i-heroicons-exclamation-triangle" class="w-16 h-16 text-red-400 opacity-70" />
      <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Failed to load security data</h3>
      <p class="text-sm text-gray-500 dark:text-gray-400 text-center max-w-md">{{ error }}</p>
      <UButton icon="i-heroicons-arrow-path" variant="soft" color="blue" @click="loadData">
        Retry
      </UButton>
    </div>

    <!-- Data loaded -->
    <template v-else-if="data">
      <!-- Row 1: Risk gauge + severity donut + compliance gauge -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <UCard>
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon name="i-heroicons-shield-exclamation" class="w-4 h-4 text-red-400" />
              <span class="text-sm font-semibold text-gray-900 dark:text-white">Risk Score</span>
            </div>
          </template>
          <SecurityRiskGauge
            :risk-score="data.riskScore"
            :risk-level="data.riskLevel"
            :total-findings="data.totalFindings"
          />
        </UCard>

        <UCard>
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon name="i-heroicons-chart-pie" class="w-4 h-4 text-blue-400" />
              <span class="text-sm font-semibold text-gray-900 dark:text-white">Severity Breakdown</span>
            </div>
          </template>
          <ClientOnly>
            <SecuritySeverityBreakdown :severity-breakdown="data.severityBreakdown" />
            <template #fallback>
              <div class="h-48 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
            </template>
          </ClientOnly>
        </UCard>

        <UCard>
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon name="i-heroicons-clipboard-document-check" class="w-4 h-4 text-green-400" />
              <span class="text-sm font-semibold text-gray-900 dark:text-white">Compliance</span>
            </div>
          </template>
          <SecurityComplianceOverview :compliance="data.compliance" />
        </UCard>
      </div>

      <!-- Row 2: Product breakdown + recommendations -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <UCard class="md:col-span-2">
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon name="i-heroicons-squares-2x2" class="w-4 h-4 text-purple-400" />
              <span class="text-sm font-semibold text-gray-900 dark:text-white">Findings by Product</span>
            </div>
          </template>
          <ClientOnly>
            <SecurityProductBreakdown
              v-if="hasProductData"
              :findings-by-product="data.findingsByProduct"
            />
            <div v-else class="flex items-center justify-center py-10 text-gray-500 text-sm">
              No product data available
            </div>
            <template #fallback>
              <div class="h-48 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
            </template>
          </ClientOnly>
        </UCard>

        <UCard>
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon name="i-heroicons-light-bulb" class="w-4 h-4 text-yellow-400" />
              <span class="text-sm font-semibold text-gray-900 dark:text-white">Recommendations</span>
            </div>
          </template>
          <SecurityRecommendations :recommendations="data.recommendations" />
        </UCard>
      </div>

      <!-- Row 3: Findings table -->
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <UIcon name="i-heroicons-table-cells" class="w-4 h-4 text-gray-400" />
              <span class="text-sm font-semibold text-gray-900 dark:text-white">
                Top Findings
              </span>
              <UBadge color="gray" variant="soft" size="xs">{{ data.topFindings.length }}</UBadge>
            </div>
            <span class="text-xs text-gray-500 dark:text-gray-400">
              Last updated {{ formatLastUpdated(data.lastUpdated) }}
            </span>
          </div>
        </template>

        <div v-if="data.topFindings.length > 0">
          <SecurityFindingsTable :findings="data.topFindings" />
        </div>
        <div v-else class="flex flex-col items-center justify-center py-10 gap-2">
          <UIcon name="i-heroicons-shield-check" class="w-12 h-12 text-green-400 opacity-70" />
          <p class="text-sm text-gray-500 dark:text-gray-400">No active findings - great security posture!</p>
        </div>
      </UCard>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { AccountSecuritySummary } from '../../../shared/types/security-dashboard'

const props = defineProps<{
  accountId: string
}>()

const loading = ref(true)
const error = ref<string | null>(null)
const data = ref<AccountSecuritySummary | null>(null)

const hasProductData = computed(() =>
  data.value ? Object.keys(data.value.findingsByProduct).length > 0 : false
)

async function loadData() {
  loading.value = true
  error.value = null
  try {
    const res = await $fetch<{ data: AccountSecuritySummary }>(`/api/accounts/${props.accountId}/security-summary`)
    data.value = res.data
  } catch (err: any) {
    error.value = err?.data?.message || err?.message || 'Failed to load security data'
  } finally {
    loading.value = false
  }
}

function formatLastUpdated(iso: string) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

onMounted(loadData)
</script>
