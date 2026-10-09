<script setup lang="ts">
/**
 * OAuthOverviewPanel
 *
 * Independent per-stage OAuth health cards (Requirements 2.3, 2.5, 2.6). Each
 * card is fully self-contained: a success in one stage never implies success in
 * another. Missing / stale / partial / unavailable evidence is rendered
 * explicitly (never as "healthy" or "zero failures"), and every card shows its
 * source, timestamp, safe outcome, availability/freshness, and next action.
 */
import type { OAuthObservation, OAuthStage } from '#shared/types/oauth-administration'

const props = defineProps<{
  state: {
    data: OAuthObservation[] | null
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

/** Human labels for each independent stage. */
const STAGE_LABELS: Record<OAuthStage, string> = {
  'website-session': 'Website session',
  'protected-resource-discovery': 'Protected-resource discovery',
  'authorization-server-discovery': 'Authorization-server discovery',
  'registration': 'Registration',
  'authorization': 'Authorization & consent',
  'consent': 'Consent',
  'token-exchange': 'Token exchange',
  'refresh': 'Refresh',
  'revocation': 'Revocation',
  'provider-storage': 'Provider storage',
  'protected-resource-verification': 'Protected-resource verification',
  'crew-profile-retrieval': 'Crew profile retrieval'
}

function stageLabel(stage: OAuthStage) {
  return STAGE_LABELS[stage] || stage
}

/** Card presentation for a stage state; unknown/unavailable are explicit. */
function stateMeta(observation: OAuthObservation) {
  switch (observation.state) {
    case 'healthy':
      return { color: 'emerald', icon: 'i-heroicons-check-circle', label: 'Healthy', ring: 'ring-emerald-500/30' }
    case 'degraded':
      return { color: 'amber', icon: 'i-heroicons-exclamation-triangle', label: 'Degraded', ring: 'ring-amber-500/30' }
    case 'failing':
      return { color: 'red', icon: 'i-heroicons-x-circle', label: 'Failing', ring: 'ring-red-500/30' }
    case 'unavailable':
      return { color: 'gray', icon: 'i-heroicons-signal-slash', label: 'Evidence unavailable', ring: 'ring-gray-400/30' }
    default:
      return { color: 'gray', icon: 'i-heroicons-question-mark-circle', label: 'Unknown', ring: 'ring-gray-400/30' }
  }
}

function outcomeLabel(observation: OAuthObservation) {
  return observation.outcome.charAt(0).toUpperCase() + observation.outcome.slice(1)
}

function formatTimestamp(value?: string) {
  if (!value) return 'No observation time'
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(value))
}

const observations = computed(() => props.state.data || [])
</script>

<template>
  <section class="space-y-4">
    <header class="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 class="text-lg font-semibold text-gray-950 dark:text-white">Stage health</h2>
        <p class="text-sm text-gray-600 dark:text-gray-400">
          Each OAuth stage is observed independently. A healthy stage never implies another is healthy.
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
      label="stage health"
      :hide-retry="state.unavailable"
      @retry="emit('retry')"
    >
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <article
          v-for="observation in observations"
          :key="observation.stage"
          class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm ring-1 dark:border-gray-700 dark:bg-slate-800"
          :class="stateMeta(observation).ring"
        >
          <div class="flex items-start justify-between gap-2">
            <h3 class="text-sm font-semibold text-gray-900 dark:text-white">
              {{ stageLabel(observation.stage) }}
            </h3>
            <UBadge :color="stateMeta(observation).color" variant="subtle" size="xs">
              <UIcon :name="stateMeta(observation).icon" class="mr-1 size-3" />
              {{ stateMeta(observation).label }}
            </UBadge>
          </div>

          <dl class="mt-3 space-y-1.5 text-xs text-gray-600 dark:text-gray-400">
            <div class="flex justify-between gap-2">
              <dt>Outcome</dt>
              <dd class="font-medium text-gray-800 dark:text-gray-200">{{ outcomeLabel(observation) }}</dd>
            </div>
            <div class="flex justify-between gap-2">
              <dt>Source</dt>
              <dd class="truncate font-medium text-gray-800 dark:text-gray-200" :title="observation.source">
                {{ observation.source }}
              </dd>
            </div>
            <div class="flex justify-between gap-2">
              <dt>Observed</dt>
              <dd class="font-medium text-gray-800 dark:text-gray-200">{{ formatTimestamp(observation.collectedAt) }}</dd>
            </div>
          </dl>

          <OAuthCoverageBadge
            class="mt-3"
            :coverage="observation.coverage"
            :freshness="observation.freshness"
          />

          <p
            v-if="observation.availability === 'unavailable'"
            class="mt-2 text-xs font-medium text-amber-600 dark:text-amber-400"
          >
            Evidence could not be read for this stage.
          </p>

          <p
            v-if="observation.nextAction"
            class="mt-3 rounded-md bg-gray-50 p-2 text-xs text-gray-700 dark:bg-slate-900/60 dark:text-gray-300"
          >
            <span class="font-semibold">Next action:</span> {{ observation.nextAction }}
          </p>
        </article>
      </div>
    </OAuthViewState>
  </section>
</template>
