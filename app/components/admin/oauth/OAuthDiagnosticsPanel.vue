<script setup lang="ts">
/**
 * OAuthDiagnosticsPanel
 *
 * The diagnostics operation control (task 11.2). An administrator selects one
 * or two NAMED approved checks, supplies a required reason, and runs a durable
 * diagnostic job; the panel then polls the job (~2s) and shows its state and
 * safe per-check results, with a cancel control while it is in flight
 * (Requirements 11.1, 11.5, 17.2, 17.6).
 *
 * Capability: this control is only useful to an administrator holding
 * `oauth.operations.manage`; a capability denial surfaces as the unavailable
 * state (the server is authoritative — the presence of the control is not the
 * gate). All state lives in composable memory; requests are abortable and
 * carry the session-bound CSRF token.
 */
import type {
  OAuthDiagnosticCheck,
  OAuthDiagnosticJobState,
  OAuthOutcome
} from '#shared/types/oauth-administration'
import { useOAuthAdministration } from '../../../composables/useOAuthAdministration'

const admin = useOAuthAdministration()
const { diagnostics } = admin

/** The named approved checks, with human-readable labels for the control. */
const CHECK_OPTIONS: { value: OAuthDiagnosticCheck, label: string }[] = [
  { value: 'protected-resource-discovery', label: 'Protected-resource discovery' },
  { value: 'authorization-server-discovery', label: 'Authorization-server discovery' },
  { value: 'public-jwks-metadata', label: 'Public JWKS metadata' },
  { value: 'provider-storage-read', label: 'Provider storage read' },
  { value: 'crew-configuration-health', label: 'Crew configuration health' }
]

/** At most two checks per job (server-enforced; mirrored for a clear UX). */
const MAX_CHECKS = 2

const selected = ref<OAuthDiagnosticCheck[]>([])
const reason = ref('')

const terminalStates = new Set<OAuthDiagnosticJobState>([
  'completed',
  'failed',
  'cancelled',
  'interrupted',
  'unknown'
])

const job = computed(() => diagnostics.job)
const inFlight = computed(() => {
  const state = job.value?.state
  return diagnostics.creating || diagnostics.polling || (state !== undefined && !terminalStates.has(state))
})

const canRun = computed(() =>
  selected.value.length > 0
  && selected.value.length <= MAX_CHECKS
  && reason.value.trim().length > 0
  && !inFlight.value
)

function toggleCheck(check: OAuthDiagnosticCheck) {
  const index = selected.value.indexOf(check)
  if (index >= 0) {
    selected.value = selected.value.filter(item => item !== check)
  } else if (selected.value.length < MAX_CHECKS) {
    selected.value = [...selected.value, check]
  }
}

function isSelected(check: OAuthDiagnosticCheck) {
  return selected.value.includes(check)
}

function checkLabel(check: OAuthDiagnosticCheck) {
  return CHECK_OPTIONS.find(option => option.value === check)?.label ?? check
}

async function runDiagnostic() {
  if (!canRun.value) return
  await admin.createDiagnostic([...selected.value], reason.value.trim())
}

async function cancel() {
  if (job.value) await admin.cancelDiagnostic(job.value.jobId)
}

function stateMeta(state: OAuthDiagnosticJobState) {
  switch (state) {
    case 'completed':
      return { color: 'emerald' as const, label: 'Completed' }
    case 'running':
      return { color: 'blue' as const, label: 'Running' }
    case 'pending':
      return { color: 'gray' as const, label: 'Pending' }
    case 'cancelled':
      return { color: 'amber' as const, label: 'Cancelled' }
    case 'interrupted':
      return { color: 'amber' as const, label: 'Interrupted' }
    case 'failed':
      return { color: 'red' as const, label: 'Failed' }
    default:
      return { color: 'gray' as const, label: 'Unknown' }
  }
}

function outcomeMeta(outcome: OAuthOutcome) {
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

// Abort any in-flight poll when the control is torn down.
onBeforeUnmount(() => admin.resetDiagnostics())
</script>

<template>
  <section class="space-y-4">
    <header>
      <h2 class="text-lg font-semibold text-gray-950 dark:text-white">Diagnostics</h2>
      <p class="text-sm text-gray-600 dark:text-gray-400">
        Run one or two named checks against this deployment. Diagnostics never register clients, begin consent, exchange tokens, or consume registration quota.
      </p>
    </header>

    <div class="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
      <fieldset :disabled="inFlight" class="space-y-4">
        <legend class="sr-only">Diagnostic checks</legend>

        <div>
          <p class="mb-2 text-sm font-medium text-gray-900 dark:text-white">
            Checks <span class="text-xs font-normal text-gray-500 dark:text-gray-400">(choose up to {{ MAX_CHECKS }})</span>
          </p>
          <div class="flex flex-wrap gap-2" role="group" aria-label="Diagnostic checks">
            <button
              v-for="option in CHECK_OPTIONS"
              :key="option.value"
              type="button"
              :aria-pressed="isSelected(option.value)"
              :disabled="!isSelected(option.value) && selected.length >= MAX_CHECKS"
              class="rounded-full border px-3 py-1 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
              :class="isSelected(option.value)
                ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-400 dark:bg-indigo-900/30 dark:text-indigo-200'
                : 'border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-slate-800'"
              @click="toggleCheck(option.value)"
            >
              {{ option.label }}
            </button>
          </div>
        </div>

        <UFormGroup label="Reason" required hint="Recorded in the operation audit trail.">
          <UInput v-model="reason" placeholder="Why these checks are being run" aria-label="Reason" />
        </UFormGroup>

        <div class="flex items-center gap-2">
          <UButton :disabled="!canRun" :loading="diagnostics.creating" icon="i-heroicons-play" @click="runDiagnostic">
            Run diagnostic
          </UButton>
          <UButton
            v-if="job && inFlight"
            color="amber"
            variant="soft"
            icon="i-heroicons-x-circle"
            @click="cancel"
          >
            Cancel
          </UButton>
        </div>
      </fieldset>

      <p v-if="diagnostics.unavailable" class="mt-3 text-sm text-amber-600 dark:text-amber-400" role="status">
        Diagnostics are unavailable. Your session may have expired or you may lack the operations capability.
      </p>
      <p v-else-if="diagnostics.error" class="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">
        {{ diagnostics.error }}
      </p>
    </div>

    <!-- Job status + safe per-check results. -->
    <div v-if="job" class="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <span class="text-sm font-medium text-gray-900 dark:text-white">Job status</span>
          <UBadge :color="stateMeta(job.state).color" variant="subtle" size="xs">{{ stateMeta(job.state).label }}</UBadge>
          <UBadge v-if="job.cancellationRequested && !terminalStates.has(job.state)" color="amber" variant="subtle" size="xs">
            Cancelling
          </UBadge>
        </div>
        <span v-if="diagnostics.polling" class="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
          <UIcon name="i-heroicons-arrow-path" class="size-3 animate-spin" /> Polling
        </span>
      </div>

      <ul class="mt-3 space-y-2">
        <li v-for="check in job.checks" :key="check" class="flex items-start justify-between gap-3 rounded-md bg-gray-50 p-3 dark:bg-slate-900/60">
          <div class="min-w-0">
            <p class="text-sm font-medium text-gray-900 dark:text-white">{{ checkLabel(check) }}</p>
            <p
              v-if="job.results.find(result => result.check === check)?.summary"
              class="mt-0.5 truncate text-xs text-gray-600 dark:text-gray-400"
            >
              {{ job.results.find(result => result.check === check)?.summary }}
            </p>
          </div>
          <UBadge
            v-if="job.results.find(result => result.check === check)"
            :color="outcomeMeta(job.results.find(result => result.check === check)!.outcome).color"
            variant="subtle"
            size="xs"
          >
            {{ outcomeMeta(job.results.find(result => result.check === check)!.outcome).label }}
          </UBadge>
          <UBadge v-else color="gray" variant="subtle" size="xs">Waiting</UBadge>
        </li>
      </ul>
    </div>
  </section>
</template>
