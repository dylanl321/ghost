<template>
  <div class="pl-4 border-l-2 border-blue-500/30 mt-1 mb-2">
    <!-- Loading -->
    <div v-if="loading" class="space-y-1.5 py-1.5">
      <div v-for="i in 3" :key="i" class="animate-pulse flex items-center gap-2">
        <div class="h-2 bg-gray-700 rounded w-24" />
        <div class="h-2 bg-gray-700 rounded flex-1" />
        <div class="h-2 bg-gray-700 rounded w-14" />
      </div>
    </div>

    <!-- Unavailable (not an error, just a limitation) -->
    <div v-else-if="unavailable" class="text-xs text-gray-500 dark:text-gray-400 py-1.5 flex items-start gap-1.5">
      <UIcon name="i-heroicons-information-circle" class="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
      <span>Resource-level data requires hourly/resource granularity to be enabled in the management account's Cost Explorer settings. Data may take up to 24 hours to appear after enabling.</span>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="text-xs text-red-400 py-1.5">{{ error }}</div>

    <!-- Empty -->
    <div v-else-if="!resources.length" class="text-xs text-gray-500 py-1.5">No resource-level data available</div>

    <!-- Resource bars -->
    <div v-else class="space-y-1">
      <UBadge color="gray" variant="soft" size="xs" class="mb-1">Exact billable</UBadge>
      <div v-if="notice" class="text-[10px] text-amber-500 dark:text-amber-400 mb-1 flex items-center gap-1">
        <UIcon name="i-heroicons-clock" class="w-3 h-3 flex-shrink-0" />
        <span>{{ notice }}</span>
      </div>
      <div
        v-for="res in resources"
        :key="res.resourceId"
        class="flex items-center gap-2 text-xs"
      >
        <div class="w-36 truncate" :title="res.resourceId">
          <span class="font-medium text-gray-800 dark:text-gray-200">{{ res.displayName }}</span>
        </div>
        <span class="w-20 truncate text-gray-500 dark:text-gray-400 text-[10px]">{{ res.resourceType }}</span>
        <div class="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden">
          <div
            class="h-1.5 rounded-full bg-indigo-500 transition-all duration-300"
            :style="{ width: `${res.percentage}%` }"
          />
        </div>
        <span class="w-16 text-right font-mono text-gray-900 dark:text-gray-100">{{ formatCostValue(res.cost) }}</span>
        <span class="w-10 text-right text-gray-500 dark:text-gray-400">{{ res.percentage.toFixed(0) }}%</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { toCostTagFilterValues } from '~~/shared/utils/cost-tag-identities'
import { formatCostValue } from '~/utils/cost-filters'

const logger = createLogger('TagValueResourceBreakdown')

const props = withDefaults(defineProps<{
  accountId: string
  serviceName: string
  tagKey: string
  tagValue?: string
  tagValues?: string[]
  period?: string
}>(), {
  tagValue: '',
  tagValues: () => []
})

interface ResourceItem {
  resourceId: string
  displayName: string
  resourceType: string
  cost: number
  percentage: number
}

const loading = ref(false)
const error = ref<string | null>(null)
const unavailable = ref(false)
const notice = ref<string | null>(null)
const resources = ref<ResourceItem[]>([])

const effectiveTagValues = computed(() => toCostTagFilterValues(props.tagKey, props.tagValues, props.tagValue))

async function fetchData() {
  if (!props.accountId || !props.serviceName || !props.tagKey || effectiveTagValues.value.length === 0) return

  loading.value = true
  error.value = null
  unavailable.value = false
  notice.value = null

  try {
    const response = await $fetch('/api/costs/resources', {
      params: {
        accountId: props.accountId,
        service: props.serviceName,
        tagKey: props.tagKey,
        tagValues: effectiveTagValues.value,
        period: props.period || 'last90days'
      }
    }) as any

    const data = response?.data || {}
    resources.value = data.resources || []
    notice.value = data.notice || null
  } catch (err: any) {
    logger.error('Error fetching resource breakdown:', err)
    const msg = err?.data?.error?.message || err.message || ''
    // Distinguish "data not available" from real errors
    if (msg.includes('not available') || msg.includes('not enabled') || msg.includes('Resource-level')) {
      unavailable.value = true
    } else {
      error.value = msg || 'Failed to load resource breakdown'
    }
  } finally {
    loading.value = false
  }
}

watch(
  [() => props.accountId, () => props.serviceName, () => props.tagKey, () => props.tagValue, () => props.tagValues.join('|'), () => props.period],
  () => { fetchData() },
  { immediate: true }
)
</script>
