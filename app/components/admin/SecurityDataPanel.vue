<template>
  <div class="space-y-6">
    <!-- Status Cards -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <!-- DynamoDB Store Card -->
      <UCard>
        <div class="space-y-3">
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-circle-stack" class="w-5 h-5 text-blue-500" />
            <h3 class="font-semibold text-gray-900 dark:text-white">DynamoDB Store</h3>
          </div>

          <div v-if="loading && !status" class="py-4 text-center">
            <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mx-auto"></div>
          </div>

          <template v-else-if="status?.dynamodb?.exists">
            <div class="space-y-2 text-sm">
              <div class="flex justify-between">
                <span class="text-gray-500 dark:text-gray-400">Computed</span>
                <span class="font-medium text-gray-900 dark:text-white">{{ formatDate(status.dynamodb.computedAt) }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-500 dark:text-gray-400">Age</span>
                <span class="font-medium" :class="ageColor">{{ formatAge(status.dynamodb.ageMinutes) }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-500 dark:text-gray-400">Compute Time</span>
                <span class="font-medium text-gray-900 dark:text-white">{{ formatDuration(status.dynamodb.durationMs) }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-500 dark:text-gray-400">Source</span>
                <UBadge color="blue" variant="subtle" size="xs">{{ status.dynamodb.source }}</UBadge>
              </div>
            </div>
          </template>

          <div v-else class="py-4 text-center">
            <UIcon name="i-heroicons-inbox" class="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
            <p class="text-sm text-gray-500 dark:text-gray-400">No data computed yet</p>
          </div>
        </div>
      </UCard>

      <!-- Memory Cache Card -->
      <UCard>
        <div class="space-y-3">
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-cpu-chip" class="w-5 h-5 text-purple-500" />
            <h3 class="font-semibold text-gray-900 dark:text-white">Memory Cache (L1)</h3>
          </div>

          <div v-if="loading && !status" class="py-4 text-center">
            <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-500 mx-auto"></div>
          </div>

          <template v-else-if="status?.memoryCache?.exists">
            <div class="space-y-2 text-sm">
              <div class="flex justify-between">
                <span class="text-gray-500 dark:text-gray-400">Status</span>
                <UBadge color="green" variant="subtle" size="xs">Populated</UBadge>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-500 dark:text-gray-400">Age</span>
                <span class="font-medium text-gray-900 dark:text-white">{{ status.memoryCache.age }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-500 dark:text-gray-400">TTL Remaining</span>
                <span class="font-medium text-gray-900 dark:text-white">{{ status.memoryCache.ttl }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-500 dark:text-gray-400">Access Count</span>
                <span class="font-medium text-gray-900 dark:text-white">{{ status.memoryCache.accessCount }}</span>
              </div>
            </div>
          </template>

          <div v-else class="py-4 text-center">
            <UIcon name="i-heroicons-inbox" class="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
            <p class="text-sm text-gray-500 dark:text-gray-400">Empty</p>
          </div>
        </div>
      </UCard>

      <!-- Scheduler Card -->
      <UCard>
        <div class="space-y-3">
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-clock" class="w-5 h-5 text-amber-500" />
            <h3 class="font-semibold text-gray-900 dark:text-white">Nightly Scheduler</h3>
          </div>

          <div v-if="loading && !status" class="py-4 text-center">
            <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-amber-500 mx-auto"></div>
          </div>

          <div v-else class="space-y-2 text-sm">
            <div class="flex justify-between">
              <span class="text-gray-500 dark:text-gray-400">Status</span>
              <UBadge
                :color="status?.scheduler?.enabled ? 'green' : 'red'"
                variant="subtle"
                size="xs"
              >
                {{ status?.scheduler?.enabled ? 'Enabled' : 'Disabled' }}
              </UBadge>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-500 dark:text-gray-400">Schedule</span>
              <span class="font-medium text-gray-900 dark:text-white">{{ status?.scheduler?.cron || '0 3 * * *' }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-500 dark:text-gray-400">Runs</span>
              <span class="font-medium text-gray-900 dark:text-white">{{ status?.scheduler?.description || 'Nightly at 3:00 AM UTC' }}</span>
            </div>
          </div>
        </div>
      </UCard>
    </div>

    <!-- Actions -->
    <UCard>
      <div class="space-y-4">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Actions</h3>

        <div class="flex flex-wrap gap-3">
          <UButton
            icon="i-heroicons-arrow-path"
            label="Recompute Now"
            color="primary"
            :loading="recomputing"
            @click="recompute"
          />
          <UButton
            icon="i-heroicons-trash"
            label="Clear Memory Cache"
            color="gray"
            :loading="clearingCache"
            @click="clearCache"
          />
          <UButton
            icon="i-heroicons-arrow-top-right-on-square"
            label="View Security Dashboard"
            color="gray"
            variant="outline"
            @click="navigateTo('/security', { open: { target: '_blank' } })"
          />
        </div>

        <!-- Recompute result message -->
        <div v-if="recomputeResult" class="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
          <div class="flex items-center gap-2 text-green-800 dark:text-green-200">
            <UIcon name="i-heroicons-check-circle" class="w-5 h-5" />
            <span class="text-sm font-medium">
              Recomputation complete in {{ formatDuration(recomputeResult.computeDurationMs) }}
              — {{ recomputeResult.totalFindings.toLocaleString() }} findings across {{ recomputeResult.totalAccounts }} accounts
            </span>
          </div>
        </div>

        <!-- Error message -->
        <div v-if="errorMessage" class="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <div class="flex items-center gap-2 text-red-800 dark:text-red-200">
            <UIcon name="i-heroicons-exclamation-circle" class="w-5 h-5" />
            <span class="text-sm font-medium">{{ errorMessage }}</span>
          </div>
        </div>
      </div>
    </UCard>

    <!-- Data Preview (collapsible) -->
    <UCard v-if="status?.summaryPreview">
      <div class="space-y-4">
        <button
          class="flex items-center gap-2 w-full text-left"
          @click="previewExpanded = !previewExpanded"
        >
          <UIcon
            :name="previewExpanded ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-right'"
            class="w-5 h-5 text-gray-500"
          />
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Data Preview</h3>
        </button>

        <div v-if="previewExpanded" class="space-y-4">
          <!-- Summary Stats -->
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div class="p-3 bg-gray-50 dark:bg-slate-700/50 rounded-lg text-center">
              <p class="text-2xl font-bold text-gray-900 dark:text-white">
                {{ status.summaryPreview.totalFindings.toLocaleString() }}
              </p>
              <p class="text-xs text-gray-500 dark:text-gray-400">Total Findings</p>
            </div>
            <div class="p-3 bg-gray-50 dark:bg-slate-700/50 rounded-lg text-center">
              <p class="text-2xl font-bold text-gray-900 dark:text-white">
                {{ status.summaryPreview.accountsAtRisk }}
              </p>
              <p class="text-xs text-gray-500 dark:text-gray-400">Accounts at Risk</p>
            </div>
            <div class="p-3 bg-gray-50 dark:bg-slate-700/50 rounded-lg text-center">
              <p class="text-2xl font-bold" :class="riskScoreColor">
                {{ status.summaryPreview.orgRiskScore }}
              </p>
              <p class="text-xs text-gray-500 dark:text-gray-400">Org Risk Score</p>
            </div>
            <div class="p-3 bg-gray-50 dark:bg-slate-700/50 rounded-lg text-center">
              <p class="text-2xl font-bold" :class="complianceColor">
                {{ status.summaryPreview.complianceRate }}%
              </p>
              <p class="text-xs text-gray-500 dark:text-gray-400">Compliance Rate</p>
            </div>
          </div>

          <!-- Severity Breakdown Bar -->
          <div v-if="status.summaryPreview.severityBreakdown">
            <p class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Severity Breakdown</p>
            <div class="flex h-4 rounded-full overflow-hidden">
              <div
                v-for="sev in severitySegments"
                :key="sev.label"
                :class="sev.color"
                :style="{ width: sev.percent + '%' }"
                :title="`${sev.label}: ${sev.count.toLocaleString()}`"
              />
            </div>
            <div class="flex flex-wrap gap-4 mt-2">
              <div v-for="sev in severitySegments" :key="sev.label" class="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                <span class="w-2.5 h-2.5 rounded-full" :class="sev.dotColor" />
                {{ sev.label }}: {{ sev.count.toLocaleString() }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
const loading = ref(false)
const recomputing = ref(false)
const clearingCache = ref(false)
const previewExpanded = ref(false)
const recomputeResult = ref<any>(null)
const errorMessage = ref('')

const status = ref<any>(null)

async function fetchStatus() {
  loading.value = true
  errorMessage.value = ''
  try {
    const res = await $fetch('/api/admin/security/status')
    status.value = (res as any).data
  } catch (err: any) {
    errorMessage.value = err.data?.message || err.message || 'Failed to fetch status'
  } finally {
    loading.value = false
  }
}

async function recompute() {
  recomputing.value = true
  recomputeResult.value = null
  errorMessage.value = ''
  try {
    const res = await $fetch('/api/admin/security/recompute', { method: 'POST' })
    recomputeResult.value = (res as any).data
    await fetchStatus()
  } catch (err: any) {
    errorMessage.value = err.data?.message || err.message || 'Recomputation failed'
  } finally {
    recomputing.value = false
  }
}

async function clearCache() {
  clearingCache.value = true
  errorMessage.value = ''
  try {
    await $fetch('/api/admin/security/clear-cache', { method: 'POST' })
    await fetchStatus()
  } catch (err: any) {
    errorMessage.value = err.data?.message || err.message || 'Failed to clear cache'
  } finally {
    clearingCache.value = false
  }
}

// Age color: green < 12h, yellow < 24h, red > 24h
const ageColor = computed(() => {
  const mins = status.value?.dynamodb?.ageMinutes || 0
  if (mins < 720) return 'text-green-600 dark:text-green-400'
  if (mins < 1440) return 'text-yellow-600 dark:text-yellow-400'
  return 'text-red-600 dark:text-red-400'
})

const riskScoreColor = computed(() => {
  const score = status.value?.summaryPreview?.orgRiskScore || 0
  if (score >= 80) return 'text-red-600 dark:text-red-400'
  if (score >= 50) return 'text-orange-600 dark:text-orange-400'
  if (score >= 20) return 'text-yellow-600 dark:text-yellow-400'
  return 'text-green-600 dark:text-green-400'
})

const complianceColor = computed(() => {
  const rate = status.value?.summaryPreview?.complianceRate || 0
  if (rate >= 90) return 'text-green-600 dark:text-green-400'
  if (rate >= 70) return 'text-yellow-600 dark:text-yellow-400'
  return 'text-red-600 dark:text-red-400'
})

const severitySegments = computed(() => {
  const b = status.value?.summaryPreview?.severityBreakdown
  if (!b) return []
  const total = (b.CRITICAL || 0) + (b.HIGH || 0) + (b.MEDIUM || 0) + (b.LOW || 0) + (b.INFORMATIONAL || 0)
  if (total === 0) return []

  return [
    { label: 'Critical', count: b.CRITICAL || 0, percent: ((b.CRITICAL || 0) / total) * 100, color: 'bg-red-600', dotColor: 'bg-red-600' },
    { label: 'High', count: b.HIGH || 0, percent: ((b.HIGH || 0) / total) * 100, color: 'bg-orange-500', dotColor: 'bg-orange-500' },
    { label: 'Medium', count: b.MEDIUM || 0, percent: ((b.MEDIUM || 0) / total) * 100, color: 'bg-yellow-400', dotColor: 'bg-yellow-400' },
    { label: 'Low', count: b.LOW || 0, percent: ((b.LOW || 0) / total) * 100, color: 'bg-blue-400', dotColor: 'bg-blue-400' },
    { label: 'Info', count: b.INFORMATIONAL || 0, percent: ((b.INFORMATIONAL || 0) / total) * 100, color: 'bg-gray-300 dark:bg-gray-600', dotColor: 'bg-gray-400' },
  ].filter(s => s.count > 0)
})

function formatDate(iso: string) {
  return new Date(iso).toLocaleString()
}

function formatAge(minutes: number) {
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ${minutes % 60}m ago`
  const days = Math.floor(hours / 24)
  return `${days}d ${hours % 24}h ago`
}

function formatDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`
  const seconds = (ms / 1000).toFixed(1)
  return `${seconds}s`
}

onMounted(() => {
  fetchStatus()
})
</script>
