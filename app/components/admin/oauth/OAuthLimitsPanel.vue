<script setup lang="ts">
/**
 * OAuthLimitsPanel
 *
 * Non-mutating registration quota observation (Requirement 12.4). Shows the
 * effective limit even when live usage is unavailable, plus the notice that
 * rejected attempts currently count and shared corporate egress may aggregate
 * multiple clients. There is deliberately NO reset or retry control
 * (Requirement 12.7) — rendering or refreshing this panel never changes quota.
 */
import type { OAuthQuotaObservation } from '#shared/types/oauth-administration'

interface ViewState<T> {
  data: T | null
  loading: boolean
  error: string | null
  unavailable: boolean
  conflict: boolean
  loaded: boolean
}

const props = defineProps<{
  state: ViewState<OAuthQuotaObservation>
  empty: boolean
}>()

const emit = defineEmits<{ retry: [] }>()

const quota = computed(() => props.state.data)

const usageUnavailable = computed(() => {
  const q = quota.value
  if (!q) return false
  return q.coverage === 'unavailable' || (q.count === null && q.available === null && q.remaining === null)
})

function formatTimestamp(value?: string | null) {
  if (!value) return 'Unknown'
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

function windowLabel(seconds: number) {
  if (seconds % 3600 === 0) return `${seconds / 3600}h`
  if (seconds % 60 === 0) return `${seconds / 60}m`
  return `${seconds}s`
}
</script>

<template>
  <section class="space-y-4">
    <header>
      <h2 class="text-lg font-semibold text-gray-950 dark:text-white">Registration limits</h2>
      <p class="text-sm text-gray-600 dark:text-gray-400">
        A read-only observation of the dynamic-registration quota. Viewing this never changes quota usage.
      </p>
    </header>

    <OAuthViewState
      :loading="state.loading"
      :empty="empty"
      :unavailable="state.unavailable"
      :conflict="state.conflict"
      :error="state.error"
      label="quota observations"
      :hide-retry="state.unavailable"
      @retry="emit('retry')"
    >
      <div v-if="quota" class="space-y-4">
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <UCard>
            <p class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Effective limit</p>
            <p class="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{{ quota.limit }}</p>
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">per {{ windowLabel(quota.windowSeconds) }}</p>
          </UCard>
          <UCard>
            <p class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Used</p>
            <p class="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
              {{ usageUnavailable || quota.count === null || quota.count === undefined ? '—' : quota.count }}
            </p>
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">{{ usageUnavailable ? 'Usage unavailable' : 'Observed count' }}</p>
          </UCard>
          <UCard>
            <p class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Remaining</p>
            <p class="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
              {{ usageUnavailable || quota.remaining === null || quota.remaining === undefined ? '—' : quota.remaining }}
            </p>
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">{{ quota.keyType }} bucket</p>
          </UCard>
          <UCard>
            <p class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Resets</p>
            <p class="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{{ formatTimestamp(quota.resetAt) }}</p>
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">Source: {{ quota.source }}</p>
          </UCard>
        </div>

        <UAlert
          v-if="usageUnavailable"
          color="amber"
          variant="soft"
          icon="i-heroicons-exclamation-triangle"
          title="Usage unavailable"
          description="The live counter could not be read. The configured limit above is still accurate."
        />

        <UAlert
          color="sky"
          variant="soft"
          icon="i-heroicons-information-circle"
          title="How this limit behaves"
          :description="quota.rejectedAttemptNotice"
        />

        <OAuthCoverageBadge :coverage="quota.coverage" :observed-at="quota.collectedAt" />
      </div>
    </OAuthViewState>
  </section>
</template>
