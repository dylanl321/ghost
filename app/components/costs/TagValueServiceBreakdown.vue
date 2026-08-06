<template>
  <div>
    <!-- Loading -->
    <div v-if="loading" class="space-y-2 py-2">
      <div v-for="i in 5" :key="i" class="animate-pulse flex items-center gap-3">
        <div class="h-2.5 bg-gray-700 rounded w-28" />
        <div class="h-2.5 bg-gray-700 rounded flex-1" />
        <div class="h-2.5 bg-gray-700 rounded w-16" />
      </div>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="text-xs text-red-400 py-2">{{ error }}</div>

    <!-- Empty -->
    <div v-else-if="!services.length" class="text-xs text-gray-500 py-2">No service breakdown available</div>

    <!-- Service bars -->
    <div v-else class="space-y-1.5">
      <div class="flex items-center gap-2 mb-2">
        <h4 class="text-xs font-semibold text-gray-600 dark:text-gray-400">Service Breakdown</h4>
        <UBadge color="gray" variant="soft" size="xs">Exact billable</UBadge>
      </div>
      <template v-for="svc in services" :key="svc.name">
        <div
          :class="[
            'flex items-center gap-2 text-xs rounded px-1 -mx-1',
            isClickable(svc.name) ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800' : '',
            expandedService === svc.name ? 'bg-gray-100 dark:bg-gray-800' : ''
          ]"
          @click="toggleService(svc.name)"
        >
          <UIcon
            v-if="isClickable(svc.name)"
            :name="expandedService === svc.name ? 'i-heroicons-chevron-down-20-solid' : 'i-heroicons-chevron-right-20-solid'"
            class="w-3 h-3 text-gray-400 flex-shrink-0"
          />
          <span v-else class="w-3 flex-shrink-0" />
          <span class="w-36 truncate text-gray-700 dark:text-gray-300" :title="svc.name">{{ svc.name }}</span>
          <div class="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
            <div
              class="h-2 rounded-full bg-blue-500 transition-all duration-300"
              :style="{ width: `${svc.pct}%` }"
            />
          </div>
          <span class="w-16 text-right font-mono text-gray-900 dark:text-gray-100">{{ formatCostValue(svc.cost) }}</span>
          <span class="w-10 text-right text-gray-500 dark:text-gray-400">{{ svc.pct.toFixed(0) }}%</span>
        </div>
        <!-- Resource breakdown for expanded service -->
        <TagValueResourceBreakdown
          v-if="expandedService === svc.name"
          :account-id="accountId"
          :service-name="svc.name"
          :tag-key="tagKey"
          :tag-values="effectiveTagValues"
          :period="period"
        />
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { formatCostValue } from '~/utils/cost-filters'

const logger = createLogger('TagValueServiceBreakdown')

const props = withDefaults(defineProps<{
  accountId: string
  tagKey: string
  tagValue?: string
  tagValues?: string[]
  period?: string
}>(), {
  tagValue: '',
  tagValues: () => []
})

const loading = ref(false)
const error = ref<string | null>(null)
const rawData = ref<any>(null)
const expandedService = ref<string | null>(null)

function isClickable(name: string): boolean {
  return !name.startsWith('Other (')
}

function toggleService(name: string) {
  if (!isClickable(name)) return
  expandedService.value = expandedService.value === name ? null : name
}

function stripTagPrefix(rawValue: string, tagKey: string): string {
  const idx = rawValue.indexOf('$')
  if (idx !== -1) {
    const prefix = rawValue.substring(0, idx)
    if (prefix === tagKey || prefix === '') {
      return rawValue.substring(idx + 1)
    }
  }
  return rawValue
}

const effectiveTagValues = computed(() => props.tagValues.length > 0
  ? props.tagValues
  : props.tagValue ? [stripTagPrefix(props.tagValue, props.tagKey)] : [])

async function fetchData() {
  if (!props.accountId || !props.tagKey || effectiveTagValues.value.length === 0) return

  loading.value = true
  error.value = null

  try {
    const response = await $fetch('/api/costs/summary', {
      params: {
        groupBy: 'SERVICE',
        accountIds: props.accountId,
        tagFilterKey: props.tagKey,
        tagFilterValues: effectiveTagValues.value,
        period: props.period || 'last90days',
        enhanced: false
      }
    }) as any

    rawData.value = response?.data || response || null
  } catch (err: any) {
    logger.error('Error fetching tag value service breakdown:', err)
    error.value = err.message || 'Failed to load service breakdown'
  } finally {
    loading.value = false
  }
}

const services = computed(() => {
  if (!rawData.value) return []

  // Enhanced format has groups array; non-enhanced has resultsByTime
  const groups: any[] = rawData.value.groups || []
  if (groups.length) {
    const total = groups.reduce((s: number, g: any) => s + (g.totalCost ?? 0), 0)
    if (total <= 0) return []

    const sorted = [...groups].sort((a, b) => (b.totalCost ?? 0) - (a.totalCost ?? 0))
    const top = sorted.slice(0, 8)
    const restCost = sorted.slice(8).reduce((s: number, g: any) => s + (g.totalCost ?? 0), 0)

    const result = top.map(g => ({
      name: g.groupKey || g.serviceName || 'Unknown',
      cost: g.totalCost ?? 0,
      pct: total > 0 ? ((g.totalCost ?? 0) / total) * 100 : 0
    }))

    if (restCost > 0) {
      result.push({ name: `Other (${sorted.length - 8})`, cost: restCost, pct: (restCost / total) * 100 })
    }
    return result
  }

  // Fallback: parse from resultsByTime (raw format)
  const resultsByTime: any[] = rawData.value.resultsByTime || []
  const serviceTotals = new Map<string, number>()
  for (const period of resultsByTime) {
    for (const group of (period.Groups || [])) {
      const name = group.Keys?.[0] || 'Unknown'
      const cost = parseFloat(group.Metrics?.UnblendedCost?.Amount || '0')
      serviceTotals.set(name, (serviceTotals.get(name) || 0) + cost)
    }
  }

  const total = Array.from(serviceTotals.values()).reduce((s, c) => s + c, 0)
  if (total <= 0) return []

  const sorted = Array.from(serviceTotals.entries())
    .map(([name, cost]) => ({ name, cost, pct: (cost / total) * 100 }))
    .sort((a, b) => b.cost - a.cost)

  const top = sorted.slice(0, 8)
  const restCost = sorted.slice(8).reduce((s, g) => s + g.cost, 0)
  if (restCost > 0) {
    top.push({ name: `Other (${sorted.length - 8})`, cost: restCost, pct: (restCost / total) * 100 })
  }
  return top
})

watch([() => props.accountId, () => props.tagKey, () => props.tagValue, () => props.tagValues.join('|'), () => props.period], () => {
  fetchData()
}, { immediate: true })
</script>
