<script setup lang="ts">
/**
 * OAuthAuditPanel
 *
 * Cursor-paginated OAuth administration audit history. Each record shows the
 * actor, capability, environment, reference kind/id, reason, safe outcome,
 * changed field names, and safe verification evidence. `referenceKind`
 * distinguishes operation / read / diagnostic / export access. Records carry a
 * 90-day logical expiry server-side; the panel is read-only.
 */
import type { OAuthAuditRecord } from '#shared/types/oauth-administration'

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

const props = defineProps<{
  state: ViewState<Record<string, unknown>[]>
  empty: boolean
}>()

const emit = defineEmits<{
  retry: []
  loadMore: [cursor: string]
}>()

const records = computed(() => (props.state.data || []) as unknown as OAuthAuditRecord[])

function outcomeMeta(outcome: string) {
  switch (outcome) {
    case 'success':
      return { color: 'emerald' as const, label: 'Success' }
    case 'failure':
      return { color: 'red' as const, label: 'Failure' }
    case 'denied':
      return { color: 'amber' as const, label: 'Denied' }
    default:
      return { color: 'gray' as const, label: 'Unknown' }
  }
}

function formatTimestamp(value?: string) {
  if (!value) return 'Unknown'
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

/** A colour hint per reference kind so operation/read/diagnostic/export are distinguishable. */
function referenceKindMeta(kind: string) {
  switch (kind) {
    case 'operation':
      return { color: 'blue' as const, label: 'operation' }
    case 'read':
      return { color: 'gray' as const, label: 'read' }
    case 'diagnostic':
      return { color: 'violet' as const, label: 'diagnostic' }
    case 'export':
      return { color: 'orange' as const, label: 'export' }
    default:
      return { color: 'gray' as const, label: kind || 'unknown' }
  }
}

/** Safe changed-field names for a record (never raw before/after values). */
function changedFields(row: OAuthAuditRecord): string[] {
  return Array.isArray(row.changedFields) ? row.changedFields : []
}

/**
 * Render the record's safe verification evidence as compact `key: value`
 * entries. The server only ever persists safe, allowlisted evidence here
 * (redacted; no secrets or raw request content), so it is safe to display.
 */
function evidenceEntries(row: OAuthAuditRecord): { key: string, value: string }[] {
  const evidence = row.evidence
  if (!evidence || typeof evidence !== 'object') return []
  return Object.entries(evidence).map(([key, value]) => ({
    key,
    value: typeof value === 'object' ? JSON.stringify(value) : String(value)
  }))
}

const columns = [
  { key: 'timestamp', label: 'Time' },
  { key: 'environment', label: 'Environment' },
  { key: 'actor', label: 'Actor' },
  { key: 'capability', label: 'Capability' },
  { key: 'reference', label: 'Reference' },
  { key: 'outcome', label: 'Outcome' },
  { key: 'changes', label: 'Changes' },
  { key: 'reason', label: 'Reason' }
]
</script>

<template>
  <section class="space-y-4">
    <header>
      <h2 class="text-lg font-semibold text-gray-950 dark:text-white">Audit history</h2>
      <p class="text-sm text-gray-600 dark:text-gray-400">
        Administrative operations, restricted reads, diagnostics, and exports. Retained for 90 days.
      </p>
    </header>

    <OAuthViewState
      :loading="state.loading"
      :empty="empty"
      :unavailable="state.unavailable"
      :conflict="state.conflict"
      :error="state.error"
      label="audit records"
      :hide-retry="state.unavailable"
      @retry="emit('retry')"
    >
      <UTable :rows="records" :columns="columns">
        <template #timestamp-data="{ row }">{{ formatTimestamp(row.timestamp) }}</template>
        <template #environment-data="{ row }">
          <UBadge color="gray" variant="subtle" size="xs">{{ row.deployment }}</UBadge>
        </template>
        <template #actor-data="{ row }"><code class="text-xs">{{ row.actor }}</code></template>
        <template #capability-data="{ row }"><code class="text-xs">{{ row.capability }}</code></template>
        <template #reference-data="{ row }">
          <div>
            <UBadge :color="referenceKindMeta(row.referenceKind).color" variant="subtle" size="xs">
              {{ referenceKindMeta(row.referenceKind).label }}
            </UBadge>
            <code class="ml-1 text-xs text-gray-500 dark:text-gray-400">{{ row.referenceId }}</code>
          </div>
        </template>
        <template #outcome-data="{ row }">
          <UBadge :color="outcomeMeta(row.outcome).color" variant="subtle" size="xs">{{ outcomeMeta(row.outcome).label }}</UBadge>
        </template>
        <template #changes-data="{ row }">
          <div class="space-y-1">
            <div v-if="changedFields(row).length" class="flex flex-wrap gap-1">
              <UBadge
                v-for="field in changedFields(row)"
                :key="field"
                color="sky"
                variant="subtle"
                size="xs"
              >
                {{ field }}
              </UBadge>
            </div>
            <dl v-if="evidenceEntries(row).length" class="text-xs text-gray-500 dark:text-gray-400">
              <div v-for="entry in evidenceEntries(row)" :key="entry.key" class="flex gap-1">
                <dt class="font-medium">{{ entry.key }}:</dt>
                <dd class="truncate" :title="entry.value">{{ entry.value }}</dd>
              </div>
            </dl>
            <span v-if="!changedFields(row).length && !evidenceEntries(row).length" class="text-xs text-gray-400">—</span>
          </div>
        </template>
        <template #reason-data="{ row }">
          <span class="block max-w-xs truncate text-xs text-gray-600 dark:text-gray-400" :title="row.reason">{{ row.reason || '—' }}</span>
        </template>
      </UTable>

      <div class="mt-4 flex justify-end">
        <UButton
          v-if="state.hasMore && state.nextCursor"
          size="xs"
          color="gray"
          variant="soft"
          :loading="state.loading"
          @click="emit('loadMore', state.nextCursor)"
        >
          Load more
        </UButton>
      </div>
    </OAuthViewState>
  </section>
</template>
