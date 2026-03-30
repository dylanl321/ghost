/**
 * Composable to manage the cost dashboard guided tour.
 * Handles tour lifecycle: detection of first-time users, admin resets,
 * localStorage + API preference dual-storage, and element readiness checks.
 */
import { ref } from 'vue'
import { startCostTour } from '~/components/tutorial/CostTour'

const logger = createLogger('CostTour')

const COST_TOUR_SEEN_KEY = 'ghost-cost-tour-seen'

export function useCostTour() {
  const { getPreference, setPreference, load: loadPreferences, authError } = useUserPreferences()
  const tourStartedThisSession = ref(false)
  const lastResetTimestamp = ref<string | null>(null)

  function hasSeenTourLocally(): boolean {
    if (!import.meta.client) return false
    try {
      return localStorage.getItem(COST_TOUR_SEEN_KEY) === 'true'
    } catch {
      return true // Fail closed
    }
  }

  function markTourSeenLocally(): void {
    if (!import.meta.client) return
    try { localStorage.setItem(COST_TOUR_SEEN_KEY, 'true') } catch {}
  }

  function clearTourSeenLocally(): void {
    if (!import.meta.client) return
    try { localStorage.removeItem(COST_TOUR_SEEN_KEY) } catch {}
  }

  function checkTourElements(): boolean {
    const selectors = [
      '[data-tour="costs-header"]',
      '[data-tour="account-selector"]',
      '[data-tour="costs-summary"]',
      '[data-tour="costs-chart"]',
      '[data-tour="chart-tabs"]',
      '[data-tour="costs-help"]'
    ]
    return selectors.every(sel => document.querySelector(sel))
  }

  async function handleStartTour(isManualStart = false) {
    const pref = getPreference<any>('costTour', {}) || {}
    const resetTimestamp = pref?.resetByAdminAt
    const wasReset = resetTimestamp && resetTimestamp !== lastResetTimestamp.value

    if (!isManualStart && tourStartedThisSession.value && !wasReset) return

    if (wasReset) {
      lastResetTimestamp.value = resetTimestamp
      clearTourSeenLocally()
    }
    tourStartedThisSession.value = true
    markTourSeenLocally()

    // Wait for DOM elements if manual start
    if (isManualStart && !checkTourElements()) {
      const toast = useToast()
      toast.add({
        title: 'Please Wait',
        description: 'Waiting for page to finish loading...',
        color: 'blue',
        icon: 'i-heroicons-clock',
        timeout: 2000
      })

      let attempts = 0
      while (attempts < 10 && !checkTourElements()) {
        await new Promise(resolve => setTimeout(resolve, 500))
        attempts++
      }

      if (!checkTourElements()) {
        toast.add({
          title: 'Tour Unavailable',
          description: 'Please select accounts and wait for data to load before starting the tour.',
          color: 'amber',
          icon: 'i-heroicons-exclamation-triangle'
        })
        tourStartedThisSession.value = false
        return
      }
    }

    const startAt = isManualStart ? 0 : Number(pref?.lastStep || 0)

    try {
      await startCostTour({
        startAtStep: isNaN(startAt) ? 0 : startAt,
        onComplete: async () => {
          await setPreference('costTour', {
            ...(getPreference<any>('costTour', {}) || {}),
            completed: true,
            completedAt: new Date().toISOString()
          })
        },
        onExit: async (currentStep) => {
          await setPreference('costTour', {
            ...(getPreference<any>('costTour', {}) || {}),
            lastStep: currentStep,
            startedAt: (getPreference<any>('costTour', {}) || {}).startedAt || new Date().toISOString()
          })
        }
      })
    } catch (error: any) {
      logger.error('Failed to start tour:', error)
      const toast = useToast()
      toast.add({
        title: 'Tour Error',
        description: error.message || 'Failed to start the guided tour. Please try again.',
        color: 'red',
        icon: 'i-heroicons-exclamation-triangle'
      })
      tourStartedThisSession.value = false
    }
  }

  /** Called from onMounted to auto-start tour for first-time users or admin resets */
  async function initTourOnMount() {
    await loadPreferences(true)

    const tourPref = getPreference<any>('costTour', {}) || {}
    const forceStart = useRoute().query.tour === '1'
    const wasReset = tourPref?.resetByAdminAt && tourPref?.resetByAdminAt !== lastResetTimestamp.value

    const seenLocally = hasSeenTourLocally()
    const seenInApi = tourPref?.startedAt || tourPref?.completed

    // Sync localStorage from API for backwards compatibility
    if (seenInApi && !seenLocally) markTourSeenLocally()

    const isGenuineFirstTime = !seenLocally && !seenInApi && !authError.value

    if (wasReset) clearTourSeenLocally()

    const shouldAutoStart = (forceStart || wasReset || isGenuineFirstTime) && !tourStartedThisSession.value

    if (shouldAutoStart) {
      await nextTick()
      let attempts = 0
      const tryStart = () => {
        if (checkTourElements()) {
          handleStartTour()
        } else if (attempts < 10) {
          attempts++
          setTimeout(tryStart, 500)
        }
      }
      setTimeout(tryStart, 500)
    }
  }

  return {
    handleStartTour,
    initTourOnMount
  }
}
