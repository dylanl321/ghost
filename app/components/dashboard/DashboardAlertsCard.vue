<template>
  <div class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-2">
        <UIcon name="i-heroicons-bell-alert" class="w-5 h-5 text-amber-500" />
        <h2 class="text-sm font-semibold text-gray-900 dark:text-white">Budget Alerts</h2>
      </div>
      <NuxtLink to="/admin/budget-alerts" class="text-xs text-blue-500 hover:text-blue-400 transition-colors">
        View All →
      </NuxtLink>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="animate-pulse space-y-3">
      <div class="h-3 w-full bg-gray-200 dark:bg-gray-700 rounded" />
      <div class="h-3 w-3/4 bg-gray-200 dark:bg-gray-700 rounded" />
      <div class="h-3 w-1/2 bg-gray-200 dark:bg-gray-700 rounded" />
    </div>

    <!-- Error -->
    <div v-else-if="error" class="text-center py-4">
      <p class="text-xs text-gray-400">Unable to load alerts</p>
    </div>

    <!-- No alerts -->
    <div v-else-if="alerts.length === 0" class="text-center py-4">
      <UIcon name="i-heroicons-check-circle" class="w-8 h-8 text-green-500 mx-auto mb-2" />
      <p class="text-xs text-gray-500 dark:text-gray-400">No budget alerts this month</p>
    </div>

    <!-- Alerts list -->
    <div v-else class="space-y-2">
      <!-- Summary counts -->
      <div class="flex gap-3 mb-3">
        <div v-if="criticalCount > 0" class="flex items-center gap-1">
          <span class="w-2 h-2 rounded-full bg-red-500" />
          <span class="text-xs font-medium text-red-500">{{ criticalCount }} critical</span>
        </div>
        <div v-if="warningCount > 0" class="flex items-center gap-1">
          <span class="w-2 h-2 rounded-full bg-yellow-500" />
          <span class="text-xs font-medium text-yellow-500">{{ warningCount }} warning</span>
        </div>
        <div v-if="infoCount > 0" class="flex items-center gap-1">
          <span class="w-2 h-2 rounded-full bg-blue-500" />
          <span class="text-xs font-medium text-blue-400">{{ infoCount }} info</span>
        </div>
      </div>

      <!-- Recent alerts -->
      <div
        v-for="alert in recentAlerts"
        :key="alert.alert_id"
        class="flex items-start gap-2 py-1.5 border-t border-gray-100 dark:border-gray-800 first:border-0 first:pt-0"
      >
        <span class="w-2 h-2 rounded-full mt-1 shrink-0" :class="levelColor(alert.alert_level)" />
        <div class="min-w-0 flex-1">
          <p class="text-xs font-medium text-gray-900 dark:text-white truncate">
            {{ resolveAccountName(alert.account_id) }}
          </p>
          <p class="text-[10px] text-gray-500 dark:text-gray-400">
            {{ alert.alert_level }} - {{ formatCurrency(alert.actual_spend, 0) }} / {{ formatCurrency(alert.budget, 0) }}
          </p>
        </div>
        <span class="text-[10px] font-medium shrink-0" :class="alert.actual_spend > alert.budget ? 'text-red-500' : 'text-gray-400'">
          {{ alert.budget > 0 ? Math.round((alert.actual_spend / alert.budget) * 100) : 0 }}%
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const enclaveStore = useEnclaveStore()

interface BudgetAlert {
  alert_id: string
  account_id: string
  alert_level: string
  alert_type: string
  actual_spend: number
  budget: number
  burn_rate?: number
  projected_spend?: number
  created_at?: string
  timestamp?: string
}

const alerts = ref<BudgetAlert[]>([])
const loading = ref(true)
const error = ref(false)

const recentAlerts = computed(() => alerts.value.slice(0, 5))
const criticalCount = computed(() => alerts.value.filter(a => a.alert_level === 'CRITICAL' || a.alert_level === 'ESCALATION').length)
const warningCount = computed(() => alerts.value.filter(a => a.alert_level === 'WARNING').length)
const infoCount = computed(() => alerts.value.filter(a => a.alert_level === 'INFO').length)

function levelColor(level: string): string {
  switch (level) {
    case 'CRITICAL':
    case 'ESCALATION': return 'bg-red-500'
    case 'WARNING': return 'bg-yellow-500'
    default: return 'bg-blue-500'
  }
}

// Reactive account name resolution - re-evaluates when enclave store updates
function resolveAccountName(accountId: string): string {
  const enclave = enclaveStore.enclaves[accountId]
  if (enclave) {
    return enclave.projectName || enclave.accountName || accountId
  }
  return accountId
}

onMounted(async () => {
  try {
    // Ensure enclaves are loaded so we can resolve account names
    if (Object.keys(enclaveStore.enclaves).length === 0) {
      await enclaveStore.initialize()
    }

    const now = new Date()
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const result = await $fetch<{ success: boolean; data: BudgetAlert[] }>(`/api/alerts/list?month=${month}&limit=20&sortOrder=desc`)
    if (result.success && Array.isArray(result.data)) {
      // Sort by most recent first
      alerts.value = result.data.sort((a, b) =>
        (b.created_at || b.timestamp || '').localeCompare(a.created_at || a.timestamp || '')
      )
    }
  } catch {
    error.value = true
  } finally {
    loading.value = false
  }
})
</script>
