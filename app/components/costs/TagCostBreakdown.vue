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
      <!-- Proforma estimation note -->
      <div v-if="showProforma" class="flex items-start gap-2 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-2 mb-3">
        <UIcon name="i-heroicons-exclamation-triangle" class="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
        <p class="text-xs text-amber-700 dark:text-amber-300">
          Costs shown are <strong>estimates</strong> &mdash; billable tag distribution applied to your proforma total of <strong>{{ formatCostValue(totalCost * proformaRatio!) }}</strong>. Percentages are exact. Not suitable for chargeback.
          <NuxtLink to="/support/docs?topic=cost-tags-guide" class="underline underline-offset-2 hover:text-amber-900 dark:hover:text-amber-100">Why estimated?</NuxtLink>
        </p>
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
            <tr
              v-for="row in displayRows"
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
                  <UTooltip :text="row.rawValue">
                    <span class="text-xs font-mono text-gray-500 dark:text-gray-400 truncate max-w-[150px] block">
                      {{ row.rawValue }}
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
                {{ showProforma ? formatCostValue(row.cost * proformaRatio!) : formatCostValue(row.cost) }}
              </td>
              <td class="px-4 py-3 text-right text-xs text-gray-500 dark:text-gray-400">
                {{ row.percentage.toFixed(1) }}%
              </td>
            </tr>
          </tbody>
          <tfoot class="bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
            <tr>
              <td colspan="3" class="px-4 py-2 text-xs text-gray-500 dark:text-gray-400">
                <span>{{ displayRows.length }} tag values</span>
                <button
                  v-if="zeroCostRows.length > 0"
                  class="ml-2 text-blue-500 hover:text-blue-400 underline underline-offset-2"
                  @click.stop="showZeroCost = !showZeroCost"
                >
                  {{ showZeroCost ? 'Hide' : 'Show' }} {{ zeroCostRows.length }} $0-cost values
                </button>
              </td>
              <td class="px-4 py-2 text-right text-xs font-semibold text-gray-900 dark:text-gray-100 font-mono">
                {{ showProforma ? formatCostValue(totalCost * proformaRatio!) : formatCostValue(totalCost) }}
              </td>
              <td class="px-4 py-2 text-right text-xs text-gray-500 dark:text-gray-400">
                100%
              </td>
            </tr>
          </tfoot>
        </table>
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
                <div class="font-semibold text-gray-900 dark:text-gray-100 font-mono">{{ showProforma ? formatCostValue(selectedRow.cost * proformaRatio!) : formatCostValue(selectedRow.cost) }}</div>
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
            <div v-if="selectedRow.rawValue !== selectedRow.parsedValue">
              <div class="text-[10px] text-gray-400 dark:text-gray-500">Raw: <span class="font-mono select-all">{{ selectedRow.rawValue }}</span></div>
            </div>

            <!-- Service breakdown drill-down (only for tagged values) -->
            <template v-if="!selectedRow.isUntagged && accountId">
              <div class="mt-3 pt-3 border-t border-blue-200 dark:border-blue-800">
                <TagValueServiceBreakdown
                  :account-id="accountId"
                  :tag-key="tagKey"
                  :tag-value="selectedRow.value"
                  :period="period"
                />
              </div>
              <div class="mt-3 pt-3 border-t border-blue-200 dark:border-blue-800">
                <TagValueTrend
                  :account-id="accountId"
                  :tag-key="tagKey"
                  :tag-value="selectedRow.value"
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
                @click="copyValue(selectedRow.rawValue)"
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
  proformaRatio?: number | null
  dataMode?: 'billable' | 'proforma'
}>(), {
  tagValueAliases: () => ({}),
  editable: false,
  accountId: '',
  period: '',
  proformaRatio: null,
  dataMode: 'proforma'
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
  percentage: number
  isUntagged: boolean
}

const toast = useToast()

const showProforma = computed(() => props.dataMode === 'proforma' && props.proformaRatio != null)

const selectedValue = ref<string | null>(null)
const showZeroCost = ref(false)
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
  if (!rawKey) return rawKey

  // Strip "tagKey$" prefix if present (AWS Cost Explorer format)
  let value = rawKey
  const dollarIdx = rawKey.indexOf('$')
  if (dollarIdx !== -1) {
    const prefix = rawKey.substring(0, dollarIdx)
    // Only strip if the prefix matches the tag key we're grouping by
    if (prefix === tagKey || prefix === '') {
      value = rawKey.substring(dollarIdx + 1)
    }
  }

  if (!value) return rawKey

  // Parse aws:createdBy values — extract email or role name
  // e.g. "AssumedRole:AROAXNNO7DI3QZTU5I44R:Michael.Neiderhauser@gd-ms.com" → "Michael.Neiderhauser@gd-ms.com"
  if (value.startsWith('AssumedRole:')) {
    const parts = value.split(':')
    if (parts.length >= 3) return parts[parts.length - 1]
  }

  // Parse "AWSService:serviceName" → "serviceName"
  if (value.startsWith('AWSService:')) {
    return value.substring('AWSService:'.length)
  }

  // Parse IAM user ARN-style: "arn:aws:iam::123456:user/username" → "username"
  if (value.includes(':user/')) {
    const userPart = value.split(':user/').pop()
    if (userPart) return userPart
  }

  // Parse IAM role ARN-style: "arn:aws:iam::123456:role/rolename" → "rolename"
  if (value.includes(':role/')) {
    const rolePart = value.split(':role/').pop()
    if (rolePart) return rolePart
  }

  return value
}

const rows = computed<TagRow[]>(() => {
  const groups: any[] = props.costData?.groups ?? props.costData?.data?.groups ?? []
  if (!groups.length) {
    if (props.costData) {
      logger.debug('Data received but no groups found. Keys:', Object.keys(props.costData))
    }
    return []
  }

  const totalRaw = groups.reduce((sum: number, g: any) => sum + (g.totalCost ?? g.cost ?? 0), 0)
  if (totalRaw === 0) return []

  return groups
    .map((g: any): TagRow => {
      const rawValue: string = g.groupKey ?? g.tagValue ?? ''
      const isUntagged = rawValue === '$not_tagged' || rawValue === '' || rawValue === '__untagged__'
        || rawValue === `${props.tagKey}$` // AWS returns "tagKey$" for untagged
      const cost = g.totalCost ?? g.cost ?? 0
      const parsedValue = isUntagged ? 'Untagged' : parseTagValue(rawValue, props.tagKey)
      const alias = getAlias(rawValue)
      return {
        value: rawValue,
        rawValue,
        parsedValue,
        label: isUntagged ? 'Untagged' : (alias || parsedValue),
        cost,
        percentage: totalRaw > 0 ? (cost / totalRaw) * 100 : 0,
        isUntagged
      }
    })
    .sort((a, b) => b.cost - a.cost)
})

const visibleRows = computed(() => rows.value.filter(r => r.cost > 0 || r.isUntagged))
const zeroCostRows = computed(() => rows.value.filter(r => r.cost <= 0 && !r.isUntagged))
const displayRows = computed(() => showZeroCost.value ? rows.value : visibleRows.value)

const totalCost = computed(() =>
  rows.value.reduce((sum, r) => sum + r.cost, 0)
)

// Clear selection when data changes
watch(() => props.costData, () => {
  selectedValue.value = null
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
