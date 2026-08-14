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
      <div class="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <UInput
          v-model="tagValueSearch"
          icon="i-heroicons-magnifying-glass"
          size="sm"
          placeholder="Filter tag values..."
          class="sm:w-80"
        />
        <USelect v-model="pageSize" :options="pageSizeOptions" size="sm" class="w-32" />
      </div>
      <div class="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
        <table class="w-full text-sm">
          <thead class="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-400 tracking-wider w-48">
                Display Name
              </th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-400 tracking-wider w-40">
                Raw Value
              </th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-400 tracking-wider">
                Cost Distribution
              </th>
              <th class="px-4 py-3 text-right text-xs font-medium text-gray-700 dark:text-gray-400 tracking-wider w-28">
                <template v-if="showProforma">
                  <UTooltip text="Estimated proforma cost — extrapolated from billable tag distribution">
                    <span class="inline-flex items-center gap-1 cursor-help">
                      Est. Cost
                      <UIcon name="i-heroicons-information-circle" class="w-3 h-3" />
                    </span>
                  </UTooltip>
                </template>
                <template v-else>Total Cost</template>
              </th>
              <th class="px-4 py-3 text-right text-xs font-medium text-gray-700 dark:text-gray-400 tracking-wider w-16">
                %
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
            <tr v-if="!displayRows.length">
              <td colspan="5" class="px-4 py-8 text-center text-xs text-gray-500 dark:text-gray-400">
                No tag values match this filter.
              </td>
            </tr>
            <tr
              v-for="row in paginatedRows"
              :key="row.value"
              class="group transition-colors cursor-pointer"
              :class="selectedValue === row.value
                ? 'bg-blue-50 dark:bg-blue-900/30 ring-1 ring-inset ring-blue-300 dark:ring-blue-700'
                : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'"
              @click="!row.isUntagged && handleRowClick(row)"
            >
              <!-- Display Name: click-to-edit alias -->
              <td class="px-4 py-3" @click.stop>
                <div v-if="editingAlias === row.value && !row.isUntagged" class="flex items-center gap-1">
                  <UInput
                    v-model="editingAliasText"
                    size="xs"
                    autofocus
                    :placeholder="row.parsedValue"
                    class="max-w-[160px]"
                    @keydown.enter="confirmAliasEdit(row)"
                    @keydown.escape="cancelAliasEdit()"
                    @blur="confirmAliasEdit(row)"
                  />
                </div>
                <div v-else class="flex items-center gap-1.5">
                  <UTooltip
                    v-if="row.isUntagged"
                    text="Resources without this tag or with a blank value"
                  >
                    <span class="text-xs font-medium text-amber-400 cursor-help">
                      Untagged
                    </span>
                  </UTooltip>
                  <template v-else>
                    <span
                      class="text-xs font-medium text-blue-400 text-left truncate max-w-[160px] cursor-text"
                      :title="row.label"
                      @click.stop="startAliasEdit(row)"
                    >
                      {{ row.label }}
                    </span>
                    <UIcon
                      v-if="editable"
                      name="i-heroicons-pencil-square"
                      class="w-3 h-3 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 cursor-pointer"
                      @click.stop="startAliasEdit(row)"
                    />
                    <UIcon
                      v-if="selectedValue === row.value"
                      name="i-heroicons-check-circle-solid"
                      class="w-3.5 h-3.5 text-blue-500 flex-shrink-0"
                    />
                  </template>
                </div>
              </td>
              <!-- Raw Value -->
              <td class="px-4 py-3">
                <template v-if="row.isUntagged">
                  <span class="text-xs text-gray-400">&mdash;</span>
                </template>
                <template v-else>
                  <UTooltip :text="row.rawValues.join('\n')">
                    <span class="text-xs font-mono text-gray-500 dark:text-gray-400 truncate max-w-[150px] block">
                      {{ row.rawValues.length > 1 ? `${row.rawValues.length} source values` : row.rawValue }}
                    </span>
                  </UTooltip>
                </template>
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
              <td colspan="3" class="px-4 py-2 text-xs text-gray-500 dark:text-gray-400">
                <span v-if="displayRows.length">
                  Showing {{ paginationStart + 1 }}-{{ paginationEnd }} of {{ displayRows.length }} tag values
                </span>
                <span v-else>0 tag values</span>
                <button
                  v-if="zeroCostRows.length > 0"
                  class="ml-2 text-blue-500 hover:text-blue-400 underline underline-offset-2"
                  @click.stop="showZeroCost = !showZeroCost"
                >
                  {{ showZeroCost ? 'Hide' : 'Show' }} {{ zeroCostRows.length }} $0-cost values
                </button>
              </td>
              <td class="px-4 py-2 text-right text-xs font-semibold text-gray-900 dark:text-gray-100 font-mono">
                {{ formatCostValue(totalCost) }}
              </td>
              <td class="px-4 py-2 text-right text-xs text-gray-500 dark:text-gray-400">
                {{ totalPercentage.toFixed(1) }}%
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div v-if="displayRows.length > pageSize" class="mt-3 flex justify-end">
        <UPagination v-model="currentPage" :total="displayRows.length" :page-count="pageSize" />
      </div>

      <!-- Selected tag value detail panel -->
      <div
        v-if="selectedRow"
        ref="detailPanelRef"
        class="mt-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 animate-fadeIn"
      >
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0 flex-1 space-y-2">
            <div class="flex items-center gap-2">
              <UIcon name="i-heroicons-tag" class="w-4 h-4 text-blue-500 flex-shrink-0" />
              <span class="text-sm font-semibold text-blue-900 dark:text-blue-100 truncate">
                {{ selectedRow.label }}
              </span>
            </div>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <div class="text-gray-500 dark:text-gray-400">
                  <template v-if="showProforma">
                    <UTooltip text="Estimated proforma cost — extrapolated from billable distribution">
                      <span class="inline-flex items-center gap-0.5 cursor-help">Est. Cost <UIcon name="i-heroicons-information-circle" class="w-2.5 h-2.5" /></span>
                    </UTooltip>
                  </template>
                  <template v-else>Cost</template>
                </div>
                <div class="font-semibold text-gray-900 dark:text-gray-100 font-mono">{{ formatCostValue(selectedRow.cost) }}</div>
              </div>
              <div>
                <div class="text-gray-500 dark:text-gray-400">Share</div>
                <div class="font-semibold text-gray-900 dark:text-gray-100">{{ selectedRow.percentage.toFixed(1) }}%</div>
              </div>
              <div v-if="selectedRow.parsedValue !== selectedRow.label" class="col-span-2">
                <div class="text-gray-500 dark:text-gray-400">Parsed Value</div>
                <div class="font-medium text-gray-700 dark:text-gray-300 truncate" :title="selectedRow.parsedValue">{{ selectedRow.parsedValue }}</div>
              </div>
            </div>
            <div v-if="selectedRow.rawValues.length > 0">
              <div class="text-[10px] text-gray-400 dark:text-gray-500">
                {{ selectedRow.rawValues.length === 1 ? 'Raw' : 'Source values' }}:
                <span class="font-mono select-all">{{ selectedRow.rawValues.join(', ') }}</span>
              </div>
            </div>

            <!-- Service breakdown drill-down (only for tagged values) -->
            <template v-if="!selectedRow.isUntagged && showAccountBreakdown">
              <div class="mt-3 pt-3 border-t border-blue-200 dark:border-blue-800">
                <div v-if="loadingAccountContributions.includes(selectedRow.value)" class="flex items-center gap-2 py-3 text-xs text-gray-500 dark:text-gray-400">
                  <UIcon name="i-heroicons-arrow-path" class="h-4 w-4 animate-spin" />
                  Loading account contributions...
                </div>
                <TagValueAccountBreakdown
                  v-else
                  :accounts="selectedRow.accounts"
                  :tag-key="tagKey"
                  :tag-value="selectedRow.value"
                  :tag-value-label="selectedRow.label"
                  :period="period"
                  :data-mode="dataMode"
                  :proforma-available="proformaAvailable"
                />
              </div>
            </template>
            <template v-else-if="!selectedRow.isUntagged && accountId">
              <div class="mt-3 pt-3 border-t border-blue-200 dark:border-blue-800">
                <TagValueServiceBreakdown
                  :account-id="accountId"
                  :tag-key="tagKey"
                  :tag-values="selectedRow.rawValues"
                  :period="period"
                />
              </div>
              <div class="mt-3 pt-3 border-t border-blue-200 dark:border-blue-800">
                <TagValueTrend
                  :account-id="accountId"
                  :tag-key="tagKey"
                  :tag-values="selectedRow.rawValues"
                  :tag-value-label="selectedRow.label"
                  :period="period"
                />
              </div>
            </template>
          </div>
          <div class="flex items-center gap-1 flex-shrink-0">
            <UTooltip text="Copy raw value">
              <UButton
                icon="i-heroicons-clipboard-document"
                color="blue"
                variant="ghost"
                size="xs"
                @click="copyValue(selectedRow.rawValues.join('\n'))"
              />
            </UTooltip>
            <UTooltip text="Copy parsed value">
              <UButton
                icon="i-heroicons-clipboard"
                color="blue"
                variant="ghost"
                size="xs"
                @click="copyValue(selectedRow.parsedValue)"
              />
            </UTooltip>
            <UButton
              icon="i-heroicons-x-mark"
              color="gray"
              variant="ghost"
              size="xs"
              @click="selectedValue = null"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { formatCostValue } from '~/utils/cost-filters'
import type { TagValueAccountCost } from '~~/shared/types/cost-tags'
import { normalizeCostTagIdentity } from '~~/shared/utils/cost-tag-identities'

const logger = createLogger('TagCostBreakdown')

const props = withDefaults(defineProps<{
  /** Summary API response — expects .groups array with { groupKey, totalCost } */
  costData: any | null
  tagKey: string
  loading: boolean
  tagValueAliases?: Record<string, string>
  editable?: boolean
  accountId?: string
  period?: string
  dataMode?: 'billable' | 'proforma'
  proformaAvailable?: boolean
  showAccountBreakdown?: boolean
  accountContributions?: Record<string, TagValueAccountCost[]>
  loadingAccountContributions?: string[]
  percentageDenominator?: number | null
}>(), {
  tagValueAliases: () => ({}),
  editable: false,
  accountId: '',
  period: '',
  dataMode: 'proforma',
  proformaAvailable: false,
  showAccountBreakdown: false,
  accountContributions: () => ({}),
  loadingAccountContributions: () => [],
  percentageDenominator: null
})

const emit = defineEmits<{
  (e: 'select', row: TagRow): void
  (e: 'update:alias', payload: { tagKey: string; tagValue: string; alias: string }): void
}>()

export interface TagRow {
  value: string       // raw groupKey from API (may include tagKey$ prefix)
  rawValue: string    // original raw value for tooltip
  parsedValue: string // cleaned tag value after stripping prefix
  label: string       // display label (alias > parsed > raw)
  cost: number
  billableCost: number
  estimatedProformaCost?: number
  percentage: number
  isUntagged: boolean
  accounts: TagValueAccountCost[]
  rawValues: string[]
  isPerson: boolean
  creatorType?: string
}

const toast = useToast()

const showProforma = computed(() => props.dataMode === 'proforma' && props.proformaAvailable)

const selectedValue = ref<string | null>(null)
const showZeroCost = ref(false)
const tagValueSearch = ref('')
const currentPage = ref(1)
const pageSize = ref(25)
const pageSizeOptions = [
  { label: '25 per page', value: 25 },
  { label: '50 per page', value: 50 },
  { label: '100 per page', value: 100 }
]
const detailPanelRef = ref<HTMLElement | null>(null)

const editingAlias = ref<string | null>(null)
const editingAliasText = ref('')

const selectedRow = computed(() => {
  if (!selectedValue.value) return null
  return rows.value.find(r => r.value === selectedValue.value) || null
})

function getAlias(tagValue: string): string {
  const key = `${props.tagKey}::${tagValue}`
  return props.tagValueAliases[key] || ''
}

function startAliasEdit(row: TagRow) {
  if (!props.editable) return
  editingAlias.value = row.value
  editingAliasText.value = getAlias(row.value) || ''
}

function confirmAliasEdit(row: TagRow) {
  if (editingAlias.value !== row.value) return
  const newAlias = editingAliasText.value.trim()
  const currentAlias = getAlias(row.value)
  if (newAlias !== currentAlias) {
    emit('update:alias', { tagKey: props.tagKey, tagValue: row.value, alias: newAlias })
  }
  editingAlias.value = null
  editingAliasText.value = ''
}

function cancelAliasEdit() {
  editingAlias.value = null
  editingAliasText.value = ''
}

function handleRowClick(row: TagRow) {
  if (selectedValue.value === row.value) {
    selectedValue.value = null
  } else {
    selectedValue.value = row.value
    emit('select', row)
    nextTick(() => {
      detailPanelRef.value?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
  }
}

async function copyValue(value: string) {
  try {
    await navigator.clipboard.writeText(value)
    toast.add({
      title: 'Copied',
      description: value.length > 60 ? `${value.substring(0, 60)}...` : value,
      icon: 'i-heroicons-clipboard-document-check',
      color: 'green',
      timeout: 2000
    })
  } catch {
    // Fallback for older browsers
    const el = document.createElement('textarea')
    el.value = value
    document.body.appendChild(el)
    el.select()
    document.execCommand('copy')
    document.body.removeChild(el)
    toast.add({ title: 'Copied', icon: 'i-heroicons-clipboard-document-check', color: 'green', timeout: 2000 })
  }
}

/**
 * Parse an AWS Cost Explorer tag group key.
 * AWS returns keys in "tagKey$tagValue" format when grouping by TAG.
 * Also extracts human-readable parts from special AWS tag values.
 */
function parseTagValue(rawKey: string, tagKey: string): string {
  return normalizeCostTagIdentity(rawKey, tagKey).displayName
}

const rows = computed<TagRow[]>(() => {
  const groups: any[] = props.costData?.groups ?? props.costData?.data?.groups ?? []
  if (!groups.length) {
    if (props.costData) {
      logger.debug('Data received but no groups found. Keys:', Object.keys(props.costData))
    }
    return []
  }

  const getDisplayCost = (group: any) => showProforma.value && group.estimatedProformaCost !== undefined
    ? group.estimatedProformaCost
    : (group.billableCost ?? group.totalCost ?? group.cost ?? 0)
  const visibleTotal = groups.reduce((sum: number, group: any) => sum + getDisplayCost(group), 0)
  const percentageTotal = props.percentageDenominator && props.percentageDenominator > 0
    ? props.percentageDenominator
    : visibleTotal
  if (visibleTotal === 0) return []

  return groups
    .map((g: any): TagRow => {
      const rawValues: string[] = g.rawValues?.length ? g.rawValues : [g.tagValue ?? g.groupKey ?? '']
      const rawValue = rawValues[0] || ''
      const isUntagged = g.isUntagged ?? (rawValue === '$not_tagged' || rawValue === '' || rawValue === '__untagged__'
        || rawValue === `${props.tagKey}$`) // AWS returns "tagKey$" for untagged
      const billableCost = g.billableCost ?? g.totalCost ?? g.cost ?? 0
      const estimatedProformaCost = g.estimatedProformaCost
      const cost = getDisplayCost(g)
      const parsedValue = isUntagged ? 'Untagged' : (g.displayName || parseTagValue(rawValue, props.tagKey))
      const alias = getAlias(g.groupKey ?? rawValue)
      return {
        value: g.groupKey ?? rawValue,
        rawValue,
        rawValues,
        parsedValue,
        label: isUntagged ? 'Untagged' : (alias || parsedValue),
        cost,
        billableCost,
        estimatedProformaCost,
        percentage: percentageTotal > 0 ? (cost / percentageTotal) * 100 : 0,
        isUntagged,
        accounts: props.accountContributions[g.groupKey ?? rawValue] ?? g.accounts ?? [],
        isPerson: Boolean(g.isPerson),
        creatorType: g.creatorType
      }
    })
    .sort((a, b) => b.cost - a.cost)
})

const visibleRows = computed(() => rows.value.filter(r => r.cost > 0 || r.isUntagged))
const zeroCostRows = computed(() => rows.value.filter(r => r.cost <= 0 && !r.isUntagged))
const displayRows = computed(() => {
  const baseRows = showZeroCost.value ? rows.value : visibleRows.value
  const search = tagValueSearch.value.trim().toLowerCase()
  if (!search) return baseRows
  return baseRows.filter(row =>
    row.label.toLowerCase().includes(search) ||
    row.rawValue.toLowerCase().includes(search) ||
    row.parsedValue.toLowerCase().includes(search)
  )
})
const paginationStart = computed(() => (currentPage.value - 1) * pageSize.value)
const paginationEnd = computed(() => Math.min(paginationStart.value + pageSize.value, displayRows.value.length))
const paginatedRows = computed(() => displayRows.value.slice(paginationStart.value, paginationEnd.value))

const totalCost = computed(() =>
  rows.value.reduce((sum, r) => sum + r.cost, 0)
)
const totalPercentage = computed(() => {
  const denominator = props.percentageDenominator && props.percentageDenominator > 0
    ? props.percentageDenominator
    : totalCost.value
  return denominator > 0 ? (totalCost.value / denominator) * 100 : 0
})

// Clear selection when data changes
watch(() => props.costData, () => {
  selectedValue.value = null
  currentPage.value = 1
})
watch([tagValueSearch, showZeroCost, pageSize], () => {
  currentPage.value = 1
})
watch(() => displayRows.value.length, (length) => {
  const lastPage = Math.max(1, Math.ceil(length / pageSize.value))
  if (currentPage.value > lastPage) currentPage.value = lastPage
})

defineExpose({ rows, totalCost })
</script>

<style scoped>
.animate-fadeIn {
  animation: fadeIn 0.2s ease-in;
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
