<template>
  <div class="space-y-6">
    <div class="flex items-start gap-2 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-2">
      <UIcon name="i-heroicons-exclamation-triangle" class="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
      <p class="text-xs text-amber-700 dark:text-amber-300">
        Tag analysis uses exact <strong>billable</strong> Cost Explorer data. Proforma mode estimates each account separately because AWS Billing Conductor does not expose cost allocation tags.
        Estimated values are directional and <strong>should not be used for chargeback</strong>.
        <NuxtLink to="/support/docs?topic=cost-tags-guide" class="underline underline-offset-2 hover:text-amber-900 dark:hover:text-amber-100">Learn more</NuxtLink>
      </p>
    </div>

    <div class="space-y-4">
      <div class="flex items-center gap-3 flex-wrap">
        <USelectMenu
          :model-value="selectedTag ?? undefined"
          @update:model-value="selectedTag = $event ?? null"
          :options="tagSelectOptions"
          value-attribute="value"
          option-attribute="label"
          placeholder="Select a tag..."
          size="sm"
          class="w-56"
          :loading="isLoadingTags"
        />
        <UBadge color="gray" variant="soft" size="sm">{{ scopeLabel }}</UBadge>
        <UTooltip text="Refresh data">
          <UButton
            color="gray"
            variant="ghost"
            icon="i-heroicons-arrow-path"
            size="sm"
            :loading="isLoadingTags || isLoadingCoverage"
            @click="refreshAll"
          />
        </UTooltip>
        <UTooltip text="Export breakdown as CSV">
          <UButton
            icon="i-heroicons-arrow-down-tray"
            color="gray"
            variant="ghost"
            size="sm"
            :disabled="!tagCoverage?.values?.length"
            @click="exportBreakdownCSV"
          />
        </UTooltip>
        <UTooltip v-if="isSingleAccount" text="Tag Settings">
          <UButton
            icon="i-heroicons-adjustments-horizontal"
            color="gray"
            variant="ghost"
            size="sm"
            @click="showSettings = true"
          />
        </UTooltip>
      </div>

      <div v-if="tagsError" class="rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-xs text-red-700 dark:text-red-300">
        {{ tagsError }}
      </div>
      <div v-if="coverageError" class="rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-xs text-red-700 dark:text-red-300">
        {{ coverageError }}
      </div>

      <div v-if="selectedTag && dataMode === 'proforma' && tagCoverage && !isLoadingCoverage" class="flex items-start gap-2 rounded-md px-3 py-2 border"
        :class="proformaAvailable
          ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
          : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'"
      >
        <UIcon
          :name="proformaAvailable ? 'i-heroicons-information-circle' : 'i-heroicons-exclamation-triangle'"
          class="w-4 h-4 mt-0.5 flex-shrink-0"
          :class="proformaAvailable ? 'text-blue-500' : 'text-amber-500'"
        />
        <p class="text-xs" :class="proformaAvailable ? 'text-blue-700 dark:text-blue-300' : 'text-amber-700 dark:text-amber-300'">
          <template v-if="proformaAvailable">
            Dollar amounts are <strong>account-and-month weighted proforma estimates</strong>. Each account's billable tag distribution is applied within the same AWS time bucket before results are combined.
          </template>
          <template v-else>
            A complete proforma estimate is unavailable for this scope. Exact billable costs are shown instead.
          </template>
        </p>
      </div>

      <div v-if="selectedTag && tagCoverage && !isLoadingCoverage" class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <div class="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Coverage</div>
          <div class="text-3xl font-bold" :class="coverageColorClass">{{ tagCoverage.overallCoverage.toFixed(1) }}%</div>
          <div class="mt-2 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
            <div class="h-2 rounded-full transition-all duration-500" :class="coverageBarClass" :style="{ width: `${tagCoverage.overallCoverage}%` }" />
          </div>
        </div>

        <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <div class="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Tagged Cost{{ showProforma ? ' (est.)' : '' }}</div>
          <div class="text-3xl font-bold text-green-600 dark:text-green-400">{{ formatCostValue(displayTaggedCost) }}</div>
          <div class="text-xs text-gray-500 dark:text-gray-400 mt-1">{{ showProforma ? 'Estimated proforma' : `Resources with "${selectedTag}"` }}</div>
        </div>

        <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4" :class="untaggedIsHigh ? 'border-amber-300 dark:border-amber-600' : ''">
          <div class="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Untagged Cost{{ showProforma ? ' (est.)' : '' }}</div>
          <div class="text-3xl font-bold" :class="untaggedIsHigh ? 'text-amber-600 dark:text-amber-400' : 'text-gray-700 dark:text-gray-300'">{{ formatCostValue(displayUntaggedCost) }}</div>
          <div class="text-xs mt-1" :class="untaggedIsHigh ? 'text-amber-600 dark:text-amber-400' : 'text-gray-500 dark:text-gray-400'">
            {{ untaggedIsHigh ? 'High untagged spend detected' : (showProforma ? 'Estimated proforma' : 'Resources without this tag') }}
          </div>
        </div>
      </div>

      <div v-if="selectedTag && isLoadingCoverage" class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-6 text-center">
        <UIcon name="i-heroicons-arrow-path" class="w-5 h-5 animate-spin text-blue-500 mx-auto mb-2" />
        <p class="text-sm text-gray-400">Calculating tag costs across {{ scopeLabel.toLowerCase() }}...</p>
      </div>

      <div v-if="!isLoadingTags && availableTags.length === 0 && !tagsError" class="py-10 text-center border border-gray-200 dark:border-gray-700 rounded-lg">
        <UIcon name="i-heroicons-tag" class="w-8 h-8 text-gray-400 mx-auto mb-2" />
        <p class="text-sm text-gray-500 dark:text-gray-400">No active cost allocation tags were found for this scope and timeframe.</p>
      </div>
    </div>

    <div v-if="selectedTag">
      <div class="flex items-start justify-between gap-2 flex-wrap mb-2">
        <div>
          <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300">Cost Breakdown</h3>
          <p v-if="isCreatedBy && createdByView === 'people'" class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {{ peopleValues.length }} people · {{ formatCostValue(peopleDisplayCost) }} · {{ peopleShareOfAllSpend.toFixed(1) }}% of all spend
          </p>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          <UButtonGroup v-if="isCreatedBy" size="xs">
            <UButton
              :color="createdByView === 'people' ? 'blue' : 'gray'"
              :variant="createdByView === 'people' ? 'solid' : 'outline'"
              @click="createdByView = 'people'"
            >
              People ({{ peopleValues.length }})
            </UButton>
            <UButton
              :color="createdByView === 'all' ? 'blue' : 'gray'"
              :variant="createdByView === 'all' ? 'solid' : 'outline'"
              @click="createdByView = 'all'"
            >
              All creators ({{ creatorCount }})
            </UButton>
          </UButtonGroup>
          <UButton v-if="aliasesDirty && isSingleAccount" color="blue" variant="soft" size="xs" :loading="isSavingConfig" @click="saveAliases">
            Save Aliases
          </UButton>
        </div>
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
    />
  </div>
</template>

<script setup lang="ts">
import { formatCostValue } from '~/utils/cost-filters'
import { downloadBlob } from '~/utils/export/export-utils'
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

const selectedTag = ref<string | null>(null)
const showSettings = ref(false)
const draftAliases = ref<Record<string, string>>({})
const aliasesDirty = ref(false)
const createdByView = ref<'people' | 'all'>('people')
let loadingScope = false
let scopeGeneration = 0

const proformaAvailable = computed(() =>
  props.dataMode === 'proforma' && tagCoverage.value?.proformaEstimation?.available === true
)
const showProforma = computed(() => props.dataMode === 'proforma' && proformaAvailable.value)
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
const creatorCount = computed(() => allTagValues.value.filter(value => !value.isUntagged).length)
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

  const previousTag = selectedTag.value
  const defaultTag = isSingleAccount.value ? tagConfig.value?.defaultGroupByTag : undefined
  const importantTag = isSingleAccount.value ? tagConfig.value?.importantTags?.find(tag => tags.includes(tag)) : undefined
  const nextTag = previousTag && tags.includes(previousTag)
    ? previousTag
    : defaultTag && tags.includes(defaultTag)
      ? defaultTag
      : importantTag || tags[0] || null
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

watch([accountScopeKey, activePeriod], () => { void loadScope() }, { immediate: true })
watch(() => props.dataMode, () => { if (!loadingScope) void fetchAnalysis() })
watch(selectedTag, () => {
  createdByView.value = 'people'
  if (!loadingScope) void fetchAnalysis()
})
</script>
