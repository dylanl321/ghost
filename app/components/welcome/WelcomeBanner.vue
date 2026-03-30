<template>
  <Transition
    enter-active-class="transition-all duration-300"
    enter-from-class="opacity-0 -translate-y-2"
    enter-to-class="opacity-100 translate-y-0"
    leave-active-class="transition-all duration-300"
    leave-from-class="opacity-100 translate-y-0"
    leave-to-class="opacity-0 -translate-y-2"
  >
    <div
      v-if="visible"
      class="px-4 md:px-6 pt-3"
      role="region"
      aria-label="Welcome to GHOST quick overview"
    >
      <div
        :class="[
          'w-full rounded-lg border border-blue-200/40 dark:border-blue-900/40 bg-blue-50/60 dark:bg-blue-900/20 text-blue-900 dark:text-blue-100 transition-all duration-300',
          isHighlighted && 'ring-2 ring-blue-400 shadow-lg'
        ]"
      >
      <div class="flex items-start gap-3 p-3 md:p-4">
        <UIcon name="i-heroicons-sparkles" class="w-5 h-5 mt-0.5 text-blue-600 dark:text-blue-300" />
        <div class="flex-1 min-w-0">
          <p class="font-medium truncate">
            {{ siteConfigStore.siteName }}
          </p>
          <p class="text-sm opacity-90">
            {{ siteConfigStore.welcomeMessage }}
          </p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <UButton
            color="blue"
            variant="soft"
            size="xs"
            icon="i-heroicons-book-open"
            @click="handleOpen"
          >
            Open Quick Overview
          </UButton>
          <UButton
            color="gray"
            variant="ghost"
            size="xs"
            icon="i-heroicons-x-mark"
            :title="'Dismiss'"
            @click="handleDismiss"
          />
        </div>
      </div>
    </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { useSiteConfigStore } from '~/stores/useSiteConfigStore'

const logger = createLogger('WelcomeBanner')

const route = useRoute()
const router = useRouter()
const { getPreference, setPreference, initialized } = useUserPreferences()
const siteConfigStore = useSiteConfigStore()

const visible = ref(false)
const hasIncrementedThisSession = ref(false)
const isSettingVisibility = ref(false) // Prevents watcher from overriding during increment
const isHighlighted = ref(false)

// Highlight effect when UI settings change
let highlightTimer: NodeJS.Timeout | null = null
function triggerHighlight() {
  isHighlighted.value = true
  if (highlightTimer) clearTimeout(highlightTimer)
  highlightTimer = setTimeout(() => {
    isHighlighted.value = false
  }, 1500)
}

// Watch for UI setting changes to trigger highlights
watch(() => siteConfigStore.siteName, () => {
  if (visible.value) triggerHighlight()
})

watch(() => siteConfigStore.welcomeMessage, () => {
  if (visible.value) triggerHighlight()
})

// Re-compute visibility when preferences change OR when site config changes
// Only recompute if we're not actively setting visibility from onMounted/increment
watch([initialized, () => siteConfigStore.showWelcomeCard], ([isInitialized]) => {
  if (isInitialized && !route.path.startsWith('/support') && !isSettingVisibility.value) {
    visible.value = computeVisibility()
  }
})

function computeVisibility(): boolean {
  // Respect site config setting for showWelcomeCard
  if (!siteConfigStore.showWelcomeCard) {
    return false
  }

  const pref = getPreference<any>('welcomeBanner', null) || {}
  const dismissed = pref?.dismissed === true
  const seenCount = Number(pref?.seenCount || 0)
  // Show when not dismissed and under display limit
  return !dismissed && seenCount < 3
}

async function incrementSeenIfNeeded() {
  if (hasIncrementedThisSession.value) return

  try {
    hasIncrementedThisSession.value = true

    const nowIso = new Date().toISOString()
    const current = getPreference<any>('welcomeBanner', {}) || {}
    const next = {
      ...current,
      seenCount: Number(current.seenCount || 0) + 1,
      firstSeenAt: current.firstSeenAt || nowIso,
      lastShownAt: nowIso
    }
    await setPreference('welcomeBanner', next)
  } catch (error) {
    // Reset flag so it can retry on next page load
    hasIncrementedThisSession.value = false
    logger.error('Failed to increment welcome banner seen count:', error)
  }
}

async function handleDismiss() {
  visible.value = false
  const current = getPreference<any>('welcomeBanner', {}) || {}
  await setPreference('welcomeBanner', {
    ...current,
    dismissed: true,
    dismissedAt: new Date().toISOString()
  })
}

async function handleOpen() {
  const current = getPreference<any>('welcomeBanner', {}) || {}
  await setPreference('welcomeBanner', {
    ...current,
    clicked: true,
    clickedAt: new Date().toISOString()
  })
  router.push({ path: '/support/docs', query: { topic: 'welcome-overview' } })
}

onMounted(async () => {
  // Do not render on support pages
  if (route.path.startsWith('/support')) {
    visible.value = false
    return
  }

  // Set flag to prevent watcher from overriding during initialization
  isSettingVisibility.value = true

  try {
    // Wait for preferences to be fully loaded before checking visibility
    const { initialized, load } = useUserPreferences()
    if (!initialized.value) {
      await load()
    }

    visible.value = computeVisibility()
    if (visible.value) {
      await incrementSeenIfNeeded()
    }
  } finally {
    // Small delay to ensure API call completes before allowing watcher to run
    setTimeout(() => {
      isSettingVisibility.value = false
    }, 200)
  }
})
</script>


