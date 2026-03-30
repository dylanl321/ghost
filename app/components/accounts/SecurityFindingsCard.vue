<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <UIcon name="i-heroicons-shield-check" class="w-5 h-5 text-red-400" />
          <h3 class="text-sm font-semibold text-white">Security & Compliance</h3>
        </div>
        <UBadge v-if="loading" color="gray" variant="soft" size="xs">
          Loading...
        </UBadge>
      </div>
    </template>

    <!-- Summary Stats -->
    <div v-if="!loading && hasSummary" class="grid grid-cols-3 gap-3 mb-4">
      <div class="stat-card critical">
        <div class="text-2xl font-bold text-white">{{ summary?.critical || 0 }}</div>
        <div class="text-xs text-gray-400">Critical</div>
      </div>
      <div class="stat-card high">
        <div class="text-2xl font-bold text-white">{{ summary?.high || 0 }}</div>
        <div class="text-xs text-gray-400">High</div>
      </div>
      <div class="stat-card medium">
        <div class="text-2xl font-bold text-white">{{ summary?.medium || 0 }}</div>
        <div class="text-xs text-gray-400">Medium</div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else-if="!loading && !hasSummary" class="text-center py-6">
      <UIcon name="i-heroicons-shield-check" class="w-12 h-12 text-gray-600 mx-auto mb-2" />
      <p class="text-sm text-gray-500">No security findings data available</p>
    </div>

    <!-- Quick Action Links -->
    <div class="space-y-2">
      <UButton
        @click="$emit('view-security-tab')"
        icon="i-heroicons-shield-exclamation"
        variant="soft"
        color="primary"
        block
        size="sm"
      >
        View Security Tab
      </UButton>

      <UButton
        @click="viewSecurityHubReport"
        icon="i-heroicons-shield-exclamation"
        variant="soft"
        color="red"
        block
        size="sm"
      >
        View Security Hub Findings
      </UButton>

      <UButton
        @click="viewConfigReport"
        icon="i-heroicons-cog-6-tooth"
        variant="soft"
        color="blue"
        block
        size="sm"
      >
        View Config Resources
      </UButton>

      <UButton
        @click="viewCloudTrailEvents"
        icon="i-heroicons-document-text"
        variant="soft"
        color="gray"
        block
        size="sm"
      >
        View Recent CloudTrail Events
      </UButton>

      <UButton
        @click="viewEntraUsers"
        icon="i-heroicons-user-group"
        variant="soft"
        color="purple"
        block
        size="sm"
      >
        View User Access
      </UButton>
    </div>
  </UCard>
</template>

<script setup lang="ts">
const logger = createLogger('SecurityFindingsCard')

const props = defineProps<{
  accountId: string
}>()

defineEmits<{
  'view-security-tab': []
}>()

const {
  buildSecurityHubLink,
  buildConfigLink,
  buildCloudTrailLink,
  buildEntraUsersLink,
  buildCriticalFindingsLink
} = useDatasetReportLinks()

const loading = ref(false)
const summary = ref<{
  critical: number
  high: number
  medium: number
  low: number
  informational: number
} | null>(null)

const hasSummary = computed(() => {
  return summary.value !== null &&
    (summary.value.critical > 0 || summary.value.high > 0 || summary.value.medium > 0)
})

onMounted(async () => {
  loading.value = true
  try {
    const res = await $fetch<{ data: any }>(`/api/accounts/${props.accountId}/security-summary`)
    const breakdown = res.data?.severityBreakdown || {}
    summary.value = {
      critical: breakdown.CRITICAL ?? 0,
      high: breakdown.HIGH ?? 0,
      medium: breakdown.MEDIUM ?? 0,
      low: breakdown.LOW ?? 0,
      informational: breakdown.INFORMATIONAL ?? 0
    }
  } catch (error) {
    logger.error('Failed to load security summary:', error)
  } finally {
    loading.value = false
  }
})

function viewSecurityHubReport() {
  // Navigate to dataset reports with SecurityHub pre-populated and filtered for critical/high
  navigateTo(buildCriticalFindingsLink(props.accountId))
}

function viewConfigReport() {
  // Navigate to dataset reports with Config pre-populated
  navigateTo(buildConfigLink(props.accountId, undefined, { autoPreview: true }))
}

function viewCloudTrailEvents() {
  // Navigate to dataset reports with CloudTrail pre-populated for last 7 days
  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - 7)

  navigateTo(buildCloudTrailLink(
    props.accountId,
    {
      startTime: startDate.toISOString(),
      endTime: endDate.toISOString()
    },
    { autoPreview: true }
  ))
}

function viewEntraUsers() {
  // Navigate to dataset reports with Entra Users pre-populated
  navigateTo(buildEntraUsersLink(props.accountId, undefined, { autoPreview: true }))
}
</script>

<style scoped>
.stat-card {
  @apply p-3 rounded-lg border border-gray-700 bg-gray-900/50 text-center;
}
.stat-card.critical {
  @apply border-red-500/30 bg-red-500/5;
}
.stat-card.high {
  @apply border-orange-500/30 bg-orange-500/5;
}
.stat-card.medium {
  @apply border-yellow-500/30 bg-yellow-500/5;
}
</style>
