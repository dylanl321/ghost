/**
 * Composable that encapsulates the guided tour logic for the Account Details page.
 * Handles dual-storage verification (localStorage + API preferences),
 * admin resets, and DOM-ready retry logic.
 */
import { startAccountTour } from '~/components/tutorial/AccountTour'

const ACCOUNT_TOUR_SEEN_KEY = 'ghost-account-tour-seen'

function hasSeenAccountTourLocally(): boolean {
  if (!import.meta.client) return false
  try {
    return localStorage.getItem(ACCOUNT_TOUR_SEEN_KEY) === 'true'
  } catch {
    return true // Fail closed - assume seen if localStorage unavailable
  }
}

function markAccountTourSeenLocally(): void {
  if (!import.meta.client) return
  try {
    localStorage.setItem(ACCOUNT_TOUR_SEEN_KEY, 'true')
  } catch {}
}

function clearAccountTourSeenLocally(): void {
  if (!import.meta.client) return
  try {
    localStorage.removeItem(ACCOUNT_TOUR_SEEN_KEY)
  } catch {}
}

export function useAccountTour() {
  const { getPreference, setPreference, load: loadPreferences, authError } = useUserPreferences()
  const route = useRoute()

  const startedThisSession = ref(false)
  const lastResetTimestamp = ref<string | null>(null)

  /** Manually start the tour (e.g. from a button click). */
  async function startTour() {
    const pref = getPreference<any>('accountTour', {}) || {}
    const resetTimestamp = pref?.resetByAdminAt

    const wasReset = resetTimestamp && resetTimestamp !== lastResetTimestamp.value
    if (startedThisSession.value && !wasReset) return

    if (wasReset) {
      lastResetTimestamp.value = resetTimestamp
      clearAccountTourSeenLocally()
    }
    startedThisSession.value = true
    markAccountTourSeenLocally()

    const startAt = Number(pref?.lastStep || 0)

    try {
      await startAccountTour({
        startAtStep: isNaN(startAt) ? 0 : startAt,
        onComplete: async () => {
          await setPreference('accountTour', {
            ...(getPreference<any>('accountTour', {}) || {}),
            completed: true,
            completedAt: new Date().toISOString(),
          })
        },
        onExit: async (currentStep) => {
          await setPreference('accountTour', {
            ...(getPreference<any>('accountTour', {}) || {}),
            lastStep: currentStep,
            startedAt: (getPreference<any>('accountTour', {}) || {}).startedAt || new Date().toISOString(),
          })
        },
      })
    } catch (error: any) {
      console.error('Failed to start account tour:', error)
      const toast = useToast()
      toast.add({
        title: 'Tour Error',
        description: error.message || 'Failed to start the guided tour. Please try again.',
        color: 'red',
        icon: 'i-heroicons-exclamation-triangle',
      })
      startedThisSession.value = false
    }
  }

  /**
   * Check whether the tour should auto-start and trigger it if so.
   * Call this from onMounted after preferences are loaded.
   */
  async function maybeAutoStart() {
    await loadPreferences(true)

    const tourPref = getPreference<any>('accountTour', {}) || {}
    const forceStart = route.query.tour === '1'
    const wasReset = tourPref?.resetByAdminAt && tourPref?.resetByAdminAt !== lastResetTimestamp.value

    // Dual-storage verification
    const seenLocally = hasSeenAccountTourLocally()
    const seenInApi = tourPref?.startedAt || tourPref?.completed

    // Sync localStorage from API for existing users (backwards compatibility)
    if (seenInApi && !seenLocally) {
      markAccountTourSeenLocally()
    }

    const isGenuineFirstTime = !seenLocally && !seenInApi && !authError.value

    if (wasReset) {
      clearAccountTourSeenLocally()
    }

    const shouldAutoStart = (forceStart || wasReset || isGenuineFirstTime) && !startedThisSession.value
    if (!shouldAutoStart) return

    // Wait for DOM elements with retry
    await nextTick()
    let attempts = 0
    const tryStart = () => {
      if (document.querySelector('[data-tour="account-header"]')) {
        startTour()
      } else if (attempts < 5) {
        attempts++
        setTimeout(tryStart, 300)
      }
    }
    setTimeout(tryStart, 500)
  }

  return { startTour, maybeAutoStart }
}
