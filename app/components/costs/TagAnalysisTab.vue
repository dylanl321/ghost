<template>
  <div class="space-y-4">
    <header class="border-b border-gray-200 dark:border-gray-700 pb-4">
      <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div class="min-w-0">
          <p class="text-xs font-medium text-gray-500 dark:text-gray-400">Tag Analysis</p>
          <h2 class="mt-0.5 break-words text-2xl font-semibold text-gray-900 dark:text-white">
            {{ selectedTag || (isLoadingTags ? 'Loading tag keys...' : 'Choose a tag key') }}
          </h2>
          <p v-if="configuredTagDescription" class="mt-1 max-w-3xl text-sm text-gray-600 dark:text-gray-300">
            {{ configuredTagDescription }}
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <UButton
            color="gray"
            variant="soft"
            icon="i-heroicons-arrow-path"
            size="sm"
            :loading="isLoadingTags || isLoadingCoverage"
            @click="refreshAll"
          >
            Refresh
          </UButton>
          <UButton
            icon="i-heroicons-arrow-down-tray"
            color="gray"
            variant="soft"
            size="sm"
            :disabled="!tagCoverage?.values?.length"
            @click="exportBreakdownCSV"
          >
            Export
          </UButton>
          <UButton
            icon="i-heroicons-adjustments-horizontal"
            color="gray"
            variant="soft"
            size="sm"
            @click="openSettings"
          >
            Tag Settings
          </UButton>
        </div>
      </div>

      <div class="mt-4 flex flex-col gap-3 xl:flex-row xl:items-end">
        <div class="w-full sm:w-72">
          <label class="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">Tag key</label>
          <USelectMenu
            :model-value="selectedTag ?? undefined"
            :options="tagSelectOptions"
            value-attribute="value"
            option-attribute="label"
            placeholder="Select a tag..."
            size="sm"
            class="w-full"
            :loading="isLoadingTags"
            @update:model-value="selectedTag = $event ?? null"
          />
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <UBadge color="gray" variant="soft" size="sm">
            <UIcon name="i-heroicons-building-office" class="mr-1 h-3.5 w-3.5" />
            {{ scopeLabel }}
          </UBadge>
          <UBadge color="gray" variant="soft" size="sm">
            <UIcon name="i-heroicons-calendar-days" class="mr-1 h-3.5 w-3.5" />
            {{ timeframeLabel }}
          </UBadge>
          <UBadge :color="dataMode === 'proforma' ? 'blue' : 'gray'" variant="soft" size="sm">
            <UIcon name="i-heroicons-banknotes" class="mr-1 h-3.5 w-3.5" />
            {{ modeLabel }}
          </UBadge>
          <UButtonGroup v-if="isCreatedBy" size="xs">
            <UButton
              :color="createdByView === 'people' ? 'blue' : 'gray'"
              :variant="createdByView === 'people' ? 'solid' : 'outline'"
              @click="createdByView = 'people'"
            >
              People
            </UButton>
            <UButton
              :color="createdByView === 'all' ? 'blue' : 'gray'"
              :variant="createdByView === 'all' ? 'solid' : 'outline'"
              @click="createdByView = 'all'"
            >
              All creators
            </UButton>
          </UButtonGroup>
          <UBadge v-else color="gray" variant="soft" size="sm">
            <UIcon name="i-heroicons-list-bullet" class="mr-1 h-3.5 w-3.5" />
            All tag values
          </UBadge>
        </div>
      </div>
    </header>

    <div v-if="tagsError" class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
      {{ tagsError }}
    </div>
    <div v-if="coverageError" class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
      {{ coverageError }}
    </div>

    <div
      v-if="selectedTag"
      class="flex items-start gap-2 rounded-md border px-3 py-2"
      :class="dataBasisClasses"
    >
      <UIcon :name="dataBasisIcon" class="mt-0.5 h-4 w-4 flex-shrink-0" />
      <p class="text-xs">
        <template v-if="dataMode === 'billable'">
          Exact billable Cost Explorer tag data is shown. Account-level proforma totals remain the source for chargeback.
        </template>
        <template v-else-if="tagCoverage && !proformaAvailable">
          A complete proforma estimate is unavailable for this scope, so exact billable tag costs are shown instead.
        </template>
        <template v-else>
          Tag costs are account-and-month weighted proforma estimates based on billable tag distribution. They are directional and not suitable for chargeback.
        </template>
        <NuxtLink to="/support/docs?topic=cost-tags-guide" class="ml-1 underline underline-offset-2">Learn more</NuxtLink>
      </p>
    </div>

    <div
      v-if="selectedTag && tagCoverage && !isLoadingCoverage"
      class="grid grid-cols-1 overflow-hidden rounded-md border border-gray-200 bg-white sm:grid-cols-3 sm:divide-x dark:border-gray-700 dark:bg-gray-900 dark:divide-gray-700"
    >
      <div class="px-4 py-3">
        <div class="flex items-baseline justify-between gap-3">
          <span class="text-xs font-medium text-gray-500 dark:text-gray-400">Coverage</span>
          <span class="text-lg font-semibold" :class="coverageColorClass">{{ tagCoverage.overallCoverage.toFixed(1) }}%</span>
        </div>
        <div class="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
          <div class="h-1.5 rounded-full transition-all duration-500" :class="coverageBarClass" :style="{ width: `${tagCoverage.overallCoverage}%` }" />
        </div>
      </div>
      <div class="border-t border-gray-200 px-4 py-3 sm:border-t-0 dark:border-gray-700">
        <div class="flex items-baseline justify-between gap-3">
          <span class="text-xs font-medium text-gray-500 dark:text-gray-400">Tagged Cost{{ showProforma ? ' (est.)' : '' }}</span>
          <span class="text-lg font-semibold text-green-600 dark:text-green-400">{{ formatCostValue(displayTaggedCost) }}</span>
        </div>
      </div>
      <div class="border-t border-gray-200 px-4 py-3 sm:border-t-0 dark:border-gray-700">
        <div class="flex items-baseline justify-between gap-3">
          <span class="text-xs font-medium text-gray-500 dark:text-gray-400">Untagged Cost{{ showProforma ? ' (est.)' : '' }}</span>
          <span class="text-lg font-semibold" :class="untaggedIsHigh ? 'text-amber-600 dark:text-amber-400' : 'text-gray-700 dark:text-gray-300'">
            {{ formatCostValue(displayUntaggedCost) }}
          </span>
        </div>
      </div>
    </div>

    <div v-if="selectedTag && isLoadingCoverage" class="rounded-md border border-gray-200 bg-white px-4 py-3 text-center dark:border-gray-700 dark:bg-gray-900">
      <div class="flex items-center justify-center gap-2 text-sm text-gray-500 dark:text-gray-400">
        <UIcon name="i-heroicons-arrow-path" class="h-4 w-4 animate-spin text-blue-500" />
        Calculating tag costs across {{ scopeLabel.toLowerCase() }}...
      </div>
    </div>

    <div v-if="!isLoadingTags && availableTags.length === 0 && !tagsError" class="rounded-md border border-gray-200 py-10 text-center dark:border-gray-700">
      <UIcon name="i-heroicons-tag" class="mx-auto mb-2 h-8 w-8 text-gray-400" />
      <p class="text-sm text-gray-500 dark:text-gray-400">No active cost allocation tags were found for this scope and timeframe.</p>
    </div>

    <div v-if="selectedTag">
      <div class="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300">Cost Breakdown</h3>
          <p v-if="isCreatedBy && createdByView === 'people'" class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            {{ peopleValues.length }} people · {{ formatCostValue(peopleDisplayCost) }} · {{ peopleShareOfAllSpend.toFixed(1) }}% of all spend
          </p>
        </div>
        <UButton v-if="aliasesDirty && isSingleAccount" color="blue" variant="soft" size="xs" :loading="isSavingConfig" @click="saveAliases">
          Save Aliases
        </UButton>
      </div>
      <TagCostBreakdown
        ref="breakdownRef"
        :cost-data="breakdownData"
        :tag-key="selectedTag"
        :loading="isLoadingCoverage"
        :tag-value-aliases="currentAliases"
        :editable="isSingleAccount"
        :account-id="accountId"
        :period="activePeriod"
        :data-mode="dataMode"
        :proforma-available="proformaAvailable"
        :show-account-breakdown="!isSingleAccount"
        :percentage-denominator="scopeDisplayTotal"
        @update:alias="handleAliasUpdate"
      />
    </div>

    <TagHistoricalTrend
      v-if="selectedTag"
      ref="trendRef"
      :account-ids="selectedAccounts"
      :tag-key="selectedTag"
      :tag-value-aliases="currentAliases"
      :period="activePeriod"
      :creator-view="createdByView"
    />

    <TagConfigManager
      v-if="isSingleAccount"
      v-model="showSettings"
      :account-id="accountId"
      :environment="environment"
      @saved="handleSettingsSaved"
    />

    <UModal v-model="showScopeSettings" :ui="{ width: 'sm:max-w-md' }">
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-adjustments-horizontal" class="h-5 w-5 text-gray-500" />
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Tag Settings</h3>
          </div>
        </template>
        <p class="text-sm text-gray-600 dark:text-gray-300">
          Favorites, default tags, notes, and aliases are account-specific. Select exactly one account in the account selector to view or edit its settings.
        </p>
        <template #footer>
          <div class="flex justify-end">
            <UButton color="gray" variant="soft" @click="showScopeSettings = false">Close</UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { formatCostValue } from '~/utils/cost-filters'
import { downloadBlob } from '~/utils/export/export-utils'
import { resolveCostTagSelection } from '~/utils/cost-tag-workspace'
import type { CostTagCreatorView } from '~/utils/cost-tag-workspace'
import type { AccountCostTagConfig, TagValueCost } from '~~/shared/types/cost-tags'
import { isCreatedByTag } from '~~/shared/utils/cost-tag-identities'

const props = withDefaults(defineProps<{
  selectedAccounts: string[]
  selectedTimeframe?: string
  dataMode?: 'billable' | 'proforma'
}>(), {
  dataMode: 'proforma'
})

const enclaveStore = useEnclaveStore()
const toast = useToast()
const accountId = computed(() => props.selectedAccounts.length === 1 ? props.selectedAccounts[0] || '' : '')
const isSingleAccount = computed(() => props.selectedAccounts.length === 1)
const accountScopeKey = computed(() => [...props.selectedAccounts].sort().join(','))
const activePeriod = computed(() => props.selectedTimeframe || 'last90days')
const scopeLabel = computed(() => props.selectedAccounts.length === 0
  ? 'All accounts'
  : props.selectedAccounts.length === 1
    ? '1 account'
    : `${props.selectedAccounts.length} accounts`)
const timeframeLabel = computed(() => {
  const labels: Record<string, string> = {
    last7days: 'Last 7 Days',
    last30days: 'Last 30 Days',
    last90days: 'Last 90 Days',
    thisMonth: 'This Month',
    lastMonth: 'Last Month',
    thisQuarter: 'This Quarter',
    lastQuarter: 'Last Quarter',
    ytd: 'Year-to-Date',
    last12months: 'Last 12 Months',
    lastYear: 'Last Year'
  }
  return labels[activePeriod.value] || activePeriod.value
})
const environment = computed(() => {
  const enc = enclaveStore.enclaves[accountId.value]
  return enc?.awsGovCloudAccountID ? 'govcloud' : 'commercial'
})

const breakdownRef = ref<any>(null)
const trendRef = ref<any>(null)
const {
  availableTags,
  tagCoverage,
  tagConfig,
  isLoadingTags,
  isLoadingCoverage,
  isSavingConfig,
  tagsError,
  coverageError,
  fetchAvailableTags,
  fetchTagCoverage,
  fetchAccountTagConfig,
  saveAccountTagConfig,
  clearTagCache
} = useCostTags()

const selectedTag = defineModel<string | null>('tag', { default: null })
const createdByView = defineModel<CostTagCreatorView>('tagView', { default: 'people' })
const showSettings = ref(false)
const showScopeSettings = ref(false)
const draftAliases = ref<Record<string, string>>({})
const aliasesDirty = ref(false)
let loadingScope = false
let scopeGeneration = 0

const proformaAvailable = computed(() =>
  props.dataMode === 'proforma' && tagCoverage.value?.proformaEstimation?.available === true
)
const showProforma = computed(() => props.dataMode === 'proforma' && proformaAvailable.value)
const modeLabel = computed(() => {
  if (props.dataMode === 'billable') return 'Billable'
  if (tagCoverage.value && !proformaAvailable.value) return 'Billable fallback'
  return 'Proforma estimate'
})
const configuredTagDescription = computed(() => isSingleAccount.value && selectedTag.value
  ? tagConfig.value?.tagDescriptions?.[selectedTag.value] || ''
  : '')
const dataBasisClasses = computed(() => props.dataMode === 'proforma'
  ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300'
  : 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300')
const dataBasisIcon = computed(() => props.dataMode === 'proforma'
  ? 'i-heroicons-exclamation-triangle'
  : 'i-heroicons-information-circle')
const displayTaggedCost = computed(() => showProforma.value
  ? tagCoverage.value?.estimatedProformaTaggedCost || 0
  : tagCoverage.value?.totalTaggedCost || 0)
const displayUntaggedCost = computed(() => showProforma.value
  ? tagCoverage.value?.estimatedProformaUntaggedCost || 0
  : tagCoverage.value?.totalUntaggedCost || 0)
const scopeDisplayTotal = computed(() => displayTaggedCost.value + displayUntaggedCost.value)
const isCreatedBy = computed(() => Boolean(selectedTag.value && isCreatedByTag(selectedTag.value)))
const allTagValues = computed(() => tagCoverage.value?.values || [])
const peopleValues = computed(() => isCreatedBy.value ? allTagValues.value.filter(value => value.isPerson) : allTagValues.value)
const visibleTagValues = computed(() => isCreatedBy.value && createdByView.value === 'people' ? peopleValues.value : allTagValues.value)
const displayCostForValue = (value: TagValueCost) => showProforma.value
  ? value.estimatedProformaCost || 0
  : value.billableCost
const peopleDisplayCost = computed(() => peopleValues.value.reduce((sum, value) => sum + displayCostForValue(value), 0))
const peopleShareOfAllSpend = computed(() => scopeDisplayTotal.value > 0 ? (peopleDisplayCost.value / scopeDisplayTotal.value) * 100 : 0)

const tagSelectOptions = computed(() => {
  const important = isSingleAccount.value ? tagConfig.value?.importantTags || [] : []
  const options: Array<{ label: string; value: string; disabled?: boolean }> = []
  const importantAvailable = important.filter(tag => availableTags.value.includes(tag))
  if (importantAvailable.length > 0) {
    options.push({ label: '--- Important Tags ---', value: '__divider_imp__', disabled: true })
    importantAvailable.forEach(tag => options.push({ label: tag, value: tag }))
    options.push({ label: '--- All Tags ---', value: '__divider_all__', disabled: true })
  }
  availableTags.value.filter(tag => !important.includes(tag)).forEach(tag => options.push({ label: tag, value: tag }))
  return options
})

const breakdownData = computed(() => ({
  groups: visibleTagValues.value.map(value => ({
    groupKey: value.groupKey,
    tagValue: value.tagValue,
    displayName: value.displayName,
    isUntagged: value.isUntagged,
    isPerson: value.isPerson,
    creatorType: value.creatorType,
    rawValues: value.rawValues,
    billableCost: value.billableCost,
    estimatedProformaCost: value.estimatedProformaCost,
    accounts: value.accounts
  }))
}))

const coverageColorClass = computed(() => {
  const coverage = tagCoverage.value?.overallCoverage ?? 0
  if (coverage >= 80) return 'text-green-600 dark:text-green-400'
  if (coverage >= 50) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
})
const coverageBarClass = computed(() => {
  const coverage = tagCoverage.value?.overallCoverage ?? 0
  if (coverage >= 80) return 'bg-green-500'
  if (coverage >= 50) return 'bg-amber-500'
  return 'bg-red-500'
})
const untaggedIsHigh = computed(() => (tagCoverage.value?.overallCoverage ?? 100) < 70)
const currentAliases = computed(() => isSingleAccount.value ? {
  ...(tagConfig.value?.tagValueAliases || {}),
  ...draftAliases.value
} : {})

async function fetchAnalysis() {
  if (!selectedTag.value) return
  await fetchTagCoverage(selectedTag.value, props.selectedAccounts, activePeriod.value, {
    includeValues: true,
    proforma: props.dataMode === 'proforma'
  })
  logUserAction('cost.tag_drilldown', `tag:${selectedTag.value};accounts:${props.selectedAccounts.length || 'all'}`)
}

async function loadScope() {
  const generation = ++scopeGeneration
  loadingScope = true
  draftAliases.value = {}
  aliasesDirty.value = false

  const configPromise = isSingleAccount.value
    ? fetchAccountTagConfig(accountId.value)
    : Promise.resolve(null)
  const [tags] = await Promise.all([
    fetchAvailableTags(props.selectedAccounts, activePeriod.value),
    configPromise
  ])

  if (generation !== scopeGeneration) return
  if (!isSingleAccount.value) tagConfig.value = null

  const defaultTag = isSingleAccount.value ? tagConfig.value?.defaultGroupByTag : undefined
  const nextTag = resolveCostTagSelection({
    availableTags: tags,
    requestedTag: selectedTag.value,
    defaultTag,
    favoriteTags: isSingleAccount.value ? tagConfig.value?.importantTags : []
  })
  const tagChanged = nextTag !== selectedTag.value
  selectedTag.value = nextTag

  loadingScope = false
  if (!tagChanged) await fetchAnalysis()
}

function handleAliasUpdate(payload: { tagKey: string; tagValue: string; alias: string }) {
  if (!isSingleAccount.value) return
  const key = `${payload.tagKey}::${payload.tagValue}`
  if (payload.alias) draftAliases.value = { ...draftAliases.value, [key]: payload.alias }
  else {
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
  merged.tagValueAliases = Object.fromEntries(
    Object.entries(merged.tagValueAliases || {}).filter(([, value]) => Boolean(value))
  )

  try {
    await saveAccountTagConfig(accountId.value, merged)
    draftAliases.value = {}
    aliasesDirty.value = false
    toast.add({ title: 'Aliases Saved', description: 'Tag value aliases updated successfully', icon: 'i-heroicons-check-circle', color: 'green' })
  } catch {
    toast.add({ title: 'Save Failed', description: 'Could not save aliases. Please try again.', icon: 'i-heroicons-x-circle', color: 'red' })
  }
}

function exportBreakdownCSV() {
  const values = visibleTagValues.value
  if (!values.length) return

  const rowMap = new Map<string, any>(
    (breakdownRef.value?.rows || []).map((row: any): [string, any] => [row.value, row])
  )
  const esc = (value: unknown) => {
    const text = String(value ?? '')
    return text.includes(',') || text.includes('"') || text.includes('\n') ? `"${text.replace(/"/g, '""')}"` : text
  }
  const lines: string[] = []

  if (isCreatedBy.value && createdByView.value === 'people') {
    lines.push(['Display Name', 'Identity', 'Billable Cost ($)', 'Estimated Proforma Cost ($)', 'Displayed Cost ($)', 'Share of All Spend (%)', 'Contributing Accounts', 'Account Names', 'Account IDs', 'Source Values'].join(','))
    for (const value of values) {
      const displayedCost = displayCostForValue(value)
      const accountNames = value.accounts.map(account => account.accountName || account.accountId)
      const accountIds = value.accounts.map(account => account.accountId)
      lines.push([
        esc(value.displayName),
        esc(value.tagValue),
        value.billableCost.toFixed(2),
        value.estimatedProformaCost?.toFixed(2) || '',
        displayedCost.toFixed(2),
        (scopeDisplayTotal.value > 0 ? (displayedCost / scopeDisplayTotal.value) * 100 : 0).toFixed(2),
        String(value.accounts.length),
        esc(accountNames.join('; ')),
        esc(accountIds.join('; ')),
        String(value.rawValues.length)
      ].join(','))
    }
  } else if (isSingleAccount.value) {
    lines.push(['Display Name', 'Raw Value', 'Billable Cost ($)', 'Estimated Proforma Cost ($)', 'Displayed Cost ($)', 'Percentage (%)'].join(','))
    for (const value of values) {
      const row: any = rowMap.get(value.groupKey)
      lines.push([
        esc(row?.label || value.displayName || 'Untagged'),
        esc(value.rawValues.join('; ')),
        value.billableCost.toFixed(2),
        value.estimatedProformaCost?.toFixed(2) || '',
        (row?.cost || value.billableCost).toFixed(2),
        (row?.percentage || 0).toFixed(2)
      ].join(','))
    }
  } else {
    lines.push(['Display Name', 'Raw Value', 'Account Name', 'Account ID', 'Billable Cost ($)', 'Estimated Proforma Cost ($)', 'Displayed Cost ($)', 'Share of Tag Value (%)'].join(','))
    for (const value of values) appendAccountRows(lines, value, rowMap, esc)
  }

  lines.push('', `# Scope: ${scopeLabel.value}`, `# Tag Key: ${selectedTag.value}`, `# Creator View: ${isCreatedBy.value ? createdByView.value : 'all'}`, `# Period: ${activePeriod.value}`, `# Mode: ${showProforma.value ? 'estimated proforma' : 'billable'}`, `# Exported: ${new Date().toISOString()}`)
  if (showProforma.value) lines.push('# Note: Proforma values are account-and-month weighted estimates and are not suitable for chargeback.')

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const scope = isSingleAccount.value ? accountId.value : props.selectedAccounts.length ? `${props.selectedAccounts.length}-accounts` : 'all-accounts'
  downloadBlob(blob, `tag-breakdown-${selectedTag.value}-${scope}-${new Date().toISOString().slice(0, 10)}.csv`)
  toast.add({ title: 'Exported', description: `Tag breakdown exported as CSV`, icon: 'i-heroicons-arrow-down-tray', color: 'green' })
  logUserAction('export.csv', 'source:tag-analysis')
}

function appendAccountRows(
  lines: string[],
  value: TagValueCost,
  rowMap: Map<string, any>,
  esc: (value: unknown) => string
) {
  const row: any = rowMap.get(value.groupKey)
  const displayedTotal = showProforma.value ? value.estimatedProformaCost || 0 : value.billableCost
  for (const account of value.accounts) {
    const displayedCost = showProforma.value ? account.estimatedProformaCost || 0 : account.billableCost
    lines.push([
      esc(row?.label || value.displayName || 'Untagged'),
      esc(account.rawValues.join('; ')),
      esc(account.accountName || account.accountId),
      account.accountId,
      account.billableCost.toFixed(2),
      account.estimatedProformaCost?.toFixed(2) || '',
      displayedCost.toFixed(2),
      (displayedTotal > 0 ? (displayedCost / displayedTotal) * 100 : 0).toFixed(2)
    ].join(','))
  }
}

async function refreshAll() {
  clearTagCache()
  await loadScope()
}

function openSettings() {
  if (isSingleAccount.value) showSettings.value = true
  else showScopeSettings.value = true
}

function handleSettingsSaved(config: AccountCostTagConfig) {
  tagConfig.value = config
}

watch([accountScopeKey, activePeriod], () => { void loadScope() }, { immediate: true })
watch(() => props.dataMode, () => { if (!loadingScope) void fetchAnalysis() })
watch(selectedTag, (tag) => {
  if (!loadingScope && availableTags.value.length > 0 && (!tag || !availableTags.value.includes(tag))) {
    selectedTag.value = resolveCostTagSelection({
      availableTags: availableTags.value,
      requestedTag: tag,
      defaultTag: isSingleAccount.value ? tagConfig.value?.defaultGroupByTag : undefined,
      favoriteTags: isSingleAccount.value ? tagConfig.value?.importantTags : []
    })
    return
  }
  if (!loadingScope) void fetchAnalysis()
})
</script>
