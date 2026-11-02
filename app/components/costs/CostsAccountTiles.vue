<template>
  <section class="flex min-w-0 flex-col gap-4" aria-labelledby="account-tiles-heading">
    <div class="flex flex-wrap items-center gap-3">
      <div class="min-w-0 flex-1">
        <h2 id="account-tiles-heading" class="m-0 text-lg font-bold text-gray-900 dark:text-white">Accounts</h2>
        <p class="m-0 mt-0.5 text-sm text-gray-500 dark:text-gray-400">
          Tile size is spend and color is budget status. Click tiles to focus the dashboard.
        </p>
      </div>
      <UTabs
        v-model="groupByModel"
        :items="groupByItems"
        :content="false"
        size="xs"
        variant="pill"
        class="w-auto"
        aria-label="Group tiles"
      />
    </div>

    <div class="flex flex-wrap gap-4 text-xs text-gray-500 dark:text-gray-400">
      <span class="flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded-sm bg-red-500" />Over budget</span>
      <span class="flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded-sm bg-emerald-500" />50–100% used</span>
      <span class="flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded-sm bg-blue-500" />Under 50% used</span>
      <span class="flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded-sm bg-gray-300 dark:bg-gray-600" />No budget</span>
    </div>

    <div v-for="group in visibleGroups" :key="group.name ?? 'all'" class="flex flex-col gap-2">
      <div v-if="group.name" class="flex items-baseline justify-between gap-3 text-sm">
        <button
          type="button"
          class="truncate text-left font-semibold text-gray-900 hover:underline dark:text-white"
          :title="`Select every account in ${group.name}`"
          @click="emit('select-group', group.tiles.map(t => t.id))"
        >
          {{ group.name }}
        </button>
        <span class="shrink-0 tabular-nums text-gray-500 dark:text-gray-400">
          {{ formatCurrency(group.spend) }}<template v-if="group.budget > 0"> · <span :class="textClass(group.status)">{{ percent(group.spend / group.budget) }} of budget</span></template>
        </span>
      </div>
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="tile in group.shown"
          :key="tile.id"
          type="button"
          class="flex h-24 min-w-0 flex-col justify-between gap-1 rounded-lg border-2 px-3 py-2 text-left transition hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          :class="[tileClass(tile.status), tile.selected ? 'border-gray-900 dark:border-white' : 'border-transparent', tile.dimmed ? 'opacity-45' : '']"
          :style="{ flex: `${Math.round(tile.weight * 100)} 1 ${Math.round(96 + tile.weight * 140)}px` }"
          :aria-pressed="tile.selected"
          :title="`${tile.name}: ${formatCurrency(tile.spend)}${tile.budget > 0 ? ` of ${formatCurrency(tile.budget)}` : ''}`"
          @click="emit('toggle', tile.id)"
        >
          <span class="truncate text-[13px] font-semibold text-gray-900 dark:text-white">{{ tile.name }}</span>
          <span class="flex items-end justify-between gap-2">
            <span class="text-lg font-bold tabular-nums text-gray-900 dark:text-white">{{ formatCurrency(tile.spend) }}</span>
            <span v-if="tile.utilization !== null" class="text-[13px] font-semibold tabular-nums" :class="textClass(tile.status)">{{ percent(tile.utilization) }}</span>
          </span>
        </button>
        <span v-if="group.hidden > 0" class="flex items-center px-2 text-xs text-gray-500 dark:text-gray-400">
          +{{ group.hidden }} smaller
        </span>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { AccountTileGroup, BudgetStatus } from '#shared/utils/cost-dashboard'

const props = withDefaults(defineProps<{
  groups: AccountTileGroup[]
  formatCurrency: (value: number) => string
  /** Most tiles drawn per group; the rest are summarised */
  maxPerGroup?: number
}>(), { maxPerGroup: 24 })

const emit = defineEmits<{
  toggle: [accountId: string]
  'select-group': [accountIds: string[]]
}>()

const groupByModel = defineModel<'lob' | 'department' | 'none'>('groupBy', { default: 'lob' })

const groupByItems = [
  { label: 'By LOB', value: 'lob' },
  { label: 'By department', value: 'department' },
  { label: 'Flat', value: 'none' }
]

const visibleGroups = computed(() => props.groups.map(group => {
  // Keep selected tiles visible even past the cap
  const shown = group.tiles.filter((tile, index) => index < props.maxPerGroup || tile.selected)
  return { ...group, shown, hidden: group.tiles.length - shown.length }
}))

const percent = (ratio: number) => `${Math.round(ratio * 100)}%`

const tileClass = (status: BudgetStatus) => ({
  over: 'bg-red-50 dark:bg-red-500/15',
  healthy: 'bg-emerald-50 dark:bg-emerald-500/15',
  under: 'bg-blue-50 dark:bg-blue-500/15',
  'no-budget': 'bg-gray-100 dark:bg-gray-800'
}[status])

const textClass = (status: BudgetStatus) => ({
  over: 'text-red-700 dark:text-red-300',
  healthy: 'text-emerald-700 dark:text-emerald-300',
  under: 'text-blue-700 dark:text-blue-300',
  'no-budget': 'text-gray-500 dark:text-gray-400'
}[status])
</script>
