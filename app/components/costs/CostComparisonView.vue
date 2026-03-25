<template>
  <div class="bg-gray-900 rounded-xl border border-gray-700 overflow-hidden">
    <!-- Period selectors row -->
    <div class="grid grid-cols-[1fr_auto_1fr] gap-4 p-4 border-b border-gray-700 bg-gray-800/60">
      <!-- Period A selector -->
      <div class="flex items-center gap-3">
        <UBadge color="blue" variant="soft" size="sm" class="flex-shrink-0">A</UBadge>
        <USelectMenu
          v-model="selectedA"
          :options="periodOptions"
          value-attribute="value"
          option-attribute="label"
          size="sm"
          class="flex-1"
          @update:model-value="fetchComparison"
        />
      </div>

      <!-- Center vs label -->
      <div class="flex items-center justify-center">
        <div class="flex items-center gap-2 px-3 py-1.5 bg-gray-700 rounded-lg">
          <UIcon name="i-heroicons-arrows-right-left" class="w-4 h-4 text-gray-300" />
          <span class="text-xs font-medium text-gray-300">vs</span>
        </div>
      </div>

      <!-- Period B selector -->
      <div class="flex items-center gap-3">
        <USelectMenu
          v-model="selectedB"
          :options="periodOptions"
          value-attribute="value"
          option-attribute="label"
          size="sm"
          class="flex-1"
          @update:model-value="fetchComparison"
        />
        <UBadge color="violet" variant="soft" size="sm" class="flex-shrink-0">B</UBadge>
      </div>
    </div>

    <!-- Error state -->
    <div v-if="error && !loading" class="p-6 text-center text-red-400">
      <UIcon name="i-heroicons-exclamation-triangle" class="w-6 h-6 mx-auto mb-2" />
      <p class="text-sm">{{ error }}</p>
      <UButton color="red" variant="soft" size="sm" class="mt-3" @click="fetchComparison">Retry</UButton>
    </div>

    <!-- Main comparison grid -->
    <div v-else class="grid grid-cols-[1fr_180px_1fr] min-h-[300px]">
      <!-- Period A column -->
      <div class="p-5 border-r border-gray-700">
        <div class="flex items-center gap-2 mb-4">
          <UBadge color="blue" variant="soft" size="xs">Period A</UBadge>
          <span class="text-sm text-gray-300 font-medium">{{ periodLabelA }}</span>
        </div>

        <!-- Loading -->
        <div v-if="loadingA" class="space-y-3">
          <div class="h-8 bg-gray-700 rounded animate-pulse" />
          <div class="h-4 bg-gray-700 rounded animate-pulse w-2/3" />
          <div class="space-y-2 mt-4">
            <div v-for="i in 5" :key="i" class="h-3 bg-gray-700 rounded animate-pulse" :style="{ width: `${80 - i * 10}%` }" />
          </div>
        </div>

        <!-- Data -->
        <template v-else-if="periodA">
          <!-- Total cost -->
          <div class="mb-4">
            <p class="text-xs text-gray-400 mb-1">Total Cost</p>
            <p class="text-3xl font-bold text-white">{{ formatCurrency(periodA.totalCost) }}</p>
            <p class="text-xs text-gray-500 mt-1">{{ periodA.accountCount }} account{{ periodA.accountCount !== 1 ? 's' : '' }}</p>
          </div>

          <!-- Top 5 services -->
          <div v-if="periodA.topServices && periodA.topServices.length > 0" class="mt-5">
            <p class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Top Services</p>
            <div class="space-y-1.5">
              <div
                v-for="svc in periodA.topServices"
                :key="svc.service"
                class="flex items-center justify-between gap-2"
              >
                <span class="text-xs text-gray-400 truncate">{{ svc.service }}</span>
                <span class="text-xs font-medium text-gray-200 flex-shrink-0">{{ formatCurrency(svc.cost) }}</span>
              </div>
            </div>
          </div>

          <!-- Monthly breakdown -->
          <div v-if="periodA.monthlyBreakdown.length > 0" class="mt-5">
            <p class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Monthly Breakdown</p>
            <div class="space-y-2">
              <div
                v-for="month in periodA.monthlyBreakdown.slice(-5)"
                :key="month.month"
                class="flex items-center justify-between gap-2"
              >
                <span class="text-xs text-gray-400">{{ month.month }}</span>
                <span class="text-xs font-medium text-gray-200">{{ formatCurrency(month.cost) }}</span>
              </div>
            </div>
          </div>
        </template>

        <!-- Empty -->
        <div v-else class="text-gray-500 text-sm text-center mt-8">No data</div>
      </div>

      <!-- Delta column -->
      <div class="p-4 flex flex-col items-center bg-gray-800/40 border-r border-gray-700">
        <p class="text-xs text-gray-400 font-medium uppercase tracking-wider mb-4">Delta</p>

        <!-- Loading -->
        <template v-if="loading">
          <div class="w-full space-y-2">
            <div class="h-8 bg-gray-700 rounded animate-pulse" />
            <div class="h-5 bg-gray-700 rounded animate-pulse w-2/3 mx-auto" />
          </div>
        </template>

        <!-- No data -->
        <div v-else-if="!deltas" class="text-gray-500 text-xs mt-4">—</div>

        <!-- Delta values -->
        <template v-else>
          <div class="text-center mb-4">
            <div class="text-xl font-bold" :class="deltaAmountClass">
              {{ deltas.absoluteDiff >= 0 ? '+' : '' }}{{ formatCurrency(deltas.absoluteDiff) }}
            </div>
            <div v-if="deltas.percentChange !== null" class="mt-2">
              <UBadge :color="deltaBadgeColor" variant="soft" size="sm">
                <UIcon :name="deltaIcon" class="w-3 h-3 mr-1" />
                {{ deltas.absoluteDiff >= 0 ? '+' : '' }}{{ deltas.percentChange.toFixed(1) }}%
              </UBadge>
            </div>
            <p class="text-[10px] text-gray-500 mt-2 text-center leading-snug">{{ deltaDescription }}</p>
          </div>

          <!-- Per-month deltas -->
          <div v-if="monthlyDeltas.length > 0" class="w-full space-y-2 mt-2">
            <p class="text-[10px] text-gray-500 uppercase tracking-wider text-center font-medium">By Month</p>
            <div
              v-for="item in monthlyDeltas"
              :key="item.month"
              class="text-center"
            >
              <p class="text-[10px] text-gray-500">{{ item.month }}</p>
              <p class="text-xs font-semibold" :class="item.diff >= 0 ? 'text-red-400' : 'text-green-400'">
                {{ item.diff >= 0 ? '+' : '' }}{{ formatCurrency(item.diff) }}
              </p>
            </div>
          </div>
        </template>
      </div>

      <!-- Period B column -->
      <div class="p-5">
        <div class="flex items-center gap-2 mb-4">
          <UBadge color="violet" variant="soft" size="xs">Period B</UBadge>
          <span class="text-sm text-gray-300 font-medium">{{ periodLabelB }}</span>
        </div>

        <!-- Loading -->
        <div v-if="loadingB" class="space-y-3">
          <div class="h-8 bg-gray-700 rounded animate-pulse" />
          <div class="h-4 bg-gray-700 rounded animate-pulse w-2/3" />
          <div class="space-y-2 mt-4">
            <div v-for="i in 5" :key="i" class="h-3 bg-gray-700 rounded animate-pulse" :style="{ width: `${80 - i * 10}%` }" />
          </div>
        </div>

        <!-- Data -->
        <template v-else-if="periodB">
          <!-- Total cost -->
          <div class="mb-4">
            <p class="text-xs text-gray-400 mb-1">Total Cost</p>
            <p class="text-3xl font-bold text-white">{{ formatCurrency(periodB.totalCost) }}</p>
            <p class="text-xs text-gray-500 mt-1">{{ periodB.accountCount }} account{{ periodB.accountCount !== 1 ? 's' : '' }}</p>
          </div>

          <!-- Top 5 services -->
          <div v-if="periodB.topServices && periodB.topServices.length > 0" class="mt-5">
            <p class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Top Services</p>
            <div class="space-y-1.5">
              <div
                v-for="svc in periodB.topServices"
                :key="svc.service"
                class="flex items-center justify-between gap-2"
              >
                <span class="text-xs text-gray-400 truncate">{{ svc.service }}</span>
                <span class="text-xs font-medium text-gray-200 flex-shrink-0">{{ formatCurrency(svc.cost) }}</span>
              </div>
            </div>
          </div>

          <!-- Monthly breakdown -->
          <div v-if="periodB.monthlyBreakdown.length > 0" class="mt-5">
            <p class="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Monthly Breakdown</p>
            <div class="space-y-2">
              <div
                v-for="month in periodB.monthlyBreakdown.slice(-5)"
                :key="month.month"
                class="flex items-center justify-between gap-2"
              >
                <span class="text-xs text-gray-400">{{ month.month }}</span>
                <span class="text-xs font-medium text-gray-200">{{ formatCurrency(month.cost) }}</span>
              </div>
            </div>
          </div>
        </template>

        <!-- Empty -->
        <div v-else class="text-gray-500 text-sm text-center mt-8">No data</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useCostComparison } from '~/composables/useCostComparison'

const {
  selectedPeriodA,
  selectedPeriodB,
  periodA,
  periodB,
  deltas,
  loading,
  loadingA,
  loadingB,
  error,
  periodOptions,
  fetchComparison
} = useCostComparison()

const selectedA = computed({
  get: () => selectedPeriodA.value,
  set: (v) => { selectedPeriodA.value = v }
})

const selectedB = computed({
  get: () => selectedPeriodB.value,
  set: (v) => { selectedPeriodB.value = v }
})

const periodLabelA = computed(
  () => periodOptions.find(p => p.value === selectedPeriodA.value)?.label ?? selectedPeriodA.value
)
const periodLabelB = computed(
  () => periodOptions.find(p => p.value === selectedPeriodB.value)?.label ?? selectedPeriodB.value
)

// Delta visual helpers
const deltaAmountClass = computed(() => {
  if (!deltas.value) return 'text-gray-400'
  return deltas.value.direction === 'decrease' ? 'text-green-400' : deltas.value.direction === 'increase' ? 'text-red-400' : 'text-gray-300'
})

const deltaBadgeColor = computed(() => {
  if (!deltas.value) return 'gray'
  return deltas.value.direction === 'decrease' ? 'green' : deltas.value.direction === 'increase' ? 'red' : 'gray'
})

const deltaIcon = computed(() => {
  if (!deltas.value) return 'i-heroicons-minus'
  return deltas.value.direction === 'decrease'
    ? 'i-heroicons-arrow-trending-down'
    : deltas.value.direction === 'increase'
    ? 'i-heroicons-arrow-trending-up'
    : 'i-heroicons-minus'
})

const deltaDescription = computed(() => {
  if (!deltas.value) return ''
  return deltas.value.direction === 'decrease'
    ? 'B costs less than A'
    : deltas.value.direction === 'increase'
    ? 'B costs more than A'
    : 'No change'
})

// Aligned monthly deltas across both periods (up to 5 most recent months)
const monthlyDeltas = computed(() => {
  if (!periodA.value || !periodB.value) return []

  const aMap = new Map(periodA.value.monthlyBreakdown.map(m => [m.month, m.cost]))
  const bMap = new Map(periodB.value.monthlyBreakdown.map(m => [m.month, m.cost]))

  const allMonths = [...new Set([...aMap.keys(), ...bMap.keys()])].sort()
  return allMonths.slice(-5).map(month => ({
    month,
    diff: (bMap.get(month) ?? 0) - (aMap.get(month) ?? 0)
  }))
})

// formatCurrency is auto-imported from app/utils/formatters.ts in Nuxt 4
onMounted(() => fetchComparison())
</script>
