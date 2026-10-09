<script setup lang="ts">
/**
 * OAuthViewState
 *
 * Shared explicit-state block for every OAuth admin panel. Renders the
 * loading / empty / unavailable / conflict / error states in a consistent,
 * keyboard-accessible way (Requirement 17.2). Panels render this and, when
 * `showContent` is true, their own content via the default slot.
 *
 * "Partial" and "stale" are NOT terminal states here — they are surfaced
 * alongside content via OAuthCoverageBadge — so this block only covers the
 * states that replace content entirely.
 */
const props = defineProps<{
  loading?: boolean
  empty?: boolean
  unavailable?: boolean
  conflict?: boolean
  error?: string | null
  /** Optional label describing what is loading/empty for accessibility. */
  label?: string
  /** Hide the retry button (e.g. when unavailable is authorization-driven). */
  hideRetry?: boolean
}>()

const emit = defineEmits<{ retry: [] }>()

const showContent = computed(
  () => !props.loading && !props.empty && !props.unavailable && !props.conflict && !props.error
)

defineExpose({ showContent })
</script>

<template>
  <div>
    <!-- Loading -->
    <div
      v-if="loading"
      class="flex flex-col items-center justify-center gap-3 py-12 text-sm text-gray-500 dark:text-gray-400"
      role="status"
      aria-live="polite"
    >
      <UIcon name="i-heroicons-arrow-path" class="size-7 animate-spin" />
      <p>{{ label ? `Loading ${label}…` : 'Loading…' }}</p>
    </div>

    <!-- Access denied / session lost -->
    <UAlert
      v-else-if="unavailable"
      color="amber"
      variant="soft"
      icon="i-heroicons-lock-closed"
      title="This information is unavailable"
      :description="`You may not have the required OAuth capability for ${label || 'this view'}, or your session ended. Restricted results were discarded.`"
    />

    <!-- Optimistic-concurrency conflict -->
    <UAlert
      v-else-if="conflict"
      color="orange"
      variant="soft"
      icon="i-heroicons-arrows-right-left"
      title="This view changed since it loaded"
      :description="error || 'Reload to see the current state before continuing.'"
    >
      <template v-if="!hideRetry" #actions>
        <UButton color="orange" variant="soft" size="xs" @click="emit('retry')">Reload</UButton>
      </template>
    </UAlert>

    <!-- Error -->
    <UAlert
      v-else-if="error"
      color="red"
      variant="soft"
      icon="i-heroicons-exclamation-circle"
      :title="`${label ? label.charAt(0).toUpperCase() + label.slice(1) : 'This view'} could not be loaded`"
      :description="error"
    >
      <template v-if="!hideRetry" #actions>
        <UButton color="red" variant="soft" size="xs" @click="emit('retry')">Retry</UButton>
      </template>
    </UAlert>

    <!-- Empty -->
    <div
      v-else-if="empty"
      class="flex flex-col items-center justify-center gap-2 py-12 text-center text-sm text-gray-500 dark:text-gray-400"
    >
      <UIcon name="i-heroicons-inbox" class="size-8" />
      <p>{{ label ? `No ${label} to show.` : 'Nothing to show.' }}</p>
    </div>

    <!-- Content -->
    <slot v-else />
  </div>
</template>
