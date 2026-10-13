<script setup lang="ts">
import type { KiroCrewCheckState, KiroCrewHealth } from '../../../shared/types/kirocrew-health'

defineProps<{
  health: KiroCrewHealth | null
  loading: boolean
  error: string
}>()
defineEmits<{ refresh: [] }>()

const states: Record<KiroCrewCheckState, string> = {
  ok: 'Verified',
  disabled: 'Disabled',
  missing: 'Not configured',
  unavailable: 'Unavailable',
  unverified: 'Not verified'
}
const configurationLabels = {
  healthy: 'Configuration checks passed',
  attention: 'Configuration needs attention',
  unavailable: 'Configuration status unavailable'
}
const collaborationLabels = {
  disabled: 'Collaboration disabled',
  'not-ready': 'Collaboration not ready',
  unverified: 'Collaboration not verified',
  unknown: 'Collaboration status unknown'
}
function statusClass(state: KiroCrewCheckState) {
  if (state === 'ok') return 'text-green-700 dark:text-green-300'
  if (state === 'unavailable') return 'text-red-700 dark:text-red-300'
  if (state === 'disabled') return 'text-gray-600 dark:text-gray-400'
  return 'text-amber-700 dark:text-amber-300'
}
</script>

<template>
  <section aria-labelledby="kirocrew-health-title" :aria-busy="loading">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 id="kirocrew-health-title" class="text-xl font-semibold">Health and status</h2>
        <p class="text-sm text-gray-500">Read-only checks of this GHOST process and the published revision.</p>
      </div>
      <UButton icon="i-heroicons-arrow-path" :loading="loading" :disabled="loading" @click="$emit('refresh')">
        Refresh health
      </UButton>
    </div>
    <p v-if="loading && !health" role="status" class="py-6">Checking Kiro Crew health…</p>
    <p v-if="error" role="alert" class="mb-4 rounded-lg border border-red-300 p-3 text-red-700 dark:text-red-300">
      {{ error }}<span v-if="health"> The results below are from the last successful check and may be stale.</span>
    </p>
    <template v-if="health">
      <div role="status" aria-live="polite" class="mb-4 rounded-lg border border-gray-200 p-4 dark:border-gray-700">
        <p class="font-semibold">{{ configurationLabels[health.configuration] }}</p>
        <p>{{ collaborationLabels[health.collaboration] }}</p>
        <p class="mt-2 text-sm text-gray-500">Last checked: <time :datetime="health.checkedAt">{{ health.checkedAt }}</time></p>
        <p v-if="health.revision !== null" class="text-sm text-gray-500">
          Published revision {{ health.revision }}<span v-if="health.publishedAt"> · {{ health.publishedAt }}</span>
        </p>
      </div>
      <dl v-if="health.profile" class="mb-6 grid grid-cols-2 gap-4 rounded-lg border border-gray-200 p-4 sm:grid-cols-4 dark:border-gray-700">
        <div><dt class="text-sm text-gray-500">Enabled spaces</dt><dd class="font-semibold">{{ health.profile.enabledSpaces }} / {{ health.profile.spaces }}</dd></div>
        <div><dt class="text-sm text-gray-500">Source bindings</dt><dd class="font-semibold">{{ health.profile.sourceBindings }}</dd></div>
        <div><dt class="text-sm text-gray-500">Evidence policies</dt><dd class="font-semibold">{{ health.profile.evidencePolicies }}</dd></div>
        <div><dt class="text-sm text-gray-500">Workflow versions</dt><dd class="font-semibold">{{ health.profile.workflowVersions }}</dd></div>
      </dl>
      <ul class="space-y-3" aria-label="Service checks">
        <li v-for="check in health.checks" :key="check.id" class="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h3 class="font-semibold">{{ check.label }}</h3>
            <span class="text-sm font-semibold" :class="statusClass(check.state)">{{ states[check.state] }}</span>
          </div>
          <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">{{ check.detail }}</p>
        </li>
      </ul>
      <p class="mt-4 text-sm text-gray-500">Published settings and a connected runtime do not establish pilot acceptance. Worker activity and end-to-end collaboration require their own evidence.</p>
    </template>
  </section>
</template>
