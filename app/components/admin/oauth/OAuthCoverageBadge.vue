<script setup lang="ts">
/**
 * OAuthCoverageBadge
 *
 * Small shared badge that renders projection coverage and freshness explicitly
 * so partial / rebuilding / unavailable / stale states are never hidden behind
 * a "healthy" or "zero" reading (Requirements 2.5, 2.6, 16.5, 17.2).
 */
import type { OAuthCoverageState, OAuthFreshness } from '#shared/types/oauth-administration'

const props = defineProps<{
  coverage?: OAuthCoverageState | null
  freshness?: OAuthFreshness | null
  observedAt?: string | null
}>()

const coverageMeta = computed(() => {
  switch (props.coverage) {
    case 'complete':
      return { color: 'emerald' as const, icon: 'i-heroicons-check-circle', label: 'Complete coverage' }
    case 'partial':
      return { color: 'amber' as const, icon: 'i-heroicons-exclamation-triangle', label: 'Partial coverage' }
    case 'rebuilding':
      return { color: 'sky' as const, icon: 'i-heroicons-arrow-path', label: 'Rebuilding' }
    case 'unavailable':
      return { color: 'red' as const, icon: 'i-heroicons-no-symbol', label: 'Coverage unavailable' }
    default:
      return null
  }
})

const freshnessMeta = computed(() => {
  switch (props.freshness) {
    case 'fresh':
      return { color: 'emerald' as const, icon: 'i-heroicons-bolt', label: 'Fresh' }
    case 'stale':
      return { color: 'amber' as const, icon: 'i-heroicons-clock', label: 'Stale' }
    case 'unknown':
      return { color: 'gray' as const, icon: 'i-heroicons-question-mark-circle', label: 'Freshness unknown' }
    default:
      return null
  }
})

function formatTimestamp(value?: string | null) {
  if (!value) return null
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(value))
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-1.5">
    <UBadge
      v-if="coverageMeta"
      :color="coverageMeta.color"
      variant="subtle"
      size="xs"
    >
      <UIcon :name="coverageMeta.icon" class="mr-1 size-3" />
      {{ coverageMeta.label }}
    </UBadge>
    <UBadge
      v-if="freshnessMeta"
      :color="freshnessMeta.color"
      variant="subtle"
      size="xs"
    >
      <UIcon :name="freshnessMeta.icon" class="mr-1 size-3" />
      {{ freshnessMeta.label }}
    </UBadge>
    <span
      v-if="formatTimestamp(observedAt)"
      class="text-xs text-gray-500 dark:text-gray-400"
    >
      Observed {{ formatTimestamp(observedAt) }}
    </span>
  </div>
</template>
