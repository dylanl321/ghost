<template>
  <UCard
    v-if="shouldShow"
    class="mb-6 border border-emerald-500/20 bg-gradient-to-r from-emerald-950/30 to-blue-950/30"
  >
    <div class="flex items-start justify-between gap-4">
      <div class="flex-1">
        <div class="flex items-center gap-2 mb-2">
          <UIcon name="i-fa6-solid-ghost" class="h-6 w-6 text-emerald-400" />
          <h2 class="text-xl font-semibold text-white">
            Welcome to GHOST
          </h2>
        </div>
        <p class="text-gray-300 mb-4">
          Your centralized AWS Dashboard Hub for managing accounts, analyzing costs, and exploring your organization.
        </p>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <UButton
            icon="i-heroicons-magnifying-glass"
            color="emerald"
            variant="soft"
            size="lg"
            class="justify-start"
            @click="handleSearchAccounts"
          >
            Search Accounts
          </UButton>

          <UButton
            icon="i-heroicons-chart-bar"
            to="/account/costs"
            color="blue"
            variant="soft"
            size="lg"
            class="justify-start"
          >
            View Cost Analytics
          </UButton>

          <UButton
            icon="i-heroicons-building-office"
            to="/account/org-chart"
            color="purple"
            variant="soft"
            size="lg"
            class="justify-start"
          >
            Explore Organization
          </UButton>

          <UButton
            icon="i-heroicons-book-open"
            to="/support/docs?topic=welcome-overview"
            color="gray"
            variant="soft"
            size="lg"
            class="justify-start"
          >
            Read Documentation
          </UButton>
        </div>

        <div class="mt-4 flex items-center gap-4 text-sm">
          <UButton
            variant="ghost"
            color="gray"
            size="xs"
            icon="i-heroicons-sparkles"
            to="/account/costs?tour=1"
          >
            Take an Interactive Tour
          </UButton>
          <button
            class="text-gray-400 hover:text-gray-300 transition-colors"
            @click="handleDismiss"
          >
            Hide this card
          </button>
        </div>
      </div>

      <UButton
        icon="i-heroicons-x-mark"
        color="gray"
        variant="ghost"
        size="xs"
        @click="handleDismiss"
        class="flex-shrink-0"
      />
    </div>
  </UCard>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'

const { getPreference, setPreference, initialized, load } = useUserPreferences()

// localStorage cache key for resilience when API fails
const QUICK_START_CACHE_KEY = 'ghost-quickstart-preference'

interface QuickStartCardPreference {
  dismissCount: number
  viewCount: number
  firstSeenAt?: string
  lastDismissedAt?: string
}

const preference = ref<QuickStartCardPreference>({
  dismissCount: 0,
  viewCount: 0,
})

const shouldShow = computed(() => {
  // Hide after 3 dismissals OR 5 views
  return preference.value.dismissCount < 3 && preference.value.viewCount < 5
})

/**
 * Cache preference to localStorage for resilience
 */
function cacheToLocalStorage(pref: QuickStartCardPreference): void {
  try {
    localStorage.setItem(QUICK_START_CACHE_KEY, JSON.stringify(pref))
  } catch (e) {
    console.warn('Failed to cache quickstart preference:', e)
  }
}

/**
 * Get cached preference from localStorage
 */
function getCachedPreference(): QuickStartCardPreference | null {
  try {
    const cached = localStorage.getItem(QUICK_START_CACHE_KEY)
    if (!cached) return null
    return JSON.parse(cached)
  } catch (e) {
    console.warn('Failed to read cached quickstart preference:', e)
    return null
  }
}

onMounted(async () => {
  try {
    // Wait for preferences to be fully loaded before reading
    if (!initialized.value) {
      await load()
    }

    // Load preference from user preferences
    const stored = getPreference<QuickStartCardPreference>('quickStartCard')

    if (stored) {
      preference.value = stored
      // Cache to localStorage on successful load
      cacheToLocalStorage(stored)
    } else {
      // Check localStorage fallback if no server preference
      const cached = getCachedPreference()
      if (cached) {
        console.log('QuickStartCard: Using cached preference from localStorage')
        preference.value = cached
      }
    }

    // Increment view count if showing
    if (shouldShow.value) {
      const now = new Date().toISOString()
      const updated: QuickStartCardPreference = {
        ...preference.value,
        viewCount: preference.value.viewCount + 1,
        firstSeenAt: preference.value.firstSeenAt || now,
      }

      preference.value = updated

      // Try to save to server, but don't fail the UI if it fails
      setPreference('quickStartCard', updated).then(success => {
        if (success) {
          cacheToLocalStorage(updated)
        }
      }).catch(() => {
        // Fallback: save locally anyway
        cacheToLocalStorage(updated)
      })
    }
  } catch (error) {
    console.warn('QuickStartCard: Failed to load preferences, using localStorage fallback:', error)
    // Fallback to localStorage
    const cached = getCachedPreference()
    if (cached) {
      preference.value = cached
    }
    // If no cached preference, use defaults (show card for new users)
  }
})

const handleDismiss = async () => {
  const now = new Date().toISOString()
  const updated: QuickStartCardPreference = {
    ...preference.value,
    dismissCount: preference.value.dismissCount + 1,
    lastDismissedAt: now,
  }

  preference.value = updated

  // Always save to localStorage immediately for resilience
  cacheToLocalStorage(updated)

  // Also try to save to server
  await setPreference('quickStartCard', updated)
}

const handleSearchAccounts = () => {
  // Trigger universal search - emit event or use a composable
  // The UniversalSearch component listens for Cmd+K or focus events
  const searchInput = document.querySelector('[data-search-input]') as HTMLInputElement
  if (searchInput) {
    searchInput.focus()
  }
}
</script>
