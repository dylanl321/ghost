<template>
  <div>
    <!-- Multi-account gate -->
    <div v-if="selectedAccounts.length !== 1" class="flex items-center justify-center py-16">
      <div class="text-center max-w-md">
        <UIcon name="i-heroicons-tag" class="w-16 h-16 text-gray-400 mx-auto mb-4 opacity-50" />
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">Select a Single Account</h3>
        <p class="text-sm text-gray-500 dark:text-gray-400">
          Tag analysis provides deep cost breakdown by tag for a single account.
          Select exactly one account from the sidebar to get started.
        </p>
      </div>
    </div>

    <!-- Single account selected -->
    <div v-else class="space-y-6">
      <!-- Section A: Tag Selector + Coverage Stats -->
      <div class="space-y-4">
        <div class="flex items-center gap-3 flex-wrap">
          <USelectMenu
            v-model="selectedTag"
            :options="tagSelectOptions"
            value-attribute="value"
            option-attribute="label"
            placeholder="Select a tag..."
            size="sm"
            class="w-56"
            :loading="isLoadingTags"
          />
          <USelectMenu
            v-model="selectedPeriod"
            :options="periodOptions"
            value-attribute="value"
            option-attribute="label"
            size="sm"
            class="w-44"
          />
          <UTooltip text="Refresh data">
            <UButton
              color="gray"
              variant="ghost"
              icon="i-heroicons-arrow-path"
              size="sm"
              :loading="isLoadingCoverage || isLoadingBreakdown"
              @click="refreshAll"
            />
          </UTooltip>
          <UTooltip text="Export breakdown as CSV">
            <UButton
              icon="i-heroicons-arrow-down-tray"
              color="gray"
              variant="ghost"
              size="sm"
              :disabled="!breakdownRef?.rows?.length"
              @click="exportBreakdownCSV"
            />
          </UTooltip>
        </div>

        <!-- Coverage stat cards -->
        <div v-if="selectedTag && tagCoverage && !isLoadingCoverage" class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <div class="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Coverage</div>
            <div class="text-3xl font-bold" :class="coverageColorClass">
              {{ tagCoverage.overallCoverage.toFixed(1) }}%
            </div>
            <div class="mt-2 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
              <div
                class="h-2 rounded-full transition-all duration-500"
                :class="coverageBarClass"
                :style="{ width: `${tagCoverage.overallCoverage}%` }"
              />
            </div>
          </div>

          <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <div class="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Tagged Cost</div>
            <div class="text-3xl font-bold text-green-600 dark:text-green-400">
              {{ formatCostValue(tagCoverage.totalTaggedCost) }}
            </div>
            <div class="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Resources with "{{ selectedTag }}"
            </div>
          </div>

          <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4"
            :class="untaggedIsHigh ? 'border-amber-300 dark:border-amber-600' : ''"
          >
            <div class="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Untagged Cost</div>
            <div class="text-3xl font-bold" :class="untaggedIsHigh ? 'text-amber-600 dark:text-amber-400' : 'text-gray-700 dark:text-gray-300'">
              {{ formatCostValue(tagCoverage.totalUntaggedCost) }}
            </div>
            <div class="text-xs mt-1" :class="untaggedIsHigh ? 'text-amber-600 dark:text-amber-400' : 'text-gray-500 dark:text-gray-400'">
              {{ untaggedIsHigh ? 'High untagged spend detected' : 'Resources without this tag' }}
            </div>
          </div>
        </div>

        <!-- Loading coverage -->
        <div v-if="selectedTag && isLoadingCoverage" class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-6 text-center">
          <UIcon name="i-heroicons-arrow-path" class="w-5 h-5 animate-spin text-blue-500 mx-auto mb-2" />
          <p class="text-sm text-gray-400">Calculating tag coverage...</p>
        </div>
      </div>

      <!-- Section B: Cost Breakdown Table -->
      <div v-if="selectedTag">
        <div class="flex items-center justify-between mb-2">
          <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300">Cost Breakdown</h3>
          <UButton
            v-if="aliasesDirty"
            color="blue"
            variant="soft"
            size="xs"
            :loading="isSavingConfig"
            @click="saveAliases"
          >
            Save Aliases
          </UButton>
        </div>
        <TagCostBreakdown
          ref="breakdownRef"
          :cost-data="breakdownData"
          :tag-key="selectedTag"
          :loading="isLoadingBreakdown"
          :tag-value-aliases="currentAliases"
          :editable="true"
          @update:alias="handleAliasUpdate"
        />
      </div>

      <!-- Section C: Historical Trend Chart -->
      <div v-if="selectedTag">
        <TagHistoricalTrend
          ref="trendRef"
          :account-id="accountId"
          :tag-key="selectedTag"
          :tag-value-aliases="currentAliases"
          :period="selectedPeriod"
        />
      </div>

      <!-- Section D: Tag Configuration (Collapsible) -->
      <UCard>
        <template #header>
          <button
            class="flex items-center justify-between w-full text-left"
            @click="configExpanded = !configExpanded"
          >
            <div class="flex items-center gap-2">
              <UIcon name="i-heroicons-cog-6-tooth" class="w-4 h-4 text-gray-500" />
              <span class="text-sm font-semibold text-gray-700 dark:text-gray-300">Tag Configuration</span>
            </div>
            <UIcon
              :name="configExpanded ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'"
              class="w-4 h-4 text-gray-400"
            />
          </button>
        </template>
        <div v-if="configExpanded">
          <TagConfigManager
            :account-id="accountId"
            :environment="environment"
            mode="inline"
          />
        </div>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { formatCostValue } from '~/utils/cost-filters'
import { downloadBlob } from '~/utils/export/export-utils'
import type { AccountCostTagConfig } from '~~/shared/types/cost-tags'

const props = defineProps<{
  selectedAccounts: string[]
}>()

const enclaveStore = useEnclaveStore()
const toast = useToast()

const accountId = computed(() => props.selectedAccounts[0] || '')
const environment = computed(() => {
  const enc = enclaveStore.enclaves[accountId.value]
  return enc?.awsGovCloudAccountID ? 'govcloud' : 'commercial'
})

// Template refs for child components
const breakdownRef = ref<any>(null)
const trendRef = ref<any>(null)

// Cost tags composable
const {
  availableTags,
  tagCoverage,
  tagConfig,
  isLoadingTags,
  isLoadingCoverage,
  isLoadingConfig,
  isSavingConfig,
  fetchAvailableTags,
  fetchTagCoverage,
  fetchAccountTagConfig,
  saveAccountTagConfig
} = useCostTags()

// Local state
const selectedTag = ref<string | null>(null)
const selectedPeriod = ref('last90Days')
const configExpanded = ref(false)
const breakdownData = ref<any>(null)
const isLoadingBreakdown = ref(false)
const draftAliases = ref<Record<string, string>>({})
const aliasesDirty = ref(false)

const periodOptions = [
  { label: 'This Month', value: 'thisMonth' },
  { label: 'Last Month', value: 'lastMonth' },
  { label: 'Last 90 Days', value: 'last90Days' },
  { label: 'Year to Date', value: 'ytd' },
  { label: 'Last 12 Months', value: 'last12Months' }
]

// Build tag select options: important tags first, then rest
const tagSelectOptions = computed(() => {
  const important = tagConfig.value?.importantTags || []
  const all = availableTags.value || []
  const options: { label: string; value: string; disabled?: boolean }[] = []

  if (important.length > 0) {
    options.push({ label: '--- Important Tags ---', value: '__divider_imp__', disabled: true })
    important.forEach(t => options.push({ label: t, value: t }))
    options.push({ label: '--- All Tags ---', value: '__divider_all__', disabled: true })
  }

  all.filter(t => !important.includes(t)).forEach(t => options.push({ label: t, value: t }))
  return options
})

// Coverage display helpers
const coverageColorClass = computed(() => {
  const cov = tagCoverage.value?.overallCoverage ?? 0
  if (cov >= 80) return 'text-green-600 dark:text-green-400'
  if (cov >= 50) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
})

const coverageBarClass = computed(() => {
  const cov = tagCoverage.value?.overallCoverage ?? 0
  if (cov >= 80) return 'bg-green-500'
  if (cov >= 50) return 'bg-amber-500'
  return 'bg-red-500'
})

const untaggedIsHigh = computed(() => {
  if (!tagCoverage.value) return false
  return tagCoverage.value.overallCoverage < 70
})

// Current aliases: merge saved config with local drafts
const currentAliases = computed(() => ({
  ...(tagConfig.value?.tagValueAliases || {}),
  ...draftAliases.value
}))

// Period-to-API mapping for summary endpoint
const periodToSummaryPeriod: Record<string, string> = {
  thisMonth: 'thisMonth',
  lastMonth: 'lastMonth',
  last90Days: 'last90days',
  ytd: 'ytd',
  last12Months: 'last12months'
}

// Fetch cost breakdown for selected tag
async function fetchBreakdown() {
  if (!selectedTag.value || !accountId.value) return

  isLoadingBreakdown.value = true
  try {
    const response = await $fetch('/api/costs/summary', {
      params: {
        groupBy: `TAG:${selectedTag.value}`,
        accountIds: accountId.value,
        period: periodToSummaryPeriod[selectedPeriod.value] || 'last90days'
      }
    }) as any
    breakdownData.value = response?.data || response || null
  } catch (err: any) {
    console.error('Error fetching tag breakdown:', err)
    breakdownData.value = null
  } finally {
    isLoadingBreakdown.value = false
  }
}

// Handle alias updates
function handleAliasUpdate(payload: { tagKey: string; tagValue: string; alias: string }) {
  const key = `${payload.tagKey}::${payload.tagValue}`
  if (payload.alias) {
    draftAliases.value = { ...draftAliases.value, [key]: payload.alias }
  } else {
    const { [key]: _, ...rest } = draftAliases.value
    draftAliases.value = rest
  }
  aliasesDirty.value = true
}

async function saveAliases() {
  if (!accountId.value || !tagConfig.value) return

  const merged: AccountCostTagConfig = {
    ...tagConfig.value,
    tagValueAliases: { ...(tagConfig.value.tagValueAliases || {}), ...draftAliases.value }
  }

  // Remove empty aliases
  if (merged.tagValueAliases) {
    Object.entries(merged.tagValueAliases).forEach(([k, v]) => {
      if (!v) delete merged.tagValueAliases![k]
    })
  }

  try {
    await saveAccountTagConfig(accountId.value, merged)
    draftAliases.value = {}
    aliasesDirty.value = false
    toast.add({
      title: 'Aliases Saved',
      description: 'Tag value aliases updated successfully',
      icon: 'i-heroicons-check-circle',
      color: 'green'
    })
  } catch {
    toast.add({
      title: 'Save Failed',
      description: 'Could not save aliases. Please try again.',
      icon: 'i-heroicons-x-circle',
      color: 'red'
    })
  }
}

// Export breakdown table as CSV
function exportBreakdownCSV() {
  const rows = breakdownRef.value?.rows
  if (!rows?.length) return

  const escCSV = (v: any) => {
    const s = String(v ?? '')
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
  }

  const headers = ['Tag Value (Raw)', 'Tag Value (Parsed)', 'Alias', 'Cost ($)', 'Percentage (%)']
  const lines = [headers.join(',')]

  rows.forEach((row: any) => {
    lines.push([
      escCSV(row.rawValue || row.value),
      escCSV(row.parsedValue || row.label),
      escCSV(currentAliases.value[`${selectedTag.value}::${row.value}`] || ''),
      (row.cost || 0).toFixed(2),
      (row.percentage || 0).toFixed(2)
    ].join(','))
  })

  // Append summary
  const total = breakdownRef.value?.totalCost || 0
  lines.push('')
  lines.push(`Total,,,"${total.toFixed(2)}",100.00`)

  // Append metadata
  lines.push('')
  lines.push(`# Account: ${accountId.value}`)
  lines.push(`# Tag Key: ${selectedTag.value}`)
  lines.push(`# Period: ${periodOptions.find(p => p.value === selectedPeriod.value)?.label || selectedPeriod.value}`)
  lines.push(`# Exported: ${new Date().toISOString()}`)

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const timestamp = new Date().toISOString().slice(0, 10)
  downloadBlob(blob, `tag-breakdown-${selectedTag.value}-${accountId.value}-${timestamp}.csv`)

  toast.add({
    title: 'Exported',
    description: `Tag breakdown exported as CSV (${rows.length} rows)`,
    icon: 'i-heroicons-arrow-down-tray',
    color: 'green'
  })
}

// Initial data load when single account is selected
async function loadInitialData() {
  if (props.selectedAccounts.length !== 1) return

  draftAliases.value = {}
  aliasesDirty.value = false

  const [tags] = await Promise.all([
    fetchAvailableTags([accountId.value]),
    fetchAccountTagConfig(accountId.value)
  ])

  // Set default selected tag
  const defaultTag = tagConfig.value?.defaultGroupByTag
  const importantTags = tagConfig.value?.importantTags || []

  if (defaultTag && tags.includes(defaultTag)) {
    selectedTag.value = defaultTag
  } else if (importantTags.length > 0 && tags.includes(importantTags[0])) {
    selectedTag.value = importantTags[0]
  } else if (tags.length > 0) {
    selectedTag.value = tags[0]
  } else {
    selectedTag.value = null
  }
}

function refreshAll() {
  if (selectedTag.value) {
    fetchTagCoverage(selectedTag.value, [accountId.value], periodToSummaryPeriod[selectedPeriod.value])
    fetchBreakdown()
  }
}

// Watch for tag/period changes to fetch data
watch([selectedTag, selectedPeriod], ([tag, period]) => {
  if (!tag || !accountId.value) return
  fetchTagCoverage(tag, [accountId.value], periodToSummaryPeriod[period] || 'last90days')
  fetchBreakdown()
})

// Watch for account changes
watch(accountId, () => {
  loadInitialData()
}, { immediate: true })
</script>
