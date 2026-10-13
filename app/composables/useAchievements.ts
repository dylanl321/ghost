/**
 * High-Level Achievements Composable
 *
 * Orchestrates the event bus, achievement engine, persistence, and notifications.
 * This is the primary entry point for UI components and the bootstrap plugin.
 *
 * Usage:
 *   const { badges, earnedBadges, earnedCount, totalCount } = useAchievements()
 */

import { BADGE_DEFINITIONS } from '~/config/badgeDefinitions'
import { CONDITION_CHECKERS } from '~/config/achievementConditions'
import type { BadgeDefinition, SavedProgress, SyncProgressRequest } from '#shared/types/achievements'

const logger = createLogger('Achievements')

// ---------------------------------------------------------------------------
// Module-level singleton state
// ---------------------------------------------------------------------------

const initialized = ref(false)
const loading = ref(false)
const awarded = ref<Set<string>>(new Set())
const awardedAt = ref<Record<string, string>>({})
let syncTimer: ReturnType<typeof setTimeout> | null = null
let pendingSync = false

const SYNC_DEBOUNCE_MS = 30_000 // Sync every 30s if dirty
const LOCAL_STORAGE_KEY = 'ghost-achievement-progress'

// ---------------------------------------------------------------------------
// Composable
// ---------------------------------------------------------------------------

export function useAchievements() {
  const engine = useAchievementEngine()
  const { onAny } = useEventBus()
  const toast = useToast()

  // ── Computed badge state for UI ──────────────────────────────────────

  const badges = computed<BadgeDefinition[]>(() => BADGE_DEFINITIONS)

  const earnedBadges = computed(() =>
    BADGE_DEFINITIONS.filter(b => awarded.value.has(b.id))
  )

  const unearnedBadges = computed(() =>
    BADGE_DEFINITIONS.filter(b => !awarded.value.has(b.id) && !b.hidden)
  )

  const earnedCount = computed(() => awarded.value.size)
  const totalCount = computed(() => BADGE_DEFINITIONS.filter(b => !b.hidden).length)

  // ── Badge award handler ──────────────────────────────────────────────

  function onBadgeAwarded(badge: BadgeDefinition) {
    // Update reactive state
    awarded.value = new Set([...awarded.value, badge.id])
    awardedAt.value = { ...awardedAt.value, ...engine.getAwardedAt() }

    // Instant toast for delight
    toast.add({
      title: `Badge Earned: ${badge.name}`,
      description: badge.description,
      icon: 'i-heroicons-trophy',
      color: 'yellow',
      timeout: 5000
    })

    // Fire-and-forget: record award + send notification via server
    $fetch('/api/achievements/award', {
      method: 'POST',
      body: {
        badgeId: badge.id,
        badgeName: badge.name,
        badgeDescription: badge.description,
        badgeIcon: badge.icon,
        badgeColor: badge.color
      }
    }).catch(err => logger.error('Failed to record badge award for', badge.id, ':', err))

    // Save to localStorage immediately
    saveToLocalStorage()

    // Schedule server sync
    scheduleSyncIfDirty()
  }

  // ── Initialization ───────────────────────────────────────────────────

  async function initialize() {
    if (initialized.value) return
    loading.value = true

    try {
      // Init engine with badge definitions and award callback
      engine.init(BADGE_DEFINITIONS, { onAward: onBadgeAwarded })

      // Register condition checkers
      for (const [key, checker] of Object.entries(CONDITION_CHECKERS)) {
        engine.registerCondition(key, checker)
      }

      // Load from localStorage first for instant hydration
      const cached = loadFromLocalStorage()
      if (cached) {
        engine.loadProgress(cached)
        awarded.value = new Set(cached.awarded.filter(id => BADGE_DEFINITIONS.some(badge => badge.id === id)))
        awardedAt.value = { ...cached.awardedAt }
      }

      // Then fetch from server (source of truth) in background
      try {
        const response = await $fetch<{ success: boolean; data: SavedProgress }>(
          '/api/achievements/progress'
        )
        if (response.success && response.data) {
          engine.loadProgress(response.data)
          awarded.value = new Set(response.data.awarded.filter(id => BADGE_DEFINITIONS.some(badge => badge.id === id)))
          awardedAt.value = { ...response.data.awardedAt }
          saveToLocalStorage()
        }
      } catch (err) {
        logger.warn('Failed to load progress from server, using cache:', err)
      }

      // Subscribe to all events from the bus
      onAny((event) => {
        const newBadges = engine.evaluate(event)
        if (newBadges.length > 0) {
          scheduleSyncIfDirty()
        }
      })

      // Sync on page unload
      if (typeof window !== 'undefined') {
        window.addEventListener('beforeunload', syncOnUnload)
      }

      initialized.value = true
    } finally {
      loading.value = false
    }
  }

  // ── Persistence helpers ──────────────────────────────────────────────

  function saveToLocalStorage() {
    try {
      const progress = engine.getSerializableProgress()
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(progress))
    } catch {
      // localStorage may be unavailable
    }
  }

  function loadFromLocalStorage(): SavedProgress | null {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY)
      if (!raw) return null
      return JSON.parse(raw)
    } catch {
      return null
    }
  }

  function scheduleSyncIfDirty() {
    if (!engine.isDirty() || pendingSync) return
    pendingSync = true

    if (syncTimer) clearTimeout(syncTimer)
    syncTimer = setTimeout(async () => {
      await syncToServer()
      pendingSync = false
    }, SYNC_DEBOUNCE_MS)
  }

  async function syncToServer() {
    if (!engine.isDirty()) return

    try {
      const progress = engine.getSerializableProgress()
      await $fetch('/api/achievements/progress', {
        method: 'POST',
        body: progress
      })
      engine.markClean()
      saveToLocalStorage()
    } catch (err) {
      logger.warn('Failed to sync achievement progress:', err)
    }
  }

  function syncOnUnload() {
    if (!engine.isDirty()) return

    try {
      const progress = engine.getSerializableProgress()
      const blob = new Blob(
        [JSON.stringify(progress)],
        { type: 'application/json' }
      )
      navigator.sendBeacon('/api/achievements/progress', blob)
      saveToLocalStorage()
    } catch {
      // Best-effort on unload
    }
  }

  // ── Public API ───────────────────────────────────────────────────────

  /** Get the ISO timestamp when a badge was earned, or undefined. */
  function getBadgeAwardedAt(badgeId: string): string | undefined {
    return awardedAt.value[badgeId]
  }

  /** Check if a specific badge has been earned. */
  function isBadgeEarned(badgeId: string): boolean {
    return awarded.value.has(badgeId)
  }

  /** Get progress toward a count-based badge: { current, target } or null for non-count badges. */
  function getBadgeProgress(badgeId: string): { current: number; target: number } | null {
    const badge = BADGE_DEFINITIONS.find(b => b.id === badgeId)
    if (!badge) return null
    return engine.getRuleProgress(badge.rule)
  }

  return {
    // State
    badges,
    earnedBadges,
    unearnedBadges,
    earnedCount,
    totalCount,
    loading: readonly(loading),
    initialized: readonly(initialized),

    // Actions
    initialize,
    getBadgeAwardedAt,
    isBadgeEarned,
    getBadgeProgress
  }
}
