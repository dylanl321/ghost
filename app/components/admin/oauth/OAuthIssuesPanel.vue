<script setup lang="ts">
/**
 * OAuthIssuesPanel
 *
 * Grouped issue investigations with a detail drawer (Requirement 10.2). Shows
 * first/last observation, attempts, and — kept explicitly separate — anonymous
 * attempt counts vs identified user counts, and the administrator's disposition
 * vs observed recovery verification. The detail drawer also carries the
 * revision-checked investigation update controls (owner/notes/mitigation/
 * disposition) — the administrator DISPOSITION is edited here while the observed
 * RECOVERY verification stays read-only and evidence-derived (Req 10.6).
 */
import type {
  OAuthIssue,
  OAuthIssueDisposition,
  OAuthIssueSeverity,
  OAuthIssueVerification
} from '#shared/types/oauth-administration'

interface ViewState<T> {
  data: T | null
  loading: boolean
  error: string | null
  unavailable: boolean
  conflict: boolean
  loaded: boolean
  nextCursor: string | null
  hasMore: boolean
}

/** The investigation update the admin may submit (owner/notes/mitigation/disposition). */
export interface IssueInvestigationUpdate {
  owner?: string
  notes?: string
  mitigation?: string
  disposition?: OAuthIssueDisposition
}

/** In-memory state for the update mutation (loading/conflict/error). */
interface IssueUpdateState {
  submitting: boolean
  error: string | null
  conflict: boolean
  unavailable: boolean
}

const props = defineProps<{
  list: ViewState<OAuthIssue[]>
  detail: ViewState<OAuthIssue>
  listEmpty: boolean
  /** Mutation state for the investigation update controls. */
  updateState?: IssueUpdateState
}>()

const emit = defineEmits<{
  retry: []
  loadMore: [cursor: string]
  select: [groupId: string]
  /** Submit a revision-checked investigation update for the open issue. */
  update: [groupId: string, changes: IssueInvestigationUpdate, expectedRevision: string, reason: string]
}>()

const drawerOpen = ref(false)

const issues = computed(() => props.list.data || [])
const detailData = computed(() => props.detail.data)

/** The dispositions an administrator may set (distinct from recovery verification). */
const DISPOSITION_OPTIONS: OAuthIssueDisposition[] = ['open', 'investigating', 'mitigated', 'resolved', 'dismissed']

/** True while the investigation controls are open for editing. */
const editing = ref(false)

/** The editable investigation form, seeded from the current issue detail. */
const form = reactive<{ owner: string, notes: string, mitigation: string, disposition: OAuthIssueDisposition, reason: string }>({
  owner: '',
  notes: '',
  mitigation: '',
  disposition: 'open',
  reason: ''
})

/** Seed the form from the current detail when the drawer/detail changes. */
watch(detailData, (issue) => {
  if (!issue) return
  form.owner = issue.owner ?? ''
  form.notes = issue.notes ?? ''
  form.mitigation = issue.mitigation ?? ''
  form.disposition = issue.disposition
  form.reason = ''
  editing.value = false
}, { immediate: true })

const canSubmit = computed(() =>
  Boolean(detailData.value)
  && form.reason.trim().length > 0
  && !props.updateState?.submitting
)

function submitUpdate() {
  const issue = detailData.value
  if (!issue || !canSubmit.value) return
  // Send only fields that changed; an empty string clears the optional field.
  const changes: IssueInvestigationUpdate = {}
  if ((issue.owner ?? '') !== form.owner) changes.owner = form.owner
  if ((issue.notes ?? '') !== form.notes) changes.notes = form.notes
  if ((issue.mitigation ?? '') !== form.mitigation) changes.mitigation = form.mitigation
  if (issue.disposition !== form.disposition) changes.disposition = form.disposition
  if (Object.keys(changes).length === 0) return
  emit('update', issue.groupId, changes, issue.revision, form.reason.trim())
}

function severityMeta(severity: OAuthIssueSeverity) {
  switch (severity) {
    case 'critical':
      return { color: 'red' as const, label: 'Critical' }
    case 'high':
      return { color: 'orange' as const, label: 'High' }
    case 'medium':
      return { color: 'amber' as const, label: 'Medium' }
    default:
      return { color: 'gray' as const, label: 'Low' }
  }
}

function dispositionLabel(disposition: OAuthIssueDisposition) {
  return disposition.charAt(0).toUpperCase() + disposition.slice(1)
}

function verificationMeta(verification: OAuthIssueVerification) {
  switch (verification) {
    case 'observed-recovery':
      return { color: 'emerald' as const, label: 'Observed recovery' }
    case 'no-recovery-evidence':
      return { color: 'amber' as const, label: 'No recovery evidence' }
    default:
      return { color: 'gray' as const, label: 'Unverified' }
  }
}

function formatTimestamp(value?: string) {
  if (!value) return 'Unknown'
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

const columns = [
  { key: 'category', label: 'Category' },
  { key: 'severity', label: 'Severity' },
  { key: 'count', label: 'Attempts' },
  { key: 'affected', label: 'Affected' },
  { key: 'disposition', label: 'Disposition' },
  { key: 'lastObservedAt', label: 'Last seen' },
  { key: 'actions', label: '' }
]

function openDetail(issue: OAuthIssue) {
  drawerOpen.value = true
  emit('select', issue.groupId)
}
</script>

<template>
  <section class="space-y-4">
    <header>
      <h2 class="text-lg font-semibold text-gray-950 dark:text-white">Issues</h2>
      <p class="text-sm text-gray-600 dark:text-gray-400">
        Repeated failures grouped into investigations. Anonymous attempts stay separate from identified users.
      </p>
    </header>

    <OAuthViewState
      :loading="list.loading"
      :empty="listEmpty"
      :unavailable="list.unavailable"
      :conflict="list.conflict"
      :error="list.error"
      label="issues"
      :hide-retry="list.unavailable"
      @retry="emit('retry')"
    >
      <UTable :rows="issues" :columns="columns">
        <template #category-data="{ row }">
          <div>
            <p class="text-sm font-medium capitalize text-gray-900 dark:text-white">{{ row.category.replaceAll('-', ' ') }}</p>
            <UBadge v-if="row.unverified" color="amber" variant="subtle" size="xs">Unverified cause</UBadge>
          </div>
        </template>
        <template #severity-data="{ row }">
          <UBadge :color="severityMeta(row.severity).color" variant="subtle" size="xs">{{ severityMeta(row.severity).label }}</UBadge>
        </template>
        <template #count-data="{ row }">{{ row.count }}</template>
        <template #affected-data="{ row }">
          <span class="text-xs text-gray-600 dark:text-gray-400">
            {{ row.identifiedCount }} user(s) · {{ row.anonymousCount }} anon
          </span>
        </template>
        <template #disposition-data="{ row }">
          <UBadge color="gray" variant="subtle" size="xs">{{ dispositionLabel(row.disposition) }}</UBadge>
        </template>
        <template #lastObservedAt-data="{ row }">{{ formatTimestamp(row.lastObservedAt) }}</template>
        <template #actions-data="{ row }">
          <UButton size="xs" color="gray" variant="soft" @click="openDetail(row)">Inspect</UButton>
        </template>
      </UTable>

      <div class="mt-4 flex justify-end">
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
            <h3 class="font-semibold text-gray-950 dark:text-white">Issue detail</h3>
            <p class="text-xs text-gray-500 dark:text-gray-400">Disposition is separate from observed recovery.</p>
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
            label="issue detail"
            :hide-retry="detail.unavailable"
          >
            <div v-if="detailData" class="space-y-4">
              <div class="flex flex-wrap items-center gap-2">
                <UBadge :color="severityMeta(detailData.severity).color" variant="subtle" size="xs">{{ severityMeta(detailData.severity).label }}</UBadge>
                <span class="text-sm font-medium capitalize text-gray-900 dark:text-white">{{ detailData.category.replaceAll('-', ' ') }}</span>
                <UBadge v-if="detailData.unverified" color="amber" variant="subtle" size="xs">Unverified cause</UBadge>
              </div>

              <dl class="space-y-2 text-sm">
                <div class="flex justify-between gap-4">
                  <dt class="text-gray-500 dark:text-gray-400">First observed</dt>
                  <dd class="text-gray-800 dark:text-gray-200">{{ formatTimestamp(detailData.firstObservedAt) }}</dd>
                </div>
                <div class="flex justify-between gap-4">
                  <dt class="text-gray-500 dark:text-gray-400">Last observed</dt>
                  <dd class="text-gray-800 dark:text-gray-200">{{ formatTimestamp(detailData.lastObservedAt) }}</dd>
                </div>
                <div class="flex justify-between gap-4">
                  <dt class="text-gray-500 dark:text-gray-400">Attempts</dt>
                  <dd class="text-gray-800 dark:text-gray-200">{{ detailData.count }}</dd>
                </div>
                <div class="flex justify-between gap-4">
                  <dt class="text-gray-500 dark:text-gray-400">Identified users</dt>
                  <dd class="text-gray-800 dark:text-gray-200">{{ detailData.identifiedCount }}</dd>
                </div>
                <div class="flex justify-between gap-4">
                  <dt class="text-gray-500 dark:text-gray-400">Anonymous attempts</dt>
                  <dd class="text-gray-800 dark:text-gray-200">{{ detailData.anonymousCount }}</dd>
                </div>
                <div class="flex justify-between gap-4">
                  <dt class="text-gray-500 dark:text-gray-400">Owner</dt>
                  <dd class="text-gray-800 dark:text-gray-200">{{ detailData.owner || 'Unassigned' }}</dd>
                </div>
              </dl>

              <!-- Disposition (administrator judgement) is deliberately kept
                   visually distinct from recovery verification (observed
                   evidence). An administrator sets the disposition; the
                   verification is evidence-derived and read-only here (Req 10.6). -->
              <div class="grid gap-3 sm:grid-cols-2">
                <div class="rounded-md border border-indigo-200 bg-indigo-50/60 p-3 dark:border-indigo-900/50 dark:bg-indigo-900/20">
                  <h4 class="text-xs font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">Disposition (administrator)</h4>
                  <p class="mt-1 text-sm text-gray-800 dark:text-gray-200">{{ dispositionLabel(detailData.disposition) }}</p>
                </div>
                <div class="rounded-md border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-slate-900/60">
                  <h4 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Recovery verification (observed)</h4>
                  <UBadge class="mt-1" :color="verificationMeta(detailData.verification).color" variant="subtle" size="xs">
                    {{ verificationMeta(detailData.verification).label }}
                  </UBadge>
                  <p class="mt-1 text-[11px] text-gray-500 dark:text-gray-500">Derived from observed evidence — not set by an administrator.</p>
                </div>
              </div>

              <!-- Read-only notes/mitigation shown when not editing. -->
              <template v-if="!editing">
                <div v-if="detailData.notes">
                  <h4 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Notes</h4>
                  <p class="mt-1 whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">{{ detailData.notes }}</p>
                </div>
                <div v-if="detailData.mitigation">
                  <h4 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Mitigation</h4>
                  <p class="mt-1 whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">{{ detailData.mitigation }}</p>
                </div>
                <div>
                  <UButton size="xs" color="gray" variant="soft" icon="i-heroicons-pencil-square" @click="editing = true">
                    Update investigation
                  </UButton>
                </div>
              </template>

              <!-- Investigation update controls (owner/notes/mitigation/disposition). -->
              <form v-else class="space-y-3 rounded-md border border-gray-200 p-3 dark:border-gray-700" @submit.prevent="submitUpdate">
                <fieldset :disabled="updateState?.submitting" class="space-y-3">
                  <legend class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Update investigation</legend>

                  <UFormGroup label="Owner">
                    <UInput v-model="form.owner" placeholder="jane.doe" aria-label="Issue owner" />
                  </UFormGroup>

                  <UFormGroup label="Disposition" hint="Administrator judgement — does not change observed recovery verification.">
                    <USelectMenu
                      v-model="form.disposition"
                      :options="DISPOSITION_OPTIONS"
                      aria-label="Disposition"
                    >
                      <template #label>{{ dispositionLabel(form.disposition) }}</template>
                      <template #option="{ option }">{{ dispositionLabel(option) }}</template>
                    </USelectMenu>
                  </UFormGroup>

                  <UFormGroup label="Notes">
                    <UTextarea v-model="form.notes" :rows="3" placeholder="Investigation notes" aria-label="Investigation notes" />
                  </UFormGroup>

                  <UFormGroup label="Mitigation">
                    <UTextarea v-model="form.mitigation" :rows="2" placeholder="Mitigation applied" aria-label="Mitigation" />
                  </UFormGroup>

                  <UFormGroup label="Reason" required hint="Recorded in the operation audit trail.">
                    <UInput v-model="form.reason" placeholder="Why this update is being made" aria-label="Reason" />
                  </UFormGroup>

                  <p v-if="updateState?.conflict" class="text-sm text-amber-600 dark:text-amber-400" role="alert">
                    This issue changed since it was loaded. Reload it and retry.
                  </p>
                  <p v-else-if="updateState?.unavailable" class="text-sm text-amber-600 dark:text-amber-400" role="status">
                    Updates are unavailable. Your session may have expired or you may lack the operations capability.
                  </p>
                  <p v-else-if="updateState?.error" class="text-sm text-red-600 dark:text-red-400" role="alert">
                    {{ updateState.error }}
                  </p>

                  <div class="flex items-center gap-2">
                    <UButton type="submit" size="xs" :disabled="!canSubmit" :loading="updateState?.submitting">Save</UButton>
                    <UButton size="xs" color="gray" variant="ghost" :disabled="updateState?.submitting" @click="editing = false">Cancel</UButton>
                  </div>
                </fieldset>
              </form>

              <OAuthCoverageBadge :coverage="detailData.metadata.coverage" :freshness="detailData.metadata.freshness" />
            </div>
          </OAuthViewState>
        </div>
      </div>
    </USlideover>
  </section>
</template>
