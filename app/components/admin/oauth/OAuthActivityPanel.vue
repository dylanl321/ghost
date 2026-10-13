<script setup lang="ts">
/**
 * OAuthActivityPanel
 *
 * Activity attempts + grants (Requirements 8.2, 8.3, 8.4, 8.5). Attempts are
 * assembled from event groups; each event's stage state distinguishes pending /
 * waiting-for-user / succeeded / denied / cancelled / expired / failed /
 * unknown. Stages GHOST did not observe are marked "unknown" rather than
 * invented, and an installer reference with no matching server event is called
 * out as a possible local failure or missing telemetry. Grants keep requested
 * scopes distinct from consented scopes.
 */
import type {
  OAuthAttemptState,
  OAuthEvent,
  OAuthGrantSummary,
  OAuthStage
} from '#shared/types/oauth-administration'

interface ViewState<T> {
  data: T | null
  loading: boolean
  error: string | null
  unavailable: boolean
  conflict: boolean
  loaded: boolean
  observedAt: string | null
  nextCursor: string | null
  hasMore: boolean
}

const props = defineProps<{
  attempts: ViewState<OAuthEvent[][]>
  grants: ViewState<OAuthGrantSummary[]>
  attemptsEmpty: boolean
  grantsEmpty: boolean
}>()

const emit = defineEmits<{
  retryAttempts: []
  retryGrants: []
  loadMoreAttempts: [cursor: string]
  loadMoreGrants: [cursor: string]
}>()

const tab = ref<'attempts' | 'grants'>('attempts')

const STAGE_LABELS: Record<OAuthStage, string> = {
  'website-session': 'Website session',
  'protected-resource-discovery': 'Resource discovery',
  'authorization-server-discovery': 'Server discovery',
  'registration': 'Registration',
  'authorization': 'Authorization',
  'consent': 'Consent',
  'token-exchange': 'Token exchange',
  'refresh': 'Refresh',
  'revocation': 'Revocation',
  'provider-storage': 'Provider storage',
  'protected-resource-verification': 'Resource verification',
  'crew-profile-retrieval': 'Crew profile'
}

function stageLabel(stage: OAuthStage) {
  return STAGE_LABELS[stage] || stage
}

function attemptStateMeta(attemptState: OAuthAttemptState) {
  switch (attemptState) {
    case 'succeeded':
      return { color: 'emerald' as const, icon: 'i-heroicons-check-circle', label: 'Succeeded' }
    case 'denied':
      return { color: 'red' as const, icon: 'i-heroicons-no-symbol', label: 'Denied' }
    case 'failed':
      return { color: 'red' as const, icon: 'i-heroicons-x-circle', label: 'Failed' }
    case 'cancelled':
      return { color: 'amber' as const, icon: 'i-heroicons-hand-raised', label: 'Cancelled' }
    case 'expired':
      return { color: 'amber' as const, icon: 'i-heroicons-clock', label: 'Expired' }
    case 'waiting-for-user':
      return { color: 'sky' as const, icon: 'i-heroicons-user-circle', label: 'Waiting for user' }
    case 'pending':
      return { color: 'sky' as const, icon: 'i-heroicons-ellipsis-horizontal-circle', label: 'Pending' }
    default:
      return { color: 'gray' as const, icon: 'i-heroicons-question-mark-circle', label: 'Unknown' }
  }
}

function formatTimestamp(value?: string) {
  if (!value) return 'Unknown time'
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(new Date(value))
}

/** An attempt (event group) sorted chronologically. */
const attemptGroups = computed(() => {
  return (props.attempts.data || []).map((events) => {
    const sorted = [...events].sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    return { events: sorted, reference: sorted[0]?.correlationReference || sorted[0]?.referenceId || sorted[0]?.eventId }
  })
})

/** True when an attempt only carries a diagnostic/installer reference and no observed server stage event. */
function isUnobserved(events: OAuthEvent[]) {
  return events.every(e => e.attemptState === 'unknown')
}

const grants = computed(() => props.grants.data || [])
</script>

<template>
  <section class="space-y-4">
    <header>
      <h2 class="text-lg font-semibold text-gray-950 dark:text-white">Activity &amp; grants</h2>
      <p class="text-sm text-gray-600 dark:text-gray-400">
        Evidence-only stage timelines and consented grants. Unobserved steps are marked unknown, never invented.
      </p>
    </header>

    <div class="flex gap-2" role="tablist" aria-label="Activity views">
      <UButton
        role="tab"
        :aria-selected="tab === 'attempts'"
        :color="tab === 'attempts' ? 'primary' : 'gray'"
        :variant="tab === 'attempts' ? 'solid' : 'soft'"
        size="sm"
        @click="tab = 'attempts'"
      >
        Attempts
      </UButton>
      <UButton
        role="tab"
        :aria-selected="tab === 'grants'"
        :color="tab === 'grants' ? 'primary' : 'gray'"
        :variant="tab === 'grants' ? 'solid' : 'soft'"
        size="sm"
        @click="tab = 'grants'"
      >
        Grants
      </UButton>
    </div>

    <!-- Attempts -->
    <OAuthViewState
      v-if="tab === 'attempts'"
      :loading="attempts.loading"
      :empty="attemptsEmpty"
      :unavailable="attempts.unavailable"
      :conflict="attempts.conflict"
      :error="attempts.error"
      label="activity"
      :hide-retry="attempts.unavailable"
      @retry="emit('retryAttempts')"
    >
      <div class="space-y-4">
        <UCard v-for="(group, index) in attemptGroups" :key="group.reference || index">
          <template #header>
            <div class="flex items-center justify-between gap-2">
              <code class="text-xs text-gray-600 dark:text-gray-400">{{ group.reference || 'Uncorrelated attempt' }}</code>
              <span class="text-xs text-gray-500 dark:text-gray-400">{{ group.events.length }} stage event(s)</span>
            </div>
          </template>

          <UAlert
            v-if="isUnobserved(group.events)"
            class="mb-3"
            color="amber"
            variant="soft"
            icon="i-heroicons-information-circle"
            title="No matching server stage"
            description="This reference has no observed server event. It may represent a local failure or missing telemetry."
          />

          <ol class="space-y-2">
            <li
              v-for="stageEvent in group.events"
              :key="stageEvent.eventId"
              class="flex items-start gap-3 border-l-2 border-gray-200 pl-3 dark:border-gray-700"
            >
              <UIcon :name="attemptStateMeta(stageEvent.attemptState).icon" class="mt-0.5 size-4" :class="`text-${attemptStateMeta(stageEvent.attemptState).color}-500`" />
              <div class="flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="text-sm font-medium text-gray-800 dark:text-gray-200">{{ stageLabel(stageEvent.stage) }}</span>
                  <UBadge :color="attemptStateMeta(stageEvent.attemptState).color" variant="subtle" size="xs">
                    {{ attemptStateMeta(stageEvent.attemptState).label }}
                  </UBadge>
                  <UBadge v-if="stageEvent.errorCode" color="red" variant="subtle" size="xs">{{ stageEvent.errorCode }}</UBadge>
                </div>
                <p class="text-xs text-gray-500 dark:text-gray-400">
                  {{ formatTimestamp(stageEvent.timestamp) }}
                  <span v-if="typeof stageEvent.httpStatus === 'number'"> · HTTP {{ stageEvent.httpStatus }}</span>
                  <span v-if="typeof stageEvent.durationMs === 'number'"> · {{ stageEvent.durationMs }}ms</span>
                </p>
              </div>
            </li>
          </ol>
        </UCard>

        <div class="flex justify-end">
          <UButton
            v-if="attempts.hasMore && attempts.nextCursor"
            size="xs"
            color="gray"
            variant="soft"
            :loading="attempts.loading"
            @click="emit('loadMoreAttempts', attempts.nextCursor)"
          >
            Load more
          </UButton>
        </div>
      </div>
    </OAuthViewState>

    <!-- Grants -->
    <OAuthViewState
      v-else
      :loading="grants.loading"
      :empty="grantsEmpty"
      :unavailable="grants.unavailable"
      :conflict="grants.conflict"
      :error="grants.error"
      label="grants"
      :hide-retry="grants.unavailable"
      @retry="emit('retryGrants')"
    >
      <div class="space-y-3">
        <UCard v-for="grant in grants" :key="grant.grantReference">
          <div class="flex flex-col gap-2">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p class="text-sm font-medium text-gray-900 dark:text-white">
                  {{ grant.subjectDisplay || grant.subjectReference || 'Subject reference restricted' }}
                </p>
                <code class="text-xs text-gray-500 dark:text-gray-400">{{ grant.clientReference }}</code>
              </div>
              <span v-if="grant.resource" class="text-xs text-gray-500 dark:text-gray-400">{{ grant.resource }}</span>
            </div>

            <div class="grid gap-2 sm:grid-cols-2">
              <div>
                <h4 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Requested scopes</h4>
                <p class="mt-0.5 text-xs text-gray-700 dark:text-gray-300">{{ grant.requestedScopes.join(', ') || 'None' }}</p>
              </div>
              <div>
                <h4 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Consented scopes</h4>
                <p class="mt-0.5 text-xs text-gray-700 dark:text-gray-300">{{ grant.consentedScopes.join(', ') || 'None' }}</p>
              </div>
            </div>

            <p class="text-xs text-gray-500 dark:text-gray-400">
              Consented {{ formatTimestamp(grant.consentedAt) }}
              · Expires {{ grant.expiresAt ? formatTimestamp(grant.expiresAt) : 'Unknown' }}
              · Last refresh {{ grant.lastObservedRefreshAt ? formatTimestamp(grant.lastObservedRefreshAt) : 'Unknown' }}
            </p>

            <OAuthCoverageBadge :coverage="grant.metadata.coverage" :freshness="grant.metadata.freshness" />
          </div>
        </UCard>

        <div class="flex justify-end">
          <UButton
            v-if="grants.hasMore && grants.nextCursor"
            size="xs"
            color="gray"
            variant="soft"
            :loading="grants.loading"
            @click="emit('loadMoreGrants', grants.nextCursor)"
          >
            Load more
          </UButton>
        </div>
      </div>
    </OAuthViewState>
  </section>
</template>
