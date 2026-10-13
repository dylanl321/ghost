/**
 * Achievement Engine
 *
 * Evaluates badge rules against incoming events and tracks user progress.
 * The engine is a module-level singleton — one instance evaluates all badges.
 *
 * Rule types:
 * - event_once:    Fires on first occurrence of an event
 * - event_count:   Fires after N occurrences of an event
 * - unique_count:  Fires after N unique values of a payload field
 * - condition:     Fires when a custom condition checker returns true
 */

import type { AppEvent } from './useEventBus'
import type {
  BadgeDefinition,
  BadgeRule,
  SavedProgress,
  SyncProgressRequest
} from '#shared/types/achievements'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UserProgress {
  counts: Record<string, number>
  uniques: Record<string, Set<string>>
  seen: Set<string>
  awarded: Set<string>
  awardedAt: Record<string, string>
}

export type ConditionChecker = (event: AppEvent, progress: UserProgress) => boolean

// ---------------------------------------------------------------------------
// Module-level singleton state
// ---------------------------------------------------------------------------

let badges: BadgeDefinition[] = []
let progress: UserProgress = createEmptyProgress()
let onAwardCallback: ((badge: BadgeDefinition) => void) | null = null
const conditionCheckers = new Map<string, ConditionChecker>()
let initialized = false
let dirty = false

function createEmptyProgress(): UserProgress {
  return {
    counts: {},
    uniques: {},
    seen: new Set(),
    awarded: new Set(),
    awardedAt: {}
  }
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export function useAchievementEngine() {
  /** Initialize the engine with badge definitions and an award callback. */
  function init(
    badgeDefs: BadgeDefinition[],
    opts?: { onAward?: (badge: BadgeDefinition) => void }
  ) {
    badges = badgeDefs
    onAwardCallback = opts?.onAward ?? null
    initialized = true
  }

  /** Register a condition checker for `condition`-type badge rules. */
  function registerCondition(key: string, checker: ConditionChecker) {
    conditionCheckers.set(key, checker)
  }

  /** Load saved progress from the server (hydrates Sets from arrays). */
  function loadProgress(saved: SavedProgress) {
    progress = {
      counts: { ...saved.counts },
      uniques: Object.fromEntries(
        Object.entries(saved.uniques).map(([k, v]) => [k, new Set(v)])
      ),
      seen: new Set(saved.seen),
      // Retired badge definitions must not inflate totals or return during sync.
      awarded: new Set(saved.awarded.filter(id => badges.some(badge => badge.id === id))),
      awardedAt: Object.fromEntries(
        Object.entries(saved.awardedAt).filter(([id]) => badges.some(badge => badge.id === id))
      )
    }
    dirty = false
  }

  /** Get progress in a serializable form for API sync. */
  function getSerializableProgress(): SyncProgressRequest {
    return {
      counts: { ...progress.counts },
      uniques: Object.fromEntries(
        Object.entries(progress.uniques).map(([k, v]) => [k, [...v]])
      ),
      seen: [...progress.seen],
      awarded: [...progress.awarded],
      awardedAt: { ...progress.awardedAt }
    }
  }

  /** Evaluate all badge rules against an incoming event. Returns newly awarded badges. */
  function evaluate(event: AppEvent): BadgeDefinition[] {
    if (!initialized) return []

    const newlyAwarded: BadgeDefinition[] = []

    for (const badge of badges) {
      if (progress.awarded.has(badge.id)) continue

      const earned = checkRule(badge.rule, event)
      if (earned) {
        progress.awarded.add(badge.id)
        progress.awardedAt[badge.id] = new Date(event.timestamp).toISOString()
        dirty = true
        newlyAwarded.push(badge)
        onAwardCallback?.(badge)
      }
    }

    return newlyAwarded
  }

  function checkRule(rule: BadgeRule, event: AppEvent): boolean {
    switch (rule.type) {
      case 'event_once': {
        if (event.type !== rule.event) return false
        progress.seen.add(rule.event)
        dirty = true
        return true
      }

      case 'event_count': {
        if (event.type !== rule.event) return false
        const key = `count:${rule.event}`
        progress.counts[key] = (progress.counts[key] ?? 0) + 1
        dirty = true
        return progress.counts[key] >= rule.threshold
      }

      case 'unique_count': {
        if (event.type !== rule.event) return false
        const ukey = `unique:${rule.event}:${rule.field}`
        if (!progress.uniques[ukey]) progress.uniques[ukey] = new Set()
        const value = event.payload[rule.field]
        if (value !== null && value !== undefined) {
          progress.uniques[ukey].add(String(value))
          dirty = true
        }
        return progress.uniques[ukey].size >= rule.threshold
      }

      case 'condition': {
        const checker = conditionCheckers.get(rule.key)
        if (!checker) return false
        return checker(event, progress)
      }

      default:
        return false
    }
  }

  /** Check whether progress has changed since last load/sync. */
  function isDirty(): boolean {
    return dirty
  }

  /** Mark progress as clean (after successful sync). */
  function markClean() {
    dirty = false
  }

  /** Get the set of awarded badge IDs. */
  function getAwarded(): Set<string> {
    return progress.awarded
  }

  /** Get awarded-at timestamps. */
  function getAwardedAt(): Record<string, string> {
    return progress.awardedAt
  }

  /** Get current progress toward a badge rule (for progress bars). */
  function getRuleProgress(rule: BadgeRule): { current: number; target: number } | null {
    switch (rule.type) {
      case 'event_count': {
        const key = `count:${rule.event}`
        return { current: Math.min(progress.counts[key] ?? 0, rule.threshold), target: rule.threshold }
      }
      case 'unique_count': {
        const ukey = `unique:${rule.event}:${rule.field}`
        const size = progress.uniques[ukey]?.size ?? 0
        return { current: Math.min(size, rule.threshold), target: rule.threshold }
      }
      default:
        return null
    }
  }

  /** Check if the engine has been initialized. */
  function isInitialized(): boolean {
    return initialized
  }

  /** Reset engine state (for testing or cleanup). */
  function reset() {
    badges = []
    progress = createEmptyProgress()
    onAwardCallback = null
    conditionCheckers.clear()
    initialized = false
    dirty = false
  }

  return {
    init,
    registerCondition,
    loadProgress,
    getSerializableProgress,
    evaluate,
    isDirty,
    markClean,
    getAwarded,
    getAwardedAt,
    getRuleProgress,
    isInitialized,
    reset
  }
}
