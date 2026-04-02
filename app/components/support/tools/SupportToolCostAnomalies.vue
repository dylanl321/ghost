<template>
  <div class="space-y-4">
    <div class="text-sm text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
      <Icon name="i-heroicons-information-circle" class="w-4 h-4 inline mr-1" />
      Cost Anomalies uses Commercial AWS (Cost Explorer is not available in GovCloud).
      {{ supportContext.state.mode === 'account' && supportContext.state.accountId ? `Using account: ${supportContext.state.accountName || supportContext.state.accountId}` : 'Leave account unselected to check all accounts.' }}
    </div>
    <div class="flex gap-4 flex-wrap">
      <USelect v-model="daysBack" :options="daysBackOptions" class="w-40" />
      <UButton color="primary" :loading="loading" @click="fetchCostAnomalies">
        <Icon name="i-heroicons-currency-dollar" class="w-4 h-4 mr-1" />
        Check
      </UButton>
    </div>

    <div v-if="data" class="space-y-4">
      <div class="grid grid-cols-3 gap-4">
        <div class="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 text-center">
          <div class="text-2xl font-bold text-red-600">{{ data.summary.ongoingAnomalies }}</div>
          <div class="text-xs text-gray-500">Ongoing</div>
        </div>
        <div class="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 text-center">
          <div class="text-2xl font-bold text-green-600">{{ data.summary.resolvedAnomalies }}</div>
          <div class="text-xs text-gray-500">Resolved</div>
        </div>
        <div class="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 text-center">
          <div class="text-2xl font-bold text-amber-600">${{ data.summary.totalImpact.toFixed(0) }}</div>
          <div class="text-xs text-gray-500">Total Impact</div>
        </div>
      </div>

      <div v-if="data.anomalies.length > 0" class="space-y-2">
        <div class="flex items-center justify-between">
          <h4 class="font-medium text-gray-900 dark:text-white">Recent Anomalies</h4>
          <UButton size="xs" variant="ghost" color="gray" @click="exportData">
            <Icon name="i-heroicons-arrow-down-tray" class="w-4 h-4 mr-1" />
            Export
          </UButton>
        </div>
        <div v-for="anomaly in data.anomalies.slice(0, showAll ? undefined : 5)" :key="anomaly.anomalyId" class="bg-gray-50 dark:bg-gray-800/50 rounded p-3 text-sm">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full" :class="anomaly.status === 'ONGOING' ? 'bg-red-500 animate-pulse' : 'bg-green-500'" />
              <span class="text-gray-900 dark:text-white font-medium">{{ anomaly.service || 'Multiple services' }}</span>
            </div>
            <span class="font-medium text-amber-600">${{ anomaly.impact.toFixed(2) }}</span>
          </div>
          <div class="text-xs text-gray-500 mt-1 flex items-center gap-3">
            <span>{{ anomaly.startDate }}</span>
            <span class="text-amber-600 font-medium">{{ anomaly.impactPercentage }}% above expected</span>
          </div>
        </div>
        <UButton v-if="data.anomalies.length > 5" size="xs" variant="ghost" @click="showAll = !showAll">
          {{ showAll ? 'Show Less' : `Show All (${data.anomalies.length})` }}
        </UButton>
      </div>
    </div>

    <div v-if="error" class="bg-red-50 dark:bg-red-900/20 rounded-lg p-4">
      <div class="flex items-center gap-2 text-red-600 dark:text-red-400">
        <Icon name="i-heroicons-exclamation-triangle" class="w-5 h-5" />
        <span>{{ error }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const toast = useToast()
const supportContext = useSupportContext()

const daysBackOptions = [
  { label: 'Last 7 days', value: 7 },
  { label: 'Last 30 days', value: 30 },
  { label: 'Last 60 days', value: 60 },
  { label: 'Last 90 days', value: 90 }
]

const daysBack = ref(30)
const loading = ref(false)
const data = ref<any>(null)
const error = ref('')
const showAll = ref(false)

async function fetchCostAnomalies() {
  loading.value = true; error.value = ''; data.value = null

  let commercialAccountId: string | undefined
  if (supportContext.isAccountReady.value) {
    const enclaveStore = useEnclaveStore()
    const enclaves = Object.values(enclaveStore.enclaves || {})
    for (const account of enclaves) {
      if (!account) continue
      const commercialId = account.awsStandardAccountID || account.accountId
      const govCloudId = account.awsGovCloudAccountID
      if (commercialId === supportContext.state.accountId || govCloudId === supportContext.state.accountId) {
        commercialAccountId = commercialId; break
      }
    }
  }

  try {
    const response = await $fetch('/api/support/cost-anomalies', {
      params: { accountId: commercialAccountId || undefined, daysBack: daysBack.value, environment: 'commercial' }
    })
    data.value = (response as any).data
  } catch (err: any) {
    error.value = err.data?.error?.message || err.message || 'Failed to fetch cost anomalies'
  } finally { loading.value = false }
}

function exportData() {
  if (!data.value) return
  const blob = new Blob([JSON.stringify(data.value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = `cost-anomalies-${Date.now()}.json`; a.click()
  URL.revokeObjectURL(url)
  toast.add({ title: 'Cost data exported', icon: 'i-heroicons-arrow-down-tray', color: 'green', timeout: 2000 })
}
</script>
