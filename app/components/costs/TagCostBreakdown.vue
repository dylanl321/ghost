<template>
  <div class="space-y-4">
    <!-- Loading skeleton -->
    <div v-if="loading" class="space-y-2">
      <div v-for="i in 5" :key="i" class="animate-pulse flex items-center gap-3 py-2">
        <div class="h-3 bg-gray-700 rounded w-32" />
        <div class="h-3 bg-gray-700 rounded flex-1" />
        <div class="h-3 bg-gray-700 rounded w-20" />
      </div>
    </div>

    <!-- Empty state -->
    <div v-else-if="!rows.length" class="py-8 text-center">
      <UIcon name="i-heroicons-tag" class="w-8 h-8 text-gray-400 mx-auto mb-2" />
      <p class="text-sm text-gray-500 dark:text-gray-400">
        {{ costData ? 'No groups found in tag cost data' : 'No tag cost data available' }}
      </p>
      <p v-if="tagKey" class="text-xs text-gray-400 mt-1">No data found for tag "{{ tagKey }}"</p>
    </div>

    <!-- Table + bars -->
    <div v-else>
      <div class="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
        <table class="w-full text-sm">
          <thead class="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-400 tracking-wider w-40">
                {{ tagKey || 'Tag Value' }}
              </th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-400 tracking-wider">
                Cost Distribution
              </th>
              <th class="px-4 py-3 text-right text-xs font-medium text-gray-700 dark:text-gray-400 tracking-wider w-28">
                Total Cost
              </th>
              <th class="px-4 py-3 text-right text-xs font-medium text-gray-700 dark:text-gray-400 tracking-wider w-16">
                %
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
            <tr
              v-for="row in rows"
              :key="row.value"
              class="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
            >
              <td class="px-4 py-3">
                <div class="flex items-center gap-1.5">
                  <UTooltip
                    v-if="row.isUntagged"
                    text="Resources without this tag or with a blank value"
                  >
                    <span
                      class="text-xs font-medium text-amber-400 cursor-help"
                    >
                      Untagged
                    </span>
                  </UTooltip>
                  <button
                    v-else
                    class="text-xs font-medium text-blue-400 hover:text-blue-300 hover:underline text-left truncate max-w-[140px]"
                    :title="row.label"
                    @click="$emit('filter', row.value)"
                  >
                    {{ row.label }}
                  </button>
                </div>
              </td>
              <td class="px-4 py-3">
                <div class="flex items-center gap-2">
                  <div class="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                    <div
                      class="h-2 rounded-full transition-all duration-500"
                      :class="row.isUntagged ? 'bg-amber-500' : 'bg-blue-500'"
                      :style="{ width: `${row.percentage}%` }"
                    />
                  </div>
                </div>
              </td>
              <td class="px-4 py-3 text-right text-xs text-gray-900 dark:text-gray-100 font-mono">
                {{ formatCostValue(row.cost) }}
              </td>
              <td class="px-4 py-3 text-right text-xs text-gray-500 dark:text-gray-400">
                {{ row.percentage.toFixed(1) }}%
              </td>
            </tr>
          </tbody>
          <tfoot class="bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
            <tr>
              <td colspan="2" class="px-4 py-2 text-xs text-gray-500 dark:text-gray-400">
                {{ rows.length }} tag values
              </td>
              <td class="px-4 py-2 text-right text-xs font-semibold text-gray-900 dark:text-gray-100 font-mono">
                {{ formatCostValue(totalCost) }}
              </td>
              <td class="px-4 py-2 text-right text-xs text-gray-500 dark:text-gray-400">
                100%
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { formatCostValue } from '~/utils/cost-filters'

const props = defineProps<{
  /** Summary API response — expects .groups array with { groupKey, totalCost } */
  costData: any | null
  tagKey: string
  loading: boolean
}>()

defineEmits<{
  (e: 'filter', tagValue: string): void
}>()

interface TagRow {
  value: string
  label: string
  cost: number
  percentage: number
  isUntagged: boolean
}

const rows = computed<TagRow[]>(() => {
  const groups: any[] = props.costData?.groups ?? props.costData?.data?.groups ?? []
  if (!groups.length) {
    if (props.costData) {
      console.debug('[TagCostBreakdown] Data received but no groups found. Keys:', Object.keys(props.costData))
    }
    return []
  }

  const totalRaw = groups.reduce((sum: number, g: any) => sum + (g.totalCost ?? g.cost ?? 0), 0)
  if (totalRaw === 0) return []

  return groups
    .map((g: any): TagRow => {
      const rawValue: string = g.groupKey ?? g.tagValue ?? ''
      const isUntagged = rawValue === '$not_tagged' || rawValue === '' || rawValue === '__untagged__'
      const cost = g.totalCost ?? g.cost ?? 0
      return {
        value: rawValue,
        label: isUntagged ? 'Untagged' : rawValue,
        cost,
        percentage: totalRaw > 0 ? (cost / totalRaw) * 100 : 0,
        isUntagged
      }
    })
    .sort((a, b) => b.cost - a.cost)
})

const totalCost = computed(() =>
  rows.value.reduce((sum, r) => sum + r.cost, 0)
)
</script>
