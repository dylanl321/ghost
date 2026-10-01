<script setup lang="ts">
/**
 * OAuthApplicationsHealthPanel
 *
 * Always-present "Applications health" block for the two well-known deployment
 * applications (MCP and Kiro Crew). Renders a self-contained status card per
 * application from `/applications/health` (Requirement 3.1) so a quiet,
 * freshly deployed environment is informative at a glance.
 *
 * The core "make it usable" rule is preserved here in the rendering: a benign
 * "no activity"/"never observed" state is drawn neutrally ("No activity
 * observed yet") and is visually distinct from an actionable
 * `misconfigured`/failing state (Requirements 3.4, 4.4). The phase/capability
 * gate is driven by the server response (loading/empty/unavailable), never by
 * the presence of a control.
 */
import type {
  OAuthApplicationLabel,
  OAuthApplicationStatus,
  OAuthApplicationStatusState
} from '#shared/types/oauth-administration'

const props = defineProps<{
  state: {
    data: OAuthApplicationStatus[] | null
    loading: boolean
    error: string | null
    unavailable: boolean
    conflict: boolean
    loaded: boolean
    observedAt: string | null
    deployment: string | null
  }
  empty: boolean
}>()

const emit = defineEmits<{ retry: [] }>()

/** Human labels for the two well-known deployment applications. */
const APPLICATION_LABELS: Record<OAuthApplicationLabel, string> = {
  'mcp': 'MCP',
  'kiro-crew': 'Kiro Crew'
}

function applicationLabel(application: OAuthApplicationLabel) {
  return APPLICATION_LABELS[application] || application
}

/**
 * Card presentation per status. Positive states (registered/active) read
 * green; `no-activity`, `not-registered`, and `unknown` read neutral (never
 * alarming); only `misconfigured` reads as an actionable warning. This is the
 * design's benign-vs-actionable distinction (Requirements 3.4, 3.6, 3.7, 3.8).
 */
function statusMeta(status: OAuthApplicationStatusState) {
  switch (status) {
    case 'active':
      return { color: 'emerald' as const, icon: 'i-heroicons-check-circle', label: 'Active', ring: 'ring-emerald-500/30' }
    case 'registered':
      return { color: 'emerald' as const, icon: 'i-heroicons-check-badge', label: 'Registered', ring: 'ring-emerald-500/30' }
    case 'no-activity':
      return { color: 'gray' as const, icon: 'i-heroicons-moon', label: 'No activity observed yet', ring: 'ring-gray-400/30' }
    case 'not-registered':
      return { color: 'gray' as const, icon: 'i-heroicons-minus-circle', label: 'Not registered yet', ring: 'ring-gray-400/30' }
    case 'misconfigured':
      return { color: 'red' as const, icon: 'i-heroicons-exclamation-triangle', label: 'Misconfigured', ring: 'ring-red-500/30' }
    default:
      return { color: 'gray' as const, icon: 'i-heroicons-arrow-path', label: 'Reconciling', ring: 'ring-gray-400/30' }
  }
}

/** Only genuinely actionable states earn a distinct, non-neutral emphasis. */
function isActionable(status: OAuthApplicationStatusState) {
  return status === 'misconfigured'
}

function formatTimestamp(value?: string | null) {
  if (!value) return null
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(value))
}

const statuses = computed(() => props.state.data || [])
</script>

<template>
  <section class="space-y-4">
    <header class="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 class="text-lg font-semibold text-gray-950 dark:text-white">Applications health</h2>
        <p class="text-sm text-gray-600 dark:text-gray-400">
          Always-present status for the MCP and Kiro Crew applications. A quiet application shows
          "No activity observed yet" — that is benign, not a failure.
        </p>
      </div>
      <p v-if="state.deployment" class="text-xs text-gray-500 dark:text-gray-400">
        Deployment: <span class="font-medium capitalize">{{ state.deployment }}</span>
      </p>
    </header>

    <OAuthViewState
      :loading="state.loading"
      :empty="empty"
      :unavailable="state.unavailable"
      :conflict="state.conflict"
      :error="state.error"
      label="applications health"
      :hide-retry="state.unavailable"
      @retry="emit('retry')"
    >
      <div class="grid gap-4 sm:grid-cols-2">
        <article
          v-for="status in statuses"
          :key="status.application"
          class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm ring-1 dark:border-gray-700 dark:bg-slate-800"
          :class="statusMeta(status.status).ring"
        >
          <div class="flex items-start justify-between gap-2">
            <div>
              <h3 class="text-sm font-semibold text-gray-900 dark:text-white">
                {{ applicationLabel(status.application) }}
              </h3>
              <p class="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400" :title="status.resource">
                {{ status.resource }}
              </p>
            </div>
            <UBadge :color="statusMeta(status.status).color" variant="subtle" size="xs">
              <UIcon :name="statusMeta(status.status).icon" class="mr-1 size-3" />
              {{ statusMeta(status.status).label }}
            </UBadge>
          </div>

          <dl class="mt-3 space-y-1.5 text-xs text-gray-600 dark:text-gray-400">
            <div class="flex justify-between gap-2">
              <dt>Live grants</dt>
              <dd class="font-medium text-gray-800 dark:text-gray-200">{{ status.liveGrantCount }}</dd>
            </div>
            <div class="flex justify-between gap-2">
              <dt>Last observed use</dt>
              <dd class="font-medium text-gray-800 dark:text-gray-200">
                {{ formatTimestamp(status.lastObservedUse) || 'Never observed' }}
              </dd>
            </div>
            <div v-if="status.approvedScopes.length" class="flex justify-between gap-2">
              <dt>Approved scopes</dt>
              <dd class="truncate text-right font-medium text-gray-800 dark:text-gray-200" :title="status.approvedScopes.join(', ')">
                {{ status.approvedScopes.length }}
              </dd>
            </div>
          </dl>

          <OAuthCoverageBadge
            class="mt-3"
            :coverage="status.coverage"
            :freshness="status.freshness"
            :observed-at="status.collectedAt"
          />

          <!-- Actionable states (misconfigured) get a distinct, non-neutral
               treatment; benign states never render as alarming. -->
          <p
            v-if="status.nextAction"
            class="mt-3 rounded-md p-2 text-xs"
            :class="isActionable(status.status)
              ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'
              : 'bg-gray-50 text-gray-700 dark:bg-slate-900/60 dark:text-gray-300'"
          >
            <span class="font-semibold">Next action:</span> {{ status.nextAction }}
          </p>
        </article>
      </div>
    </OAuthViewState>
  </section>
</template>
