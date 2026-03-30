<template>
  <UCard>
    <template #header>
      <div class="text-base font-semibold text-gray-900 dark:text-white">Finding Age Distribution</div>
    </template>

    <div class="space-y-5">
      <!-- Visual bar breakdown -->
      <div v-if="totalFindings > 0" class="flex h-6 rounded-lg overflow-hidden">
        <div
          v-for="bucket in buckets" :key="bucket.key"
          :style="{ width: bucket.pct + '%' }"
          :class="bucket.barClass"
          class="transition-all duration-300"
        />
      </div>
      <div v-else class="flex items-center justify-center h-12 text-gray-400 dark:text-gray-500 text-sm">
        No active findings
      </div>

      <!-- Legend with counts -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div v-for="bucket in buckets" :key="bucket.key" class="flex items-center gap-3">
          <div :class="bucket.dotClass" class="w-3 h-3 rounded-full shrink-0" />
          <div>
            <div class="text-sm font-medium text-gray-900 dark:text-white">{{ bucket.count.toLocaleString() }}</div>
            <div class="text-xs text-gray-500 dark:text-gray-400">{{ bucket.label }}</div>
            <div class="text-xs text-gray-400 dark:text-gray-500">{{ bucket.pct }}%</div>
          </div>
        </div>
      </div>

      <!-- Insight callout -->
      <div v-if="totalFindings > 0 && insightText" class="flex items-start gap-2 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
        <UIcon name="i-heroicons-light-bulb" class="w-4 h-4 mt-0.5 text-amber-500 shrink-0" />
        <p class="text-xs text-gray-600 dark:text-gray-300">{{ insightText }}</p>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import type { FindingAgeBuckets } from '#shared/types/security-dashboard'

const props = defineProps<{
  ageBuckets: FindingAgeBuckets
}>()

const totalFindings = computed(() => {
  const b = props.ageBuckets
  return (b?.under7Days || 0) + (b?.under30Days || 0) + (b?.under90Days || 0) + (b?.over90Days || 0)
})

function pct(count: number): number {
  if (totalFindings.value === 0) return 0
  return Math.round((count / totalFindings.value) * 100)
}

const buckets = computed(() => [
  {
    key: 'under7',
    label: '< 7 days',
    count: props.ageBuckets?.under7Days || 0,
    pct: pct(props.ageBuckets?.under7Days || 0),
    barClass: 'bg-green-500',
    dotClass: 'bg-green-500',
  },
  {
    key: 'under30',
    label: '7-30 days',
    count: props.ageBuckets?.under30Days || 0,
    pct: pct(props.ageBuckets?.under30Days || 0),
    barClass: 'bg-yellow-500',
    dotClass: 'bg-yellow-500',
  },
  {
    key: 'under90',
    label: '30-90 days',
    count: props.ageBuckets?.under90Days || 0,
    pct: pct(props.ageBuckets?.under90Days || 0),
    barClass: 'bg-orange-500',
    dotClass: 'bg-orange-500',
  },
  {
    key: 'over90',
    label: '> 90 days',
    count: props.ageBuckets?.over90Days || 0,
    pct: pct(props.ageBuckets?.over90Days || 0),
    barClass: 'bg-red-500',
    dotClass: 'bg-red-500',
  },
])

const insightText = computed(() => {
  const b = props.ageBuckets
  if (!b) return ''
  const total = totalFindings.value
  if (total === 0) return ''

  const staleCount = (b.under90Days || 0) + (b.over90Days || 0)
  const stalePct = Math.round((staleCount / total) * 100)
  const freshPct = pct(b.under7Days || 0)

  if (stalePct > 60) {
    return `${stalePct}% of active findings are older than 30 days. Consider prioritizing remediation of long-standing issues to reduce chronic risk exposure.`
  }
  if (freshPct > 40) {
    return `${freshPct}% of findings were discovered in the last week. A spike in new findings may indicate a recent infrastructure change or new security controls being enabled.`
  }
  if ((b.over90Days || 0) > 0) {
    return `${(b.over90Days || 0).toLocaleString()} findings have been open for more than 90 days. These persistent findings should be reviewed for suppression or remediation.`
  }
  return `Findings are distributed across age ranges. Regular triage keeps the backlog manageable.`
})
</script>
