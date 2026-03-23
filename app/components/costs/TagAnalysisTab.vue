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
          <span v-if="hiddenTagCount > 0" class="text-xs text-gray-400 dark:text-gray-500">
            ({{ hiddenTagCount }} tag{{ hiddenTagCount === 1 ? '' : 's' }} with $0 cost hidden)
          </span>
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
          <UTooltip text="Tag Settings">
            <UButton
              icon="i-heroicons-adjustments-horizontal"
              color="gray"
              variant="ghost"
              size="sm"
              @click="showSettings = true"
            />
          </UTooltip>
        </div>

        <!-- Proforma estimation banner -->
        <div v-if="selectedTag && showProforma && tagCoverage && !isLoadingCoverage" class="flex items-start gap-2 rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 px-3 py-2">
          <UIcon name="i-heroicons-information-circle" class="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
          <p class="text-xs text-blue-700 dark:text-blue-300">
            Dollar amounts below are <strong>estimated proforma costs</strong> extrapolated from billable tag distribution. Percentages are exact.
            <NuxtLink to="/support/docs?topic=cost-tags-guide" class="underline underline-offset-2 hover:text-blue-900 dark:hover:text-blue-100">Learn why</NuxtLink>
          </p>
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
            <div class="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              {{ showProforma ? 'Tagged Cost (est.)' : 'Tagged Cost' }}
            </div>
            <div class="text-3xl font-bold text-green-600 dark:text-green-400">
              {{ showProforma ? formatCostValue(tagCoverage.totalTaggedCost * proformaRatio!) : formatCostValue(tagCoverage.totalTaggedCost) }}
            </div>
            <div class="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {{ showProforma ? 'Estimated proforma' : `Resources with "${selectedTag}"` }}
            </div>
          </div>

          <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4"
            :class="untaggedIsHigh ? 'border-amber-300 dark:border-amber-600' : ''"
          >
            <div class="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              {{ showProforma ? 'Untagged Cost (est.)' : 'Untagged Cost' }}
            </div>
            <div class="text-3xl font-bold" :class="untaggedIsHigh ? 'text-amber-600 dark:text-amber-400' : 'text-gray-700 dark:text-gray-300'">
              {{ showProforma ? formatCostValue(tagCoverage.totalUntaggedCost * proformaRatio!) : formatCostValue(tagCoverage.totalUntaggedCost) }}
            </div>
            <div class="text-xs mt-1" :class="untaggedIsHigh ? 'text-amber-600 dark:text-amber-400' : 'text-gray-500 dark:text-gray-400'">
              {{ untaggedIsHigh ? 'High untagged spend detected' : (showProforma ? 'Estimated proforma' : 'Resources without this tag') }}
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
          :account-id="accountId"
          :period="activePeriod"
          :proforma-ratio="showProforma ? proformaRatio : null"
          :data-mode="dataMode"
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
          :period="activePeriod"
        />
      </div>

      <!-- Tag Settings Slideover -->
      <TagConfigManager
        v-model="showSettings"
        :account-id="accountId"
        :environment="environment"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { formatCostValue } from '~/utils/cost-filters'
import { downloadBlob } from '~/utils/export/export-utils'
import type { AccountCostTagConfig } from '~~/shared/types/cost-tags'

const props = withDefaults(defineProps<{
  selectedAccounts: string[]
  selectedTimeframe?: string
  dataMode?: 'billable' | 'proforma'
}>(), {
  dataMode: 'proforma'
})

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
const showSettings = ref(false)
const breakdownData = ref<any>(null)
const isLoadingBreakdown = ref(false)
const draftAliases = ref<Record<string, string>>({})
const aliasesDirty = ref(false)
const tagsWithCost = ref<string[]>([])
const hiddenTagCount = ref(0)

// Proforma ratio state
const proformaTotals = ref<{ billableTotal: number; proformaTotal: number } | null>(null)

const proformaRatio = computed(() => {
  if (!proformaTotals.value) return null
  const { billableTotal, proformaTotal } = proformaTotals.value
  if (billableTotal <= 0) return null
  return proformaTotal / billableTotal
})

const showProforma = computed(() => props.dataMode === 'proforma' && proformaRatio.value !== null)

// Use global timeframe from parent (values already match API period params)
const activePeriod = computed(() => props.selectedTimeframe || 'last90days')

// Build tag select options: use filtered tags (with cost), important tags first
const tagSelectOptions = computed(() => {
  const important = tagConfig.value?.importantTags || []
  const all = tagsWithCost.value.length > 0 ? tagsWithCost.value : (availableTags.value || [])
  const options: { label: string; value: string; disabled?: boolean }[] = []

  if (important.length > 0) {
    const importantWithCost = important.filter(t => all.includes(t))
    if (importantWithCost.length > 0) {
      options.push({ label: '--- Important Tags ---', value: '__divider_imp__', disabled: true })
      importantWithCost.forEach(t => options.push({ label: t, value: t }))
      options.push({ label: '--- All Tags ---', value: '__divider_all__', disabled: true })
    }
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


// Fetch cost breakdown for selected tag
async function fetchBreakdown() {
  if (!selectedTag.value || !accountId.value) return

  isLoadingBreakdown.value = true
  try {
    const response = await $fetch('/api/costs/summary', {
      params: {
        groupBy: `TAG:${selectedTag.value}`,
        accountIds: accountId.value,
        period: activePeriod.value
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

// Fetch proforma/billable totals for ratio computation
async function fetchProformaRatio() {
  if (!accountId.value || props.dataMode !== 'proforma') {
    proformaTotals.value = null
    return
  }
  try {
    const response = await $fetch('/api/costs/summary', {
      params: {
        proforma: 'true',
        groupBy: 'NONE',
        accountIds: accountId.value,
        period: activePeriod.value
      }
    }) as any
    const billableTotal = parseFloat(response?.billable?.total?.UnblendedCost?.Amount || '0')
    const proformaTotal = parseFloat(response?.proforma?.total?.UnblendedCost?.Amount || '0')
    proformaTotals.value = { billableTotal, proformaTotal }
  } catch (err) {
    console.error('Error fetching proforma ratio:', err)
    proformaTotals.value = null
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

  const hasProforma = showProforma.value && proformaRatio.value !== null
  const headers = hasProforma
    ? ['Display Name', 'Raw Value', 'Tag Value (Parsed)', 'Billable Cost ($)', 'Est. Proforma Cost ($)', 'Percentage (%)']
    : ['Display Name', 'Raw Value', 'Tag Value (Parsed)', 'Cost ($)', 'Percentage (%)']
  const lines = [headers.join(',')]

  rows.forEach((row: any) => {
    const cols = [
      escCSV(row.label),
      escCSV(row.rawValue || row.value),
      escCSV(row.parsedValue || row.label),
      (row.cost || 0).toFixed(2)
    ]
    if (hasProforma) cols.push(((row.cost || 0) * proformaRatio.value!).toFixed(2))
    cols.push((row.percentage || 0).toFixed(2))
    lines.push(cols.join(','))
  })

  // Append summary
  const total = breakdownRef.value?.totalCost || 0
  lines.push('')
  if (hasProforma) {
    const proformaTotal = proformaTotals.value?.proformaTotal || 0
    lines.push(`Total,,,${total.toFixed(2)},${proformaTotal.toFixed(2)},100.00`)
  } else {
    lines.push(`Total,,,"${total.toFixed(2)}",100.00`)
  }

  // Append metadata
  lines.push('')
  lines.push(`# Account: ${accountId.value}`)
  lines.push(`# Tag Key: ${selectedTag.value}`)
  lines.push(`# Period: ${activePeriod.value}`)
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
  logUserAction('export.csv', 'source:tag-analysis')
}

// Initial data load when single account is selected
async function loadInitialData() {
  if (props.selectedAccounts.length !== 1) return

  draftAliases.value = {}
  aliasesDirty.value = false
  tagsWithCost.value = []
  hiddenTagCount.value = 0
  proformaTotals.value = null

  const [tags] = await Promise.all([
    fetchAvailableTags([accountId.value]),
    fetchAccountTagConfig(accountId.value),
    fetchProformaRatio()
  ])

  // Filter tags to only those with actual charges
  if (tags.length > 0) {
    const costChecks = await Promise.allSettled(
      tags.map(tag =>
        $fetch('/api/costs/summary', {
          params: {
            groupBy: `TAG:${tag}`,
            accountIds: accountId.value,
            period: 'last90days'
          }
        })
      )
    )

    const filtered: string[] = []
    costChecks.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        const data = (result.value as any)?.data || result.value
        const groups: any[] = data?.groups || []
        // Keep if any non-untagged group has cost > 0
        const hasCharges = groups.some((g: any) => {
          const key: string = g.groupKey ?? ''
          const isUntagged = key === '$not_tagged' || key === '' || key === '__untagged__' || key === `${tags[i]}$`
          return !isUntagged && (g.totalCost ?? 0) > 0
        })
        if (hasCharges) filtered.push(tags[i])
      } else {
        // On failure, keep the tag (don't hide it)
        filtered.push(tags[i])
      }
    })

    tagsWithCost.value = filtered
    hiddenTagCount.value = tags.length - filtered.length
  }

  // Set default selected tag (using filtered list)
  const effectiveTags = tagsWithCost.value.length > 0 ? tagsWithCost.value : tags
  const defaultTag = tagConfig.value?.defaultGroupByTag
  const importantTags = tagConfig.value?.importantTags || []

  if (defaultTag && effectiveTags.includes(defaultTag)) {
    selectedTag.value = defaultTag
  } else if (importantTags.length > 0 && effectiveTags.includes(importantTags[0])) {
    selectedTag.value = importantTags[0]
  } else if (effectiveTags.length > 0) {
    selectedTag.value = effectiveTags[0]
  } else {
    selectedTag.value = null
  }
}

function refreshAll() {
  if (selectedTag.value) {
    fetchTagCoverage(selectedTag.value, [accountId.value], activePeriod.value)
    fetchBreakdown()
    fetchProformaRatio()
  }
}

// Watch for tag/period changes to fetch data
watch([selectedTag, activePeriod], ([tag, period]) => {
  if (!tag || !accountId.value) return
  fetchTagCoverage(tag, [accountId.value], period)
  fetchBreakdown()
  fetchProformaRatio()
  logUserAction('cost.tag_drilldown', `tag:${tag}`)
})

// Watch for account changes
watch(accountId, () => {
  loadInitialData()
}, { immediate: true })
</script>
