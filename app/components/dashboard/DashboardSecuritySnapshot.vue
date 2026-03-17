<template>
  <div class="h-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-2">
        <UIcon name="i-heroicons-shield-check" class="w-5 h-5 text-cyan-500" />
        <h2 class="text-sm font-semibold text-gray-900 dark:text-white">Security Snapshot</h2>
      </div>
      <UBadge v-if="!loading && riskLevel" :color="riskBadgeColor" variant="subtle" size="xs">
        {{ riskLevel }}
      </UBadge>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="space-y-3">
      <div class="animate-pulse h-16 bg-gray-100 dark:bg-gray-800 rounded-lg" />
      <div class="flex gap-2">
        <div v-for="i in 4" :key="i" class="animate-pulse h-8 flex-1 bg-gray-100 dark:bg-gray-800 rounded-lg" />
      </div>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="text-center py-4">
      <p class="text-xs text-gray-500 dark:text-gray-400">Unable to load security data</p>
    </div>

    <template v-else>
      <!-- Full mode: ring + severity pills + accounts at risk + compliance + recommendations -->
      <div v-if="displayStyle === 'full'" class="space-y-4">
        <!-- Risk score ring + compliance rate -->
        <div class="flex items-center gap-4">
          <div class="relative w-16 h-16 flex-shrink-0">
            <svg viewBox="0 0 36 36" class="w-full h-full -rotate-90">
              <circle cx="18" cy="18" r="15.5" fill="none" stroke-width="3"
                class="stroke-gray-100 dark:stroke-gray-800" />
              <circle cx="18" cy="18" r="15.5" fill="none" stroke-width="3"
                stroke-linecap="round"
                :class="riskStrokeColor"
                :stroke-dasharray="`${riskScorePercent} 100`" />
            </svg>
            <div class="absolute inset-0 flex items-center justify-center">
              <span class="text-sm font-bold text-gray-900 dark:text-white">{{ riskScore }}</span>
            </div>
          </div>
          <div class="flex-1">
            <p class="text-xs text-gray-500 dark:text-gray-400">Org Risk Score</p>
            <p class="text-sm font-medium text-gray-900 dark:text-white">{{ totalFindings }} finding{{ totalFindings !== 1 ? 's' : '' }}</p>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              <span :class="complianceRate >= 80 ? 'text-green-600 dark:text-green-400' : complianceRate >= 50 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'" class="font-semibold">{{ complianceRate }}%</span>
              compliance
            </p>
          </div>
        </div>

        <!-- Severity counts -->
        <div class="flex gap-2">
          <div v-for="sev in severityCounts" :key="sev.label" class="flex-1 text-center px-2 py-1.5 rounded-lg" :class="sev.bg">
            <p class="text-xs font-bold" :class="sev.text">{{ sev.count }}</p>
            <p class="text-[10px]" :class="sev.text">{{ sev.label }}</p>
          </div>
        </div>

        <!-- Top accounts at risk -->
        <div v-if="topAccountsAtRisk.length > 0" class="space-y-1.5">
          <p class="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Top Accounts at Risk</p>
          <NuxtLink
            v-for="account in topAccountsAtRisk"
            :key="account.accountId"
            :to="`/account/${account.accountId}?tab=3`"
            class="flex items-center justify-between py-1 px-2 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group"
          >
            <span class="text-xs text-gray-700 dark:text-gray-300 truncate group-hover:text-gray-900 dark:group-hover:text-white">{{ account.accountName }}</span>
            <UBadge
              :color="account.riskScore >= 80 ? 'red' : account.riskScore >= 50 ? 'orange' : 'yellow'"
              variant="subtle"
              size="xs"
            >
              {{ account.riskScore }}
            </UBadge>
          </NuxtLink>
        </div>

        <!-- Top recommendations -->
        <div v-if="recommendations.length > 0" class="space-y-1.5">
          <p class="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Top Recommendations</p>
          <p v-for="(rec, i) in recommendations.slice(0, 2)" :key="i" class="text-xs text-gray-600 dark:text-gray-400 flex items-start gap-1.5">
            <UIcon name="i-heroicons-light-bulb" class="w-3.5 h-3.5 text-yellow-500 flex-shrink-0 mt-0.5" />
            <span class="line-clamp-1">{{ rec }}</span>
          </p>
        </div>

        <NuxtLink to="/security" class="block text-center">
          <UButton size="xs" variant="ghost" color="cyan">View Full Report</UButton>
        </NuxtLink>
      </div>

      <!-- Half mode: severity counts + risk badge + compliance -->
      <div v-else class="space-y-3">
        <div class="flex items-center gap-3">
          <span class="text-lg font-bold text-gray-900 dark:text-white">{{ riskScore }}</span>
          <span class="text-xs text-gray-500 dark:text-gray-400">risk score</span>
          <span class="text-xs ml-auto" :class="complianceRate >= 80 ? 'text-green-600 dark:text-green-400' : complianceRate >= 50 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'">
            {{ complianceRate }}% compliant
          </span>
        </div>
        <div class="flex gap-2">
          <div v-for="sev in severityCounts" :key="sev.label" class="flex-1 text-center px-2 py-1.5 rounded-lg" :class="sev.bg">
            <p class="text-xs font-bold" :class="sev.text">{{ sev.count }}</p>
            <p class="text-[10px]" :class="sev.text">{{ sev.label }}</p>
          </div>
        </div>
        <NuxtLink to="/security" class="block text-center">
          <UButton size="xs" variant="ghost" color="cyan">View Report</UButton>
        </NuxtLink>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { DisplayStyle } from '#shared/types/dashboard-layout'
import type { AccountRiskEntry } from '#shared/types/security-dashboard'

const props = withDefaults(defineProps<{
  displayStyle?: DisplayStyle
}>(), { displayStyle: 'full' })

const loading = ref(true)
const error = ref(false)
const riskScore = ref(0)
const totalFindings = ref(0)
const critical = ref(0)
const high = ref(0)
const medium = ref(0)
const low = ref(0)
const complianceRate = ref(100)
const recommendations = ref<string[]>([])
const riskLevel = ref('')
const topAccountsAtRisk = ref<AccountRiskEntry[]>([])

const riskScorePercent = computed(() => Math.min(riskScore.value, 100))

const riskBadgeColor = computed(() => {
  if (riskScore.value >= 75) return 'red' as const
  if (riskScore.value >= 50) return 'orange' as const
  if (riskScore.value >= 25) return 'yellow' as const
  return 'green' as const
})

const riskStrokeColor = computed(() => {
  if (riskScore.value >= 75) return 'stroke-red-500'
  if (riskScore.value >= 50) return 'stroke-orange-500'
  if (riskScore.value >= 25) return 'stroke-yellow-500'
  return 'stroke-green-500'
})

const severityCounts = computed(() => [
  { label: 'Critical', count: critical.value, bg: 'bg-red-50 dark:bg-red-900/20', text: 'text-red-700 dark:text-red-300' },
  { label: 'High', count: high.value, bg: 'bg-orange-50 dark:bg-orange-900/20', text: 'text-orange-700 dark:text-orange-300' },
  { label: 'Medium', count: medium.value, bg: 'bg-yellow-50 dark:bg-yellow-900/20', text: 'text-yellow-700 dark:text-yellow-300' },
  { label: 'Low', count: low.value, bg: 'bg-green-50 dark:bg-green-900/20', text: 'text-green-700 dark:text-green-300' },
])

function generateRecommendations(data: any): string[] {
  const recs: string[] = []
  const sev = data.severityBreakdown || {}
  if (sev.CRITICAL > 0) recs.push(`Address ${sev.CRITICAL} critical finding(s) immediately`)
  if (sev.HIGH > 0) recs.push(`Review and remediate ${sev.HIGH} high severity finding(s)`)
  if (data.accountsAtRisk > 0) recs.push(`${data.accountsAtRisk} account(s) have elevated risk scores`)
  if (recs.length === 0) recs.push('Security posture is healthy - continue monitoring')
  return recs
}

onMounted(async () => {
  try {
    const res = await $fetch<{ success: boolean; data: any }>('/api/security/org-summary')
    if (res.success && res.data) {
      const data = res.data
      riskScore.value = data.orgRiskScore || 0
      totalFindings.value = data.totalFindings || 0
      complianceRate.value = data.complianceRate ?? 100

      const sev = data.severityBreakdown || {}
      critical.value = sev.CRITICAL || 0
      high.value = sev.HIGH || 0
      medium.value = sev.MEDIUM || 0
      low.value = sev.LOW || 0

      // Top 3 accounts at risk for full mode
      const ranking = data.accountRiskRanking || []
      topAccountsAtRisk.value = ranking.filter((a: AccountRiskEntry) => a.riskScore > 0).slice(0, 3)

      recommendations.value = generateRecommendations(data)
      riskLevel.value = riskScore.value >= 80 ? 'Critical' : riskScore.value >= 50 ? 'High' : riskScore.value >= 20 ? 'Medium' : 'Low'
    }
  } catch {
    error.value = true
  } finally {
    loading.value = false
  }
})
</script>
