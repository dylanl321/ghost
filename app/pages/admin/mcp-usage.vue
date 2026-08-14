<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  middleware: 'auth-permission',
  permission: 'admin',
  title: 'MCP Usage',
  description: 'Monitor GHOST MCP adoption, reliability, and tool activity'
})

interface ToolUsageRow {
  tool: string
  count: number
  successRate: number
  averageLatencyMs: number
  errorCount: number
  fallbackCount: number
  lastUsedAt?: string
}

interface DailyUsageRow {
  date: string
  count: number
  successRate: number
  averageLatencyMs: number
}

interface RecentActivityRow {
  eventId: string
  timestamp: string
  user: string
  email: string
  client: string
  clientName?: string
  tool: string
  status: 'success' | 'error' | 'denied' | 'confirmation_required'
  durationMs: number
  environment: string
  interactionType: string
  errorCategory?: string
  errorCode?: string
  errorExplanation?: string
  source: string
  rawErrorCaptured: boolean
  warningCount: number
  fallback: boolean
}

interface BreakdownRow {
  key: string
  label: string
  detail?: string
  count: number
  successRate: number
  errorCount: number
  topTools: Array<{ tool: string; count: number }>
  lastActivity?: string
}

interface McpUsageOverview {
  days: number
  total: number
  uniqueUsers: number
  uniqueClients: number
  successRate: number
  averageLatencyMs: number
  fallbackCount: number
  rawErrorsEnabled: boolean
  byTool: ToolUsageRow[]
  byStatus: Record<string, number>
  byEnvironment: Record<string, number>
  byTeam: Record<string, number>
  byInteractionType: Record<string, number>
  byErrorCategory: Record<string, number>
  byUser: BreakdownRow[]
  byClient: BreakdownRow[]
  bySource: BreakdownRow[]
  byDay: DailyUsageRow[]
  recentActivity: RecentActivityRow[]
}

const rangeOptions = [
  { label: 'Last 7 days', value: 7 },
  { label: 'Last 30 days', value: 30 },
  { label: 'Last 90 days', value: 90 }
]
const selectedDays = ref(30)
const loading = ref(false)
const error = ref<string | null>(null)
const summary = ref<McpUsageOverview | null>(null)
const toolSearch = ref('')
const lastUpdatedAt = ref<Date | null>(null)
const savingRawErrors = ref(false)
const breakdownView = ref<'users' | 'clients' | 'sources'>('users')
const rawDrawerOpen = ref(false)
const rawLoading = ref(false)
const rawRecord = ref<any>(null)
const rawUnavailable = ref(false)
const copiedRaw = ref(false)

const toolColumns = [
  { key: 'tool', label: 'Tool' },
  { key: 'count', label: 'Calls' },
  { key: 'successRate', label: 'Success' },
  { key: 'averageLatencyMs', label: 'Avg latency' },
  { key: 'errorCount', label: 'Errors' },
  { key: 'lastUsedAt', label: 'Last used' }
]
const activityColumns = [
  { key: 'timestamp', label: 'Time' },
  { key: 'user', label: 'User' },
  { key: 'tool', label: 'Tool' },
  { key: 'client', label: 'Client' },
  { key: 'source', label: 'Source' },
  { key: 'status', label: 'Status' },
  { key: 'errorCode', label: 'Error' },
  { key: 'errorExplanation', label: 'Explanation' },
  { key: 'actions', label: '' }
]
const breakdownColumns = [
  { key: 'label', label: 'Name' },
  { key: 'count', label: 'Calls' },
  { key: 'successRate', label: 'Success' },
  { key: 'errorCount', label: 'Errors' },
  { key: 'topTools', label: 'Top tools' },
  { key: 'lastActivity', label: 'Last activity' }
]
const breakdownOptions = [
  { label: 'Users', value: 'users' },
  { label: 'Clients', value: 'clients' },
  { label: 'Sources', value: 'sources' }
]

const filteredTools = computed(() => {
  const query = toolSearch.value.trim().toLowerCase()
  return query ? (summary.value?.byTool || []).filter(row => row.tool.toLowerCase().includes(query)) : summary.value?.byTool || []
})
const failedCalls = computed(() => (summary.value?.byStatus.error || 0) + (summary.value?.byStatus.denied || 0))
const fallbackRate = computed(() => summary.value?.total ? summary.value.fallbackCount / summary.value.total : 0)
const environmentRows = computed(() => objectRows(summary.value?.byEnvironment))
const interactionRows = computed(() => objectRows(summary.value?.byInteractionType))
const teamRows = computed(() => objectRows(summary.value?.byTeam))
const errorRows = computed(() => objectRows(summary.value?.byErrorCategory))
const dailySeries = computed(() => {
  const source = new Map((summary.value?.byDay || []).map(row => [row.date, row]))
  return Array.from({ length: selectedDays.value }, (_, offset) => {
    const date = new Date()
    date.setUTCDate(date.getUTCDate() - (selectedDays.value - offset - 1))
    const key = date.toISOString().slice(0, 10)
    return source.get(key) || { date: key, count: 0, successRate: 0, averageLatencyMs: 0 }
  })
})
const maxDailyCalls = computed(() => Math.max(1, ...dailySeries.value.map(row => row.count)))
const breakdownRows = computed(() => {
  if (breakdownView.value === 'clients') return summary.value?.byClient || []
  if (breakdownView.value === 'sources') return summary.value?.bySource || []
  return summary.value?.byUser || []
})

function objectRows(values?: Record<string, number>) {
  return Object.entries(values || {})
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count)
}

function percent(value?: number) {
  return `${Math.round((value || 0) * 100)}%`
}

function formatDuration(milliseconds?: number) {
  const value = milliseconds || 0
  return value >= 1000 ? `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}s` : `${value}ms`
}

function formatTimestamp(value?: string) {
  if (!value) return 'Never'
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

function formatDay(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`))
}

function shortToolName(value: string) {
  return value.replace(/^ghost\./, '')
}

function clientLabel(value: string) {
  return ({ codex_desktop: 'Codex Desktop', codex_cli: 'Codex CLI', codex_unknown: 'Codex surface unknown', claude_code: 'Claude Code', chatgpt: 'ChatGPT', other: 'Other', unknown: 'Unknown' } as Record<string, string>)[value] || 'Unknown'
}

function topTools(value: Array<{ tool: string; count: number }>) {
  return value.map(item => `${shortToolName(item.tool)} (${item.count})`).join(', ')
}

async function updateRawErrorCapture(enabled: boolean) {
  if (!summary.value) return
  savingRawErrors.value = true
  try {
    await $fetch('/api/admin/site-config/mcp.audit.rawErrors.enabled', { method: 'PUT', body: { value: enabled } })
    summary.value.rawErrorsEnabled = enabled
  } catch (cause: unknown) {
    summary.value.rawErrorsEnabled = !enabled
    error.value = cause instanceof Error ? cause.message : 'Raw error capture could not be updated.'
  } finally {
    savingRawErrors.value = false
  }
}

async function openRawError(row: RecentActivityRow) {
  rawDrawerOpen.value = true
  rawLoading.value = true
  rawRecord.value = null
  rawUnavailable.value = false
  copiedRaw.value = false
  try {
    const response = await $fetch<{ data: { available: boolean; record?: any } }>(`/api/admin/mcp-usage/raw-errors/${row.eventId}`)
    rawUnavailable.value = !response.data.available
    rawRecord.value = response.data.record || null
  } catch {
    rawUnavailable.value = true
  } finally {
    rawLoading.value = false
  }
}

async function copyRawError() {
  if (!rawRecord.value?.rawJson) return
  await navigator.clipboard.writeText(rawRecord.value.rawJson)
  copiedRaw.value = true
}

async function load() {
  loading.value = true
  error.value = null
  try {
    const response = await $fetch<{ data: McpUsageOverview }>('/api/admin/mcp-usage/overview', { query: { days: selectedDays.value } })
    summary.value = response.data
    lastUpdatedAt.value = new Date()
  } catch (cause: unknown) {
    error.value = cause instanceof Error ? cause.message : 'MCP usage data could not be loaded.'
  } finally {
    loading.value = false
  }
}

watch(selectedDays, load)
onMounted(load)
</script>

<template>
  <div class="mx-auto max-w-7xl space-y-6 px-6 py-8">
    <header class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div class="flex items-center gap-3">
          <div class="grid size-10 place-items-center rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
            <UIcon name="i-heroicons-chart-bar-square" class="size-5" />
          </div>
          <div><h1 class="text-2xl font-bold text-gray-950 dark:text-white">MCP Usage</h1><p class="mt-1 text-sm text-gray-600 dark:text-gray-400">Organization adoption and operational health for GHOST MCP.</p></div>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <div v-if="summary" class="mr-2 flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
          <span>Raw errors</span>
          <UToggle :model-value="summary.rawErrorsEnabled" :disabled="savingRawErrors" @update:model-value="updateRawErrorCapture" />
        </div>
        <USelect v-model="selectedDays" :options="rangeOptions" option-attribute="label" value-attribute="value" class="w-36" />
        <UTooltip text="Refresh usage data"><UButton icon="i-heroicons-arrow-path" color="gray" variant="soft" square :loading="loading" @click="load" /></UTooltip>
      </div>
    </header>

    <UAlert v-if="error" color="red" variant="soft" icon="i-heroicons-exclamation-circle" title="MCP usage is unavailable" :description="error"><template #actions><UButton color="red" variant="soft" size="xs" @click="load">Retry</UButton></template></UAlert>

    <section class="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <UCard><p class="metric-label">Tool calls</p><p class="metric-value">{{ summary?.total ?? 0 }}</p><p class="metric-note">Selected period</p></UCard>
      <UCard><p class="metric-label">Active users</p><p class="metric-value">{{ summary?.uniqueUsers ?? 0 }}</p><p class="metric-note">Across {{ summary?.uniqueClients ?? 0 }} client{{ summary?.uniqueClients === 1 ? '' : 's' }}</p></UCard>
      <UCard><p class="metric-label">Success rate</p><p class="metric-value" :class="(summary?.successRate || 0) < 0.95 ? 'text-amber-500' : 'text-emerald-500'">{{ percent(summary?.successRate) }}</p><p class="metric-note">{{ failedCalls }} failed or denied</p></UCard>
      <UCard><p class="metric-label">Average latency</p><p class="metric-value">{{ formatDuration(summary?.averageLatencyMs) }}</p><p class="metric-note">End-to-end tool time</p></UCard>
      <UCard class="col-span-2 lg:col-span-1"><p class="metric-label">Fallbacks</p><p class="metric-value">{{ summary?.fallbackCount ?? 0 }}</p><p class="metric-note">{{ percent(fallbackRate) }} of calls</p></UCard>
    </section>

    <section class="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
      <UCard>
        <template #header><div><h2 class="panel-title">Daily activity</h2><p class="panel-subtitle">Tool calls and successful completion across the selected period.</p></div></template>
        <div v-if="summary?.total" class="activity-chart" role="img" :aria-label="`Daily MCP calls for the last ${selectedDays} days`">
          <UTooltip v-for="day in dailySeries" :key="day.date" :text="`${formatDay(day.date)}: ${day.count} calls, ${percent(day.successRate)} success`">
            <div class="activity-column"><div class="activity-bar" :class="{ empty: day.count === 0 }" :style="{ height: `${Math.max(day.count ? 8 : 2, (day.count / maxDailyCalls) * 100)}%` }" /></div>
          </UTooltip>
        </div>
        <div v-else class="empty-state"><UIcon name="i-heroicons-chart-bar" class="size-8" /><p>No MCP activity in this period.</p></div>
        <div v-if="summary?.total" class="mt-2 flex justify-between text-xs text-gray-500 dark:text-gray-400"><span>{{ formatDay(dailySeries[0]!.date) }}</span><span>{{ formatDay(dailySeries.at(-1)!.date) }}</span></div>
      </UCard>

      <UCard>
        <template #header><div><h2 class="panel-title">Usage mix</h2><p class="panel-subtitle">Where calls run and what kind of work they perform.</p></div></template>
        <div class="space-y-5">
          <div><h3 class="breakdown-title">Environment</h3><div class="mt-2 space-y-2"><div v-for="row in environmentRows" :key="row.label" class="breakdown-row"><span class="capitalize">{{ row.label }}</span><strong>{{ row.count }}</strong></div><p v-if="!environmentRows.length" class="text-xs text-gray-500">No environment data</p></div></div>
          <div><h3 class="breakdown-title">Interaction type</h3><div class="mt-2 space-y-2"><div v-for="row in interactionRows" :key="row.label" class="breakdown-row"><span class="capitalize">{{ row.label }}</span><strong>{{ row.count }}</strong></div><p v-if="!interactionRows.length" class="text-xs text-gray-500">No interaction data</p></div></div>
        </div>
      </UCard>
    </section>

    <UCard>
      <template #header><div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 class="panel-title">Tool performance</h2><p class="panel-subtitle">Adoption, reliability, and latency by MCP tool.</p></div><UInput v-model="toolSearch" icon="i-heroicons-magnifying-glass" placeholder="Filter tools" size="sm" class="w-full sm:w-64" /></div></template>
      <UTable :rows="filteredTools" :columns="toolColumns" :loading="loading" :empty-state="{ icon: 'i-heroicons-wrench-screwdriver', label: toolSearch ? 'No tools match this filter' : 'No tool activity in this period' }">
        <template #tool-data="{ row }"><code class="text-xs text-emerald-700 dark:text-emerald-300">{{ shortToolName(row.tool) }}</code></template>
        <template #successRate-data="{ row }"><span :class="row.successRate < 0.95 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'">{{ percent(row.successRate) }}</span></template>
        <template #averageLatencyMs-data="{ row }">{{ formatDuration(row.averageLatencyMs) }}</template>
        <template #errorCount-data="{ row }"><span :class="row.errorCount ? 'text-red-600 dark:text-red-400' : 'text-gray-500'">{{ row.errorCount }}</span></template>
        <template #lastUsedAt-data="{ row }">{{ formatTimestamp(row.lastUsedAt) }}</template>
      </UTable>
    </UCard>

    <section class="grid gap-6 lg:grid-cols-2">
      <UCard><template #header><div><h2 class="panel-title">Team adoption</h2><p class="panel-subtitle">Calls attributed from account metadata.</p></div></template><div class="divide-y divide-gray-200 dark:divide-gray-700"><div v-for="row in teamRows" :key="row.label" class="flex items-center justify-between py-2.5 text-sm"><span>{{ row.label }}</span><span class="font-semibold tabular-nums">{{ row.count }}</span></div><div v-if="!teamRows.length" class="empty-state py-8"><UIcon name="i-heroicons-user-group" class="size-7" /><p>No team attribution in this period.</p></div></div></UCard>
      <UCard><template #header><div><h2 class="panel-title">Error categories</h2><p class="panel-subtitle">Sanitized failure classification; no request content is retained.</p></div></template><div class="divide-y divide-gray-200 dark:divide-gray-700"><div v-for="row in errorRows" :key="row.label" class="flex items-center justify-between py-2.5 text-sm"><span class="capitalize">{{ row.label }}</span><span class="font-semibold tabular-nums text-red-600 dark:text-red-400">{{ row.count }}</span></div><div v-if="!errorRows.length" class="empty-state py-8"><UIcon name="i-heroicons-check-circle" class="size-7 text-emerald-500" /><p>No categorized errors in this period.</p></div></div></UCard>
    </section>

    <UCard>
      <template #header><div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 class="panel-title">Attribution</h2><p class="panel-subtitle">Call volume and reliability by user, reported client, and successful backend source.</p></div><USelect v-model="breakdownView" :options="breakdownOptions" option-attribute="label" value-attribute="value" class="w-full sm:w-36" /></div></template>
      <UTable :rows="breakdownRows" :columns="breakdownColumns" :loading="loading" :empty-state="{ icon: 'i-heroicons-chart-pie', label: 'No attribution data in this period' }">
        <template #label-data="{ row }"><div><p class="font-medium text-gray-900 dark:text-white">{{ row.label }}</p><p v-if="row.detail && row.detail !== row.label" class="text-xs text-gray-500">{{ row.detail }}</p></div></template>
        <template #successRate-data="{ row }"><span :class="row.successRate < 0.95 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'">{{ percent(row.successRate) }}</span></template>
        <template #errorCount-data="{ row }"><span :class="row.errorCount ? 'text-red-600 dark:text-red-400' : 'text-gray-500'">{{ row.errorCount }}</span></template>
        <template #topTools-data="{ row }"><span class="block max-w-sm truncate text-xs" :title="topTools(row.topTools)">{{ topTools(row.topTools) }}</span></template>
        <template #lastActivity-data="{ row }">{{ formatTimestamp(row.lastActivity) }}</template>
      </UTable>
    </UCard>

    <UCard>
      <template #header><div><h2 class="panel-title">Recent activity</h2><p class="panel-subtitle">Sanitized metadata from the latest 50 tool calls.</p></div></template>
      <UTable :rows="summary?.recentActivity || []" :columns="activityColumns" :loading="loading" :empty-state="{ icon: 'i-heroicons-clock', label: 'No recent MCP activity' }">
        <template #timestamp-data="{ row }">{{ formatTimestamp(row.timestamp) }}</template>
        <template #user-data="{ row }"><div><p class="font-medium">{{ row.user }}</p><p class="text-xs text-gray-500">{{ row.email }}</p></div></template>
        <template #tool-data="{ row }"><code class="text-xs">{{ shortToolName(row.tool) }}</code></template>
        <template #client-data="{ row }"><span :title="row.clientName">{{ clientLabel(row.client) }}</span></template>
        <template #source-data="{ row }"><span class="block max-w-40 truncate" :title="row.source">{{ row.source }}</span></template>
        <template #status-data="{ row }"><span class="status-badge" :class="`status-${row.status}`">{{ row.status.replaceAll('_', ' ') }}</span></template>
        <template #errorCode-data="{ row }"><code v-if="row.errorCode" class="text-xs text-red-600 dark:text-red-400">{{ row.errorCode }}</code><span v-else class="text-gray-400">-</span></template>
        <template #errorExplanation-data="{ row }"><span v-if="row.errorExplanation" class="block max-w-xs whitespace-normal text-xs" :title="row.errorExplanation">{{ row.errorExplanation }}</span><span v-else class="text-gray-400">-</span></template>
        <template #actions-data="{ row }"><UTooltip v-if="row.rawErrorCaptured" text="View raw error"><UButton icon="i-heroicons-code-bracket-square" color="gray" variant="ghost" size="xs" square @click="openRawError(row)" /></UTooltip></template>
      </UTable>
    </UCard>

    <USlideover v-model="rawDrawerOpen" side="right" :ui="{ width: 'max-w-3xl' }">
      <div class="flex h-full flex-col">
        <header class="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700"><div><h2 class="font-semibold text-gray-950 dark:text-white">Raw MCP error</h2><p class="text-xs text-gray-500">Sensitive diagnostic context, retained for 30 days.</p></div><UTooltip text="Close"><UButton icon="i-heroicons-x-mark" color="gray" variant="ghost" square @click="rawDrawerOpen = false" /></UTooltip></header>
        <div class="min-h-0 flex-1 overflow-y-auto p-5">
          <div v-if="rawLoading" class="empty-state"><UIcon name="i-heroicons-arrow-path" class="size-7 animate-spin" /><p>Loading raw error context</p></div>
          <UAlert v-else-if="rawUnavailable" color="amber" variant="soft" icon="i-heroicons-clock" title="Raw context unavailable" description="The record has expired, was not captured, or is no longer available." />
          <template v-else-if="rawRecord">
            <UAlert v-if="rawRecord.truncated" class="mb-4" color="amber" variant="soft" icon="i-heroicons-exclamation-triangle" title="Record truncated" :description="`${rawRecord.storedSizeBytes.toLocaleString()} of ${rawRecord.originalSizeBytes.toLocaleString()} bytes retained.`" />
            <div class="mb-3 flex items-center justify-between"><p class="text-xs text-gray-500">Expires {{ formatTimestamp(rawRecord.expiresAt) }}</p><UButton :icon="copiedRaw ? 'i-heroicons-check' : 'i-heroicons-clipboard-document'" :label="copiedRaw ? 'Copied' : 'Copy'" color="gray" variant="soft" size="xs" @click="copyRawError" /></div>
            <pre class="overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-gray-950 p-4 text-xs leading-5 text-gray-100">{{ rawRecord.rawJson }}</pre>
          </template>
        </div>
      </div>
    </USlideover>

    <p v-if="lastUpdatedAt" class="text-right text-xs text-gray-500 dark:text-gray-400">Updated {{ formatTimestamp(lastUpdatedAt.toISOString()) }}</p>
  </div>
</template>

<style scoped>
.metric-label { color: var(--ghost-text-muted); font-size: .6875rem; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }.metric-value { margin-top: .3rem; color: var(--ghost-text); font-size: 1.625rem; font-weight: 700; line-height: 1.1; font-variant-numeric: tabular-nums; }.metric-note { margin-top: .35rem; color: var(--ghost-text-muted); font-size: .6875rem; }.panel-title { color: var(--ghost-text); font-size: .9375rem; font-weight: 700; }.panel-subtitle { margin-top: .2rem; color: var(--ghost-text-muted); font-size: .75rem; }.activity-chart { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(3px, 1fr); align-items: end; gap: 2px; height: 10rem; padding-top: .5rem; }.activity-column { display: flex; height: 100%; align-items: end; }.activity-bar { width: 100%; min-height: 2px; background: rgb(16 185 129); border-radius: 2px 2px 0 0; transition: height 180ms ease, background 180ms ease; }.activity-bar:hover { background: rgb(52 211 153); }.activity-bar.empty { background: var(--ghost-border); }.breakdown-title { color: var(--ghost-text-muted); font-size: .6875rem; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }.breakdown-row { display: flex; align-items: center; justify-content: space-between; color: var(--ghost-text-muted); font-size: .8125rem; }.breakdown-row strong { color: var(--ghost-text); font-variant-numeric: tabular-nums; }.empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: .5rem; min-height: 8rem; color: var(--ghost-text-muted); text-align: center; font-size: .8125rem; }.status-badge { display: inline-flex; padding: .15rem .4rem; border-radius: .25rem; font-size: .625rem; font-weight: 800; text-transform: uppercase; }.status-success { color: rgb(6 95 70); background: rgb(209 250 229); }.status-error, .status-denied { color: rgb(153 27 27); background: rgb(254 226 226); }.status-confirmation_required { color: rgb(146 64 14); background: rgb(254 243 199); }:global(.dark) .status-success { color: rgb(167 243 208); background: rgb(6 78 59); }:global(.dark) .status-error, :global(.dark) .status-denied { color: rgb(254 202 202); background: rgb(127 29 29); }:global(.dark) .status-confirmation_required { color: rgb(253 230 138); background: rgb(120 53 15); }
@media (prefers-reduced-motion: reduce) { .activity-bar { transition: none; } }
</style>
