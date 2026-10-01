<script setup lang="ts">
/**
 * OAuthApplicationsPanel
 *
 * Cursor-paginated application inventory with a detail drawer
 * (Requirements 5.1, 5.2, 5.6). Shows owner/team/purpose, managed lifecycle
 * state (unassigned dynamic clients are shown as "unassigned", never "approved"
 * or "blocked"), the observation window, and freshness/coverage. Read-only:
 * there are no create/edit/lifecycle controls in this phase.
 */
import type {
  OAuthApplicationDetail,
  OAuthApplicationLifecycle,
  OAuthApplicationSummary,
  OAuthBackfillCoverage,
  OAuthCoverageState,
  OAuthObservedUse
} from '#shared/types/oauth-administration'

/**
 * The composable's in-memory reconcile state (`reconcile`) surfaced to the panel
 * so it can render the "Reconcile inventory now" control, its loading/coverage
 * result, and a "last reconciled" indicator. State stays in composable memory;
 * the panel only reads it and emits `reconcile` to trigger a run.
 */
interface ReconcileState {
  loading: boolean
  coverage: OAuthBackfillCoverage | null
  error: string | null
  unavailable: boolean
}

interface ViewState<T> {
  data: T | null
  loading: boolean
  error: string | null
  unavailable: boolean
  conflict: boolean
  loaded: boolean
  coverage: string | null
  freshness: string | null
  observedAt: string | null
  nextCursor: string | null
  hasMore: boolean
  total: number | null
  totalIsExact: boolean
}

const props = defineProps<{
  list: ViewState<OAuthApplicationSummary[]>
  detail: ViewState<OAuthApplicationDetail>
  listEmpty: boolean
  clientIdFilter?: string
  /** In-memory reconcile state from the composable (task 6.1). */
  reconcile?: ReconcileState
}>()

const emit = defineEmits<{
  retry: []
  loadMore: [cursor: string]
  select: [clientId: string]
  filter: [clientId: string | undefined]
  /** Emitted when a client was created so the page can reload the inventory. */
  created: []
  /**
   * Emitted to kick one bounded inventory reconcile. The page awaits
   * `reconcileInventory()` then refreshes the inventory; this panel only
   * reflects the composable's `reconcile` state.
   */
  reconcile: []
}>()

const search = ref(props.clientIdFilter || '')
const drawerOpen = ref(false)
/** Controls the create-application wizard slideover (task 7.3). */
const createOpen = ref(false)

function onCreated() {
  // A client was created; ask the page to reload the inventory.
  emit('created')
}

const applications = computed(() => props.list.data || [])

/**
 * The coverage backing the banner: prefer the most recent in-session reconcile
 * result, otherwise fall back to the list's own coverage from the last load.
 * Drives whether the "still reconciling" banner is shown.
 */
const activeCoverage = computed<OAuthCoverageState | null>(() => {
  return props.reconcile?.coverage?.coverage
    ?? (props.list.coverage as OAuthCoverageState | null)
    ?? null
})

/** Show the banner while coverage is partial / rebuilding / unavailable. */
const showCoverageBanner = computed(() => {
  const coverage = activeCoverage.value
  return coverage === 'partial' || coverage === 'rebuilding' || coverage === 'unavailable'
})

/** Human-readable banner copy keyed off the current coverage state. */
const coverageBanner = computed(() => {
  switch (activeCoverage.value) {
    case 'unavailable':
      return {
        color: 'red' as const,
        icon: 'i-heroicons-no-symbol',
        title: 'Inventory coverage unavailable',
        description: 'The provider inventory could not be read, so some applications may be missing. Try reconciling again shortly.'
      }
    case 'rebuilding':
      return {
        color: 'sky' as const,
        icon: 'i-heroicons-arrow-path',
        title: 'Inventory is rebuilding',
        description: 'Inventory is still being reconciled — some applications may be missing until it completes.'
      }
    default:
      return {
        color: 'amber' as const,
        icon: 'i-heroicons-exclamation-triangle',
        title: 'Inventory is still being reconciled',
        description: 'Some applications may be missing until reconciliation completes.'
      }
  }
})

const reconcileLoading = computed(() => props.reconcile?.loading ?? false)
const reconcileResult = computed(() => props.reconcile?.coverage ?? null)

/**
 * The "last reconciled" timestamp: prefer the in-session reconcile checkpoint
 * (`updatedAt`, else the high-water mark), otherwise fall back to the list's
 * observation time. Returns null when nothing is known so the UI shows "—".
 */
const lastReconciledAt = computed<string | null>(() => {
  const coverage = props.reconcile?.coverage
  if (coverage) return coverage.updatedAt || coverage.highWaterMark || null
  return props.list.observedAt || null
})

const lastReconciledLabel = computed(() => {
  const value = lastReconciledAt.value
  return value ? formatTimestamp(value) : '—'
})

/** Brief counts surfaced after a completed reconcile run. */
const reconcileCounts = computed(() => {
  const coverage = reconcileResult.value
  if (!coverage) return null
  return `${coverage.clientsProjected} client(s), ${coverage.grantsProjected} grant(s)`
})

function onReconcile() {
  emit('reconcile')
}

function lifecycleMeta(lifecycle: OAuthApplicationLifecycle) {
  switch (lifecycle) {
    case 'active':
      return { color: 'emerald' as const, label: 'Active' }
    case 'deprecated':
      return { color: 'amber' as const, label: 'Deprecated' }
    case 'blocked':
      return { color: 'red' as const, label: 'Blocked' }
    case 'retired':
      return { color: 'gray' as const, label: 'Retired' }
    default:
      return { color: 'sky' as const, label: 'Unassigned' }
  }
}

function ownerLabel(application: OAuthApplicationSummary) {
  const { owner, team } = application.ownership
  if (owner && team) return `${owner} · ${team}`
  return owner || team || 'Unassigned'
}

function observedUseLabel(use?: OAuthObservedUse) {
  if (!use) return 'No observed use'
  const parts: string[] = []
  if (use.lastObservedAt) parts.push(`Last ${formatTimestamp(use.lastObservedAt)}`)
  if (typeof use.activeGrantCount === 'number') parts.push(`${use.activeGrantCount} active grant(s)`)
  if (use.observationWindow) parts.push(`Window ${use.observationWindow}`)
  return parts.length ? parts.join(' · ') : 'No observed use'
}

function formatTimestamp(value?: string) {
  if (!value) return 'Unknown'
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

const columns = [
  { key: 'name', label: 'Application' },
  { key: 'owner', label: 'Owner / team' },
  { key: 'lifecycle', label: 'State' },
  { key: 'observedUse', label: 'Observed use' },
  { key: 'actions', label: '' }
]

function openDetail(application: OAuthApplicationSummary) {
  drawerOpen.value = true
  emit('select', application.clientId)
}

function applySearch() {
  emit('filter', search.value.trim() || undefined)
}

function clearSearch() {
  search.value = ''
  emit('filter', undefined)
}

const detailData = computed(() => props.detail.data)
</script>

<template>
  <section class="space-y-4">
    <header class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 class="text-lg font-semibold text-gray-950 dark:text-white">Applications</h2>
        <p class="text-sm text-gray-600 dark:text-gray-400">
          Registered clients for this deployment. Ownership is accountable metadata, not a permission grant.
        </p>
      </div>
      <div class="flex items-center gap-2">
        <UInput
          v-model="search"
          icon="i-heroicons-magnifying-glass"
          placeholder="Filter by client ID"
          size="sm"
          class="w-full sm:w-64"
          aria-label="Filter applications by client ID"
          @keyup.enter="applySearch"
        />
        <UTooltip text="Apply filter">
          <UButton icon="i-heroicons-funnel" color="gray" variant="soft" square @click="applySearch" />
        </UTooltip>
        <UTooltip v-if="clientIdFilter" text="Clear filter">
          <UButton icon="i-heroicons-x-mark" color="gray" variant="ghost" square @click="clearSearch" />
        </UTooltip>
        <UButton icon="i-heroicons-plus" color="indigo" size="sm" @click="createOpen = true">
          Create application
        </UButton>
      </div>
    </header>

    <OAuthApplicationCreateForm v-model:open="createOpen" @created="onCreated" />

    <!-- Reconcile inventory control + "last reconciled" indicator. The button
         kicks one bounded backfill via the composable (POST /applications/
         reconcile); the page refreshes the inventory on completion. -->
    <div class="flex flex-col gap-2 rounded-md border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/40 sm:flex-row sm:items-center sm:justify-between">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600 dark:text-gray-400">
        <span>
          Last reconciled:
          <span class="font-medium text-gray-800 dark:text-gray-200">{{ lastReconciledLabel }}</span>
        </span>
        <span v-if="reconcileCounts" class="text-gray-500 dark:text-gray-500">
          Seeded {{ reconcileCounts }}
        </span>
        <span v-if="reconcile?.error" class="text-red-600 dark:text-red-400">{{ reconcile.error }}</span>
        <span v-else-if="reconcile?.unavailable" class="text-red-600 dark:text-red-400">
          Reconcile is unavailable for your session.
        </span>
      </div>
      <UButton
        icon="i-heroicons-arrow-path"
        color="gray"
        variant="soft"
        size="sm"
        :loading="reconcileLoading"
        :disabled="reconcileLoading"
        aria-label="Reconcile inventory now"
        @click="onReconcile"
      >
        Reconcile inventory now
      </UButton>
    </div>

    <!-- Coverage banner: explicit while the seed is partial / rebuilding /
         unavailable so a partial backfill never looks like missing data. -->
    <UAlert
      v-if="showCoverageBanner"
      :color="coverageBanner.color"
      variant="subtle"
      :icon="coverageBanner.icon"
      :title="coverageBanner.title"
      :description="coverageBanner.description"
    />

    <OAuthCoverageBadge
      :coverage="(list.coverage as any)"
      :freshness="(list.freshness as any)"
      :observed-at="list.observedAt"
    />

    <OAuthViewState
      :loading="list.loading"
      :empty="listEmpty"
      :unavailable="list.unavailable"
      :conflict="list.conflict"
      :error="list.error"
      label="applications"
      :hide-retry="list.unavailable"
      @retry="emit('retry')"
    >
      <UTable :rows="applications" :columns="columns">
        <template #name-data="{ row }">
          <div>
            <p class="font-medium text-gray-900 dark:text-white">{{ row.name || 'Unnamed client' }}</p>
            <code class="text-xs text-gray-500 dark:text-gray-400">{{ row.clientId }}</code>
          </div>
        </template>
        <template #owner-data="{ row }">{{ ownerLabel(row) }}</template>
        <template #lifecycle-data="{ row }">
          <UBadge :color="lifecycleMeta(row.lifecycle).color" variant="subtle" size="xs">
            {{ lifecycleMeta(row.lifecycle).label }}
          </UBadge>
        </template>
        <template #observedUse-data="{ row }">
          <span class="text-xs text-gray-600 dark:text-gray-400">{{ observedUseLabel(row.observedUse) }}</span>
        </template>
        <template #actions-data="{ row }">
          <UButton size="xs" color="gray" variant="soft" @click="openDetail(row)">Inspect</UButton>
        </template>
      </UTable>

      <div class="mt-4 flex items-center justify-between">
        <p class="text-xs text-gray-500 dark:text-gray-400">
          Showing {{ applications.length }}<span v-if="list.total !== null"> of {{ list.total }}{{ list.totalIsExact ? '' : '+' }}</span>
        </p>
        <UButton
          v-if="list.hasMore && list.nextCursor"
          size="xs"
          color="gray"
          variant="soft"
          :loading="list.loading"
          @click="emit('loadMore', list.nextCursor)"
        >
          Load more
        </UButton>
      </div>
    </OAuthViewState>

    <USlideover v-model="drawerOpen" side="right" :ui="{ width: 'max-w-2xl' }">
      <div class="flex h-full flex-col">
        <header class="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
          <div>
            <h3 class="font-semibold text-gray-950 dark:text-white">Application detail</h3>
            <p class="text-xs text-gray-500 dark:text-gray-400">Reconciled with authoritative provider state.</p>
          </div>
          <UButton icon="i-heroicons-x-mark" color="gray" variant="ghost" square aria-label="Close" @click="drawerOpen = false" />
        </header>

        <div class="min-h-0 flex-1 overflow-y-auto p-5">
          <OAuthViewState
            :loading="detail.loading"
            :empty="false"
            :unavailable="detail.unavailable"
            :conflict="detail.conflict"
            :error="detail.error"
            label="application detail"
            :hide-retry="detail.unavailable"
          >
            <div v-if="detailData" class="space-y-4">
              <div>
                <p class="text-base font-semibold text-gray-900 dark:text-white">{{ detailData.name || 'Unnamed client' }}</p>
                <code class="text-xs text-gray-500 dark:text-gray-400">{{ detailData.clientId }}</code>
              </div>

              <div class="flex flex-wrap gap-2">
                <UBadge :color="lifecycleMeta(detailData.lifecycle).color" variant="subtle" size="xs">
                  {{ lifecycleMeta(detailData.lifecycle).label }}
                </UBadge>
                <UBadge color="gray" variant="subtle" size="xs">{{ detailData.type }}</UBadge>
                <UBadge color="gray" variant="subtle" size="xs">{{ detailData.origin }}</UBadge>
              </div>

              <dl class="space-y-2 text-sm">
                <div class="flex justify-between gap-4">
                  <dt class="text-gray-500 dark:text-gray-400">Owner</dt>
                  <dd class="text-right text-gray-800 dark:text-gray-200">{{ detailData.ownership.owner || 'Unassigned' }}</dd>
                </div>
                <div class="flex justify-between gap-4">
                  <dt class="text-gray-500 dark:text-gray-400">Team</dt>
                  <dd class="text-right text-gray-800 dark:text-gray-200">{{ detailData.ownership.team || '—' }}</dd>
                </div>
                <div class="flex justify-between gap-4">
                  <dt class="text-gray-500 dark:text-gray-400">Purpose</dt>
                  <dd class="text-right text-gray-800 dark:text-gray-200">{{ detailData.ownership.purpose || '—' }}</dd>
                </div>
                <div class="flex justify-between gap-4">
                  <dt class="text-gray-500 dark:text-gray-400">Created</dt>
                  <dd class="text-right text-gray-800 dark:text-gray-200">{{ formatTimestamp(detailData.createdAt) }}</dd>
                </div>
              </dl>

              <div>
                <h4 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Redirect URIs</h4>
                <ul class="mt-1 space-y-1">
                  <li v-for="uri in detailData.redirectPolicy.redirectUris" :key="uri" class="break-all text-xs text-gray-700 dark:text-gray-300">
                    {{ uri }}
                  </li>
                  <li v-if="!detailData.redirectPolicy.redirectUris.length" class="text-xs text-gray-500">None registered</li>
                </ul>
                <p v-if="detailData.redirectPolicy.allowsLoopback" class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Native loopback redirects permitted.
                </p>
              </div>

              <div class="grid gap-3 sm:grid-cols-2">
                <div>
                  <h4 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Permitted resources</h4>
                  <p class="mt-1 text-xs text-gray-700 dark:text-gray-300">{{ detailData.permittedResources.join(', ') || 'None' }}</p>
                </div>
                <div>
                  <h4 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Permitted scopes</h4>
                  <p class="mt-1 text-xs text-gray-700 dark:text-gray-300">{{ detailData.permittedScopes.join(', ') || 'None' }}</p>
                </div>
              </div>

              <p class="text-xs text-gray-500 dark:text-gray-400">{{ observedUseLabel(detailData.observedUse) }}</p>

              <OAuthCoverageBadge
                :coverage="detailData.metadata.coverage"
                :freshness="detailData.metadata.freshness"
                :observed-at="detailData.metadata.collectedAt"
              />
            </div>
          </OAuthViewState>
        </div>
      </div>
    </USlideover>
  </section>
</template>
