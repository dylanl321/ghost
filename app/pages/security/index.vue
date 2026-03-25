<template>
  <div class="p-6 space-y-6">
    <!-- Page Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Security Health Dashboard</h1>
        <p v-if="summary" class="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Last updated: {{ new Date(summary.lastUpdated).toLocaleString() }}
          <span v-if="dataAgeText" class="ml-2 text-xs">({{ dataAgeText }})</span>
        </p>
      </div>
      <ClientOnly>
        <UTooltip text="Recompute from Security Hub (takes ~30-60s)">
          <UButton
            icon="i-heroicons-arrow-path"
            color="gray"
            variant="soft"
            :loading="loading"
            @click="refreshData"
          >
            Refresh
          </UButton>
        </UTooltip>
      </ClientOnly>
    </div>

    <!-- Loading Progress Panel -->
    <template v-if="loading && !summary">
      <div class="flex justify-center py-12">
        <UCard class="w-full max-w-lg">
          <template #header>
            <div class="flex items-center gap-3">
              <UIcon name="i-heroicons-shield-check" class="w-6 h-6 text-primary-500" />
              <span class="text-lg font-semibold text-gray-900 dark:text-white">Loading Security Data</span>
            </div>
          </template>

          <div class="space-y-4">
            <UProgress :value="progress.percent" />

            <p class="text-sm text-gray-600 dark:text-gray-300">
              {{ progress.message || 'Initializing...' }}
            </p>

            <div v-if="progress.region" class="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <span class="relative flex h-2 w-2">
                <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-400 opacity-75" />
                <span class="relative inline-flex rounded-full h-2 w-2 bg-primary-500" />
              </span>
              <span>Region: {{ progress.region }}</span>
            </div>

            <div v-if="progress.totalAccounts" class="flex items-center gap-2">
              <UBadge color="gray" variant="subtle" size="xs">
                {{ progress.totalAccounts }} accounts
              </UBadge>
            </div>

            <div v-if="progress.findingsSoFar" class="text-xs text-gray-500 dark:text-gray-400">
              {{ progress.findingsSoFar.toLocaleString() }} findings discovered
            </div>
          </div>
        </UCard>
      </div>
    </template>

    <!-- Error State -->
    <UCard v-else-if="errorMsg">
      <div class="flex flex-col items-center gap-3 py-8 text-center">
        <UIcon name="i-heroicons-exclamation-circle" class="w-10 h-10 text-red-500" />
        <div class="text-gray-900 dark:text-white font-medium">Failed to load security data</div>
        <div class="text-sm text-gray-500 dark:text-gray-400">{{ errorMsg }}</div>
        <UButton color="primary" variant="soft" @click="loadData">Retry</UButton>
      </div>
    </UCard>

    <!-- Dashboard Content -->
    <template v-else-if="summary">
      <!-- Metric Cards (always visible) -->
      <OrgSecurityMetricCards
        :total-findings="summary.totalFindings"
        :accounts-at-risk="summary.accountsAtRisk"
        :org-risk-score="summary.orgRiskScore"
        :compliance-rate="summary.complianceRate"
      />

      <!-- Tabbed Sections -->
      <UTabs v-model="activeTab" :items="tabs">
        <!-- Overview Tab -->
        <template #overview>
          <div class="space-y-6 pt-4">
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ClientOnly>
                <OrgSeverityChart :severity-breakdown="summary.severityBreakdown" />
                <template #fallback>
                  <div class="h-72 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
                </template>
              </ClientOnly>
              <ClientOnly>
                <OrgProductBreakdown :findings-by-product="summary.findingsByProduct" />
                <template #fallback>
                  <div class="h-72 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
                </template>
              </ClientOnly>
            </div>
            <OrgTopFindings :findings="summary.topFindings" />
          </div>
        </template>

        <!-- Analysis Tab -->
        <template #analysis>
          <div class="space-y-6 pt-4">
            <!-- Trend chart (full width) -->
            <ClientOnly>
              <OrgFindingsTrend :trend="summary.findingsTrend || []" />
              <template #fallback>
                <div class="h-80 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
              </template>
            </ClientOnly>

            <!-- Region + Age side by side -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ClientOnly>
                <OrgFindingsByRegion :findings-by-region="summary.findingsByRegion || {}" />
                <template #fallback>
                  <div class="h-72 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
                </template>
              </ClientOnly>
              <OrgFindingAge :age-buckets="summary.findingAgeBuckets || { under7Days: 0, under30Days: 0, under90Days: 0, over90Days: 0 }" />
            </div>

            <!-- Severity by Product heatmap (full width) -->
            <ClientOnly>
              <OrgSeverityByProduct :data="summary.severityByProduct || []" />
              <template #fallback>
                <div class="h-80 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
              </template>
            </ClientOnly>

            <!-- Compliance gauge + product breakdown side by side -->
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <OrgComplianceGauge
                :compliance-rate="summary.complianceRate"
                :passed="compliancePassed"
                :failed="complianceFailed"
                @drill-down="openComplianceDrilldown"
              />
              <div class="lg:col-span-2">
                <ClientOnly>
                  <OrgProductBreakdown :findings-by-product="summary.findingsByProduct" />
                  <template #fallback>
                    <div class="h-72 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
                  </template>
                </ClientOnly>
              </div>
            </div>
          </div>
        </template>

        <!-- Accounts Tab -->
        <template #accounts>
          <div class="space-y-6 pt-4">
            <!-- Risk distribution summary -->
            <div class="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <UCard v-for="level in riskDistribution" :key="level.label">
                <div class="text-center">
                  <div class="text-2xl font-bold" :class="level.textClass">{{ level.count }}</div>
                  <div class="text-xs text-gray-500 dark:text-gray-400">{{ level.label }}</div>
                </div>
              </UCard>
            </div>

            <OrgAccountRiskTable :accounts="summary.accountRiskRanking" />
          </div>
        </template>

        <!-- Findings Tab -->
        <template #findings>
          <div class="space-y-6 pt-4">
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ClientOnly>
                <OrgSeverityChart :severity-breakdown="summary.severityBreakdown" />
                <template #fallback>
                  <div class="h-72 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
                </template>
              </ClientOnly>
              <OrgFindingAge :age-buckets="summary.findingAgeBuckets || { under7Days: 0, under30Days: 0, under90Days: 0, over90Days: 0 }" />
            </div>
            <OrgTopFindings :findings="summary.topFindings" />
          </div>
        </template>
      </UTabs>

      <!-- Compliance drill-down slideover -->
      <GaugeDrilldownSlideover
        :open="complianceDrilldownOpen"
        :title="'Compliance Details'"
        :subtitle="`${complianceFailed} failed checks`"
        :findings="summary.topFindings"
        :filter-criteria="{ type: 'compliance', complianceStatus: 'FAILED' }"
        @update:open="complianceDrilldownOpen = $event"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import type { OrgSecuritySummary } from '#shared/types/security-dashboard'

useHead({ title: 'Security Health Dashboard' })

const loading = ref(true)
const errorMsg = ref<string | null>(null)
const summary = ref<OrgSecuritySummary | null>(null)
const activeTab = ref(0)
const complianceDrilldownOpen = ref(false)

function openComplianceDrilldown() {
  complianceDrilldownOpen.value = true
}

const progress = reactive({
  stage: '',
  message: '',
  percent: 0,
  totalAccounts: 0,
  region: '',
  findingsSoFar: 0,
})

let eventSource: EventSource | null = null

const tabs = [
  { label: 'Overview', slot: 'overview', icon: 'i-heroicons-chart-pie' },
  { label: 'Analysis', slot: 'analysis', icon: 'i-heroicons-chart-bar-square' },
  { label: 'Accounts', slot: 'accounts', icon: 'i-heroicons-building-office-2' },
  { label: 'Findings', slot: 'findings', icon: 'i-heroicons-shield-exclamation' },
]

/** Derive compliance passed/failed from the complianceRate and total findings */
const compliancePassed = computed(() => {
  if (!summary.value) return 0
  const total = summary.value.totalFindings
  return Math.round(total * summary.value.complianceRate / 100)
})
const complianceFailed = computed(() => {
  if (!summary.value) return 0
  return summary.value.totalFindings - compliancePassed.value
})

/** Risk distribution across account risk levels */
const riskDistribution = computed(() => {
  const accounts = summary.value?.accountRiskRanking || []
  const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, MINIMAL: 0 }
  for (const a of accounts) {
    if (a.riskLevel in counts) counts[a.riskLevel as keyof typeof counts]++
  }
  return [
    { label: 'Critical', count: counts.CRITICAL, textClass: 'text-red-600 dark:text-red-400' },
    { label: 'High', count: counts.HIGH, textClass: 'text-orange-600 dark:text-orange-400' },
    { label: 'Medium', count: counts.MEDIUM, textClass: 'text-yellow-600 dark:text-yellow-400' },
    { label: 'Low', count: counts.LOW, textClass: 'text-green-600 dark:text-green-400' },
    { label: 'Minimal', count: counts.MINIMAL, textClass: 'text-gray-500 dark:text-gray-400' },
  ]
})

/** Ensure all expected fields have defaults after DynamoDB roundtrip */
function normalizeSummary(raw: any): OrgSecuritySummary {
  return {
    totalFindings: raw.totalFindings ?? 0,
    totalAccounts: raw.totalAccounts ?? 0,
    accountsAtRisk: raw.accountsAtRisk ?? 0,
    orgRiskScore: raw.orgRiskScore ?? 0,
    complianceRate: raw.complianceRate ?? 100,
    severityBreakdown: raw.severityBreakdown ?? { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFORMATIONAL: 0 },
    findingsByProduct: raw.findingsByProduct ?? {},
    accountRiskRanking: raw.accountRiskRanking ?? [],
    topFindings: raw.topFindings ?? [],
    lastUpdated: raw.lastUpdated ?? new Date().toISOString(),
    findingsByRegion: raw.findingsByRegion ?? {},
    findingsTrend: raw.findingsTrend ?? [],
    severityByProduct: raw.severityByProduct ?? [],
    findingAgeBuckets: raw.findingAgeBuckets ?? { under7Days: 0, under30Days: 0, under90Days: 0, over90Days: 0 },
  }
}

const dataAgeText = computed(() => {
  if (!summary.value?.lastUpdated) return ''
  const ageMs = Date.now() - new Date(summary.value.lastUpdated).getTime()
  const hours = Math.floor(ageMs / 3600000)
  const minutes = Math.floor((ageMs % 3600000) / 60000)
  if (hours > 0) return `${hours}h ${minutes}m ago`
  if (minutes > 0) return `${minutes}m ago`
  return 'just now'
})

function resetProgress() {
  progress.stage = ''
  progress.message = ''
  progress.percent = 0
  progress.totalAccounts = 0
  progress.region = ''
  progress.findingsSoFar = 0
}

function closeEventSource() {
  if (eventSource) {
    eventSource.close()
    eventSource = null
  }
}

function openSSEStream(url: string) {
  loading.value = true
  errorMsg.value = null
  resetProgress()
  closeEventSource()

  eventSource = new EventSource(url)

  eventSource.addEventListener('progress', (e: MessageEvent) => {
    try {
      const data = JSON.parse(e.data)
      progress.stage = data.stage || ''
      progress.message = data.message || ''
      progress.percent = data.percent || 0
      if (data.totalAccounts) progress.totalAccounts = data.totalAccounts
      if (data.region) progress.region = data.region
      if (data.findingsSoFar) progress.findingsSoFar = data.findingsSoFar
    } catch { /* ignore parse errors */ }
  })

  eventSource.addEventListener('complete', (e: MessageEvent) => {
    try {
      const data = JSON.parse(e.data)
      if (data.success && data.data) {
        summary.value = normalizeSummary(data.data)
      } else {
        errorMsg.value = 'Unexpected response format'
      }
    } catch {
      errorMsg.value = 'Failed to parse security data'
    }
    loading.value = false
    closeEventSource()
  })

  eventSource.addEventListener('error', (e: MessageEvent) => {
    if (e.data) {
      try {
        const data = JSON.parse(e.data)
        errorMsg.value = data.message || 'Failed to load security data'
      } catch {
        errorMsg.value = 'Failed to load security data'
      }
    } else {
      errorMsg.value = 'Connection to server lost'
    }
    loading.value = false
    closeEventSource()
  })
}

/** Initial load: try instant API first, fall back to SSE stream */
async function loadData() {
  loading.value = true
  errorMsg.value = null
  try {
    const res = await $fetch<{ data: OrgSecuritySummary }>('/api/security/org-summary')
    if (res?.data) {
      summary.value = normalizeSummary(res.data)
      loading.value = false
      return
    }
  } catch {
    // No cached data available, fall through to SSE
  }
  openSSEStream('/api/security/org-summary-stream')
}

/** Refresh: always run Athena via SSE with progress */
function refreshData() {
  openSSEStream('/api/security/org-summary-stream?refresh=true')
}

onMounted(loadData)

onBeforeUnmount(closeEventSource)
</script>
