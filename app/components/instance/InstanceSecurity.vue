<template>
  <div class="space-y-4 mt-4">
    <div v-if="!health" class="text-center py-12">
      <UIcon name="i-heroicons-shield-exclamation" class="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
      <p class="text-gray-500 dark:text-gray-400">Health data unavailable</p>
      <p class="text-xs text-gray-400 mt-1">Ensure Security Hub, Inspector, and SSM are enabled</p>
    </div>

    <template v-else>
      <!-- Partial Data Warning -->
      <div v-if="health.partialData" class="flex items-center gap-2 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800/30 text-sm text-yellow-700 dark:text-yellow-400">
        <UIcon name="i-heroicons-exclamation-triangle" class="w-4 h-4 flex-shrink-0" />
        <span>Some health data is unavailable — results may be incomplete</span>
      </div>

      <!-- Health Score Summary -->
      <UCard>
        <div class="flex items-center gap-6">
          <div class="text-center">
            <div class="text-5xl font-bold" :class="scoreColor">{{ health.healthScore }}</div>
            <UBadge :color="statusBadgeColor" variant="soft" class="mt-1">{{ health.healthStatus }}</UBadge>
          </div>
          <div class="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div class="text-center p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
              <div class="text-lg font-semibold" :class="health.securityFindings?.critical > 0 ? 'text-red-600' : 'text-gray-900 dark:text-white'">
                {{ health.securityFindings?.critical || 0 }}
              </div>
              <div class="text-xs text-gray-500">Critical</div>
            </div>
            <div class="text-center p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
              <div class="text-lg font-semibold" :class="health.securityFindings?.high > 0 ? 'text-orange-600' : 'text-gray-900 dark:text-white'">
                {{ health.securityFindings?.high || 0 }}
              </div>
              <div class="text-xs text-gray-500">High</div>
            </div>
            <div class="text-center p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
              <div class="text-lg font-semibold text-gray-900 dark:text-white">{{ health.securityFindings?.medium || 0 }}</div>
              <div class="text-xs text-gray-500">Medium</div>
            </div>
            <div class="text-center p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
              <div class="text-lg font-semibold text-gray-900 dark:text-white">{{ health.securityFindings?.low || 0 }}</div>
              <div class="text-xs text-gray-500">Low</div>
            </div>
          </div>
        </div>
      </UCard>

      <!-- Security Findings -->
      <UCard v-if="health.securityFindings?.findings?.length">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-shield-exclamation" class="w-4 h-4 text-gray-400" />
            <span class="font-semibold text-sm">Security Hub Findings</span>
            <UBadge color="gray" variant="soft" size="xs">{{ health.securityFindings.findings.length }}</UBadge>
          </div>
        </template>
        <div class="space-y-2">
          <div v-for="finding in health.securityFindings.findings" :key="finding.id" class="flex items-start gap-3 py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
            <UBadge :color="severityColor(finding.severity)" variant="soft" size="xs" class="mt-0.5">{{ finding.severity }}</UBadge>
            <div class="flex-1 min-w-0">
              <div class="text-sm font-medium text-gray-900 dark:text-white truncate">{{ finding.title }}</div>
              <div class="text-xs text-gray-500">{{ finding.productName }}</div>
            </div>
          </div>
        </div>
      </UCard>

      <!-- Vulnerabilities -->
      <UCard v-if="health.vulnerabilities?.findings?.length">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-bug-ant" class="w-4 h-4 text-gray-400" />
            <span class="font-semibold text-sm">Vulnerabilities</span>
            <UBadge color="gray" variant="soft" size="xs">{{ health.vulnerabilities.findings.length }}</UBadge>
          </div>
        </template>
        <div class="space-y-2">
          <div v-for="vuln in health.vulnerabilities.findings" :key="vuln.id" class="flex items-start gap-3 py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
            <UBadge :color="severityColor(vuln.severity)" variant="soft" size="xs" class="mt-0.5">{{ vuln.severity }}</UBadge>
            <div class="flex-1 min-w-0">
              <div class="text-sm font-medium text-gray-900 dark:text-white truncate">{{ vuln.title }}</div>
              <div class="flex items-center gap-2 text-xs text-gray-500">
                <span v-if="vuln.packageName">{{ vuln.packageName }}</span>
                <span v-for="cve in vuln.cveIds?.slice(0, 2)" :key="cve" class="font-mono">{{ cve }}</span>
              </div>
            </div>
          </div>
        </div>
      </UCard>

      <!-- Alarms -->
      <UCard v-if="health.alarms?.alarms?.length">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-bell-alert" class="w-4 h-4 text-gray-400" />
            <span class="font-semibold text-sm">CloudWatch Alarms</span>
            <UBadge v-if="health.alarms.inAlarm > 0" color="red" variant="soft" size="xs">{{ health.alarms.inAlarm }} in alarm</UBadge>
          </div>
        </template>
        <div class="space-y-2">
          <div v-for="alarm in health.alarms.alarms" :key="alarm.name" class="flex items-center gap-3 py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
            <UBadge :color="alarm.state === 'ALARM' ? 'red' : alarm.state === 'OK' ? 'green' : 'gray'" variant="soft" size="xs">{{ alarm.state }}</UBadge>
            <div class="flex-1 min-w-0">
              <div class="text-sm text-gray-900 dark:text-white truncate">{{ alarm.name }}</div>
              <div class="text-xs text-gray-500">{{ alarm.metricName }}</div>
            </div>
          </div>
        </div>
      </UCard>

      <!-- Recommendations -->
      <UCard v-if="health.recommendations?.length">
        <template #header>
          <span class="font-semibold text-sm">Recommendations</span>
        </template>
        <div class="space-y-2">
          <div v-for="rec in health.recommendations" :key="rec" class="flex items-start gap-2 text-sm">
            <UIcon name="i-heroicons-light-bulb" class="w-4 h-4 text-yellow-500 mt-0.5 flex-shrink-0" />
            <span class="text-gray-700 dark:text-gray-300">{{ rec }}</span>
          </div>
        </div>
      </UCard>
    </template>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  health: any | null
  instanceId: string
}>()

function severityColor(severity: string): string {
  const map: Record<string, string> = { CRITICAL: 'red', HIGH: 'orange', MEDIUM: 'yellow', LOW: 'blue', INFORMATIONAL: 'gray' }
  return map[severity] || 'gray'
}

const scoreColor = computed(() => {
  const score = props.health?.healthScore ?? 0
  if (score >= 90) return 'text-green-600 dark:text-green-400'
  if (score >= 70) return 'text-yellow-600 dark:text-yellow-400'
  return 'text-red-600 dark:text-red-400'
})

const statusBadgeColor = computed(() => {
  const status = props.health?.healthStatus
  if (status === 'HEALTHY') return 'green'
  if (status === 'WARNING') return 'yellow'
  if (status === 'CRITICAL') return 'red'
  return 'gray'
})
</script>
