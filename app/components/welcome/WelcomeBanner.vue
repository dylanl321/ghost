<template>
  <div
    v-if="visible"
    class="px-4 md:px-6 pt-3"
    role="region"
    aria-label="Welcome to GHOST quick overview"
  >
    <div
      class="w-full rounded-lg border border-blue-200/40 dark:border-blue-900/40 bg-blue-50/60 dark:bg-blue-900/20 text-blue-900 dark:text-blue-100"
    >
      <div class="flex items-start gap-3 p-3 md:p-4">
        <UIcon name="i-heroicons-sparkles" class="w-5 h-5 mt-0.5 text-blue-600 dark:text-blue-300" />
        <div class="flex-1 min-w-0">
          <p class="font-medium truncate">
            Welcome to GHOST
          </p>
          <p class="text-sm opacity-90">
            New here? See a quick overview of how to navigate and use key features. You can dismiss this anytime.
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
</template>

<script setup lang="ts">
const route = useRoute()
const router = useRouter()
const { getPreference, setPreference, initialized } = useUserPreferences()

const visible = ref(false)
const hasIncrementedThisSession = ref(false)

// Re-compute visibility when preferences change
watch(initialized, (isInitialized) => {
  if (isInitialized && !route.path.startsWith('/support')) {
    visible.value = computeVisibility()
  }
})

function computeVisibility(): boolean {
  const pref = getPreference<any>('welcomeBanner', null) || {}
  const dismissed = pref?.dismissed === true
  const seenCount = Number(pref?.seenCount || 0)
  // Show when not dismissed and under display limit
  return !dismissed && seenCount < 3
}

async function incrementSeenIfNeeded() {
  if (hasIncrementedThisSession.value) return
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

  // Wait for preferences to be fully loaded before checking visibility
  const { initialized, load } = useUserPreferences()
  if (!initialized.value) {
    await load()
  }

  visible.value = computeVisibility()
  if (visible.value) {
    await incrementSeenIfNeeded()
  }
})
</script>


