/**
 * Achievement Condition Checkers
 *
 * Custom condition functions for badge rules that can't be expressed
 * as simple event counts. Each checker is a pure function that receives
 * the current event and user progress, returning true if the condition is met.
 */

import type { ConditionChecker } from '~/composables/useAchievementEngine'
import { BADGE_DEFINITIONS, NON_HIDDEN_BADGE_IDS, HIDDEN_BADGE_IDS } from './badgeDefinitions'

// Sliding window for speed-run tracking
const recentPageTimestamps: number[] = []

// Session-scoped export format tracking for polyglot badge
const sessionExportFormats = new Set<string>()

// Session-scoped tracking for cross-feature badges
const sessionAccountFeatures = new Map<string, Set<string>>() // accountId → Set<'costs'|'security'|'resources'>
const sessionEnvironments = new Set<string>() // 'commercial' | 'govcloud'
const sessionProfileViews = { count: 0, lastReset: Date.now() }
const recentRefreshTimestamps: number[] = []
let currentPage = ''

// Login streak tracking (persisted via localStorage)
const LOGIN_STREAK_KEY = 'ghost-login-streak'
interface LoginStreak { dates: string[]; lastLogin: string }

function getLoginStreak(): LoginStreak {
  if (typeof localStorage === 'undefined') return { dates: [], lastLogin: '' }
  try {
    const raw = localStorage.getItem(LOGIN_STREAK_KEY)
    return raw ? JSON.parse(raw) : { dates: [], lastLogin: '' }
  } catch { return { dates: [], lastLogin: '' } }
}

function recordLoginDay(): LoginStreak {
  const streak = getLoginStreak()
  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  if (streak.lastLogin === today) return streak // already recorded today

  // Check if yesterday was recorded — if not, reset streak
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
  if (streak.dates.length > 0 && streak.lastLogin !== yesterday) {
    streak.dates = [today]
  } else {
    streak.dates.push(today)
    // Keep only last 30 days to avoid unbounded growth
    if (streak.dates.length > 30) streak.dates = streak.dates.slice(-30)
  }
  streak.lastLogin = today
  try { localStorage.setItem(LOGIN_STREAK_KEY, JSON.stringify(streak)) } catch {}
  return streak
}

/**
 * All condition checkers keyed by their condition key from badges.yaml.
 * The achievement engine registers these during initialization.
 */
export const CONDITION_CHECKERS: Record<string, ConditionChecker> = {
  // ── Phase 1: Simple conditions ──────────────────────────────────────────

  /** Night Owl: used between midnight and 5am */
  used_between_midnight_and_5am: (event) => {
    const hour = new Date(event.timestamp).getHours()
    return hour >= 0 && hour < 5
  },

  /** Mobile Scout: accessed from a mobile device */
  mobile_user_agent: () => {
    if (typeof navigator === 'undefined') return false
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  },

  /** Completionist: earned every non-hidden badge */
  all_non_hidden_badges_earned: (_event, progress) => {
    // Exclude 'completionist' itself to avoid circular dependency
    const required = NON_HIDDEN_BADGE_IDS.filter(id => id !== 'completionist')
    return required.every(id => progress.awarded.has(id))
  },

  /** ???: earned 5 hidden badges */
  five_hidden_badges_earned: (_event, progress) => {
    const hiddenEarned = HIDDEN_BADGE_IDS.filter(id => progress.awarded.has(id))
    return hiddenEarned.length >= 5
  },

  // ── Phase 2: More complex conditions ────────────────────────────────────

  /** Speed Run: navigated to 10 different pages within 60 seconds */
  visited_10_pages_in_60_seconds: (event) => {
    if (event.type !== 'page.visited') return false
    const now = event.timestamp
    recentPageTimestamps.push(now)
    // Keep only last 60 seconds
    while (recentPageTimestamps.length > 0 && now - recentPageTimestamps[0] > 60_000) {
      recentPageTimestamps.shift()
    }
    return recentPageTimestamps.length >= 10
  },

  /** Polyglot: exported in CSV, JSON, and PDF in the same session */
  exported_all_formats_in_session: (event) => {
    if (event.type !== 'export.completed') return false
    const format = event.payload.format
    if (format) sessionExportFormats.add(String(format).toLowerCase())
    return sessionExportFormats.has('csv') &&
           sessionExportFormats.has('xlsx') &&
           sessionExportFormats.has('pdf')
  },

  /** Time Traveler: date range exceeding 1 year */
  date_range_exceeds_one_year: (event) => {
    if (event.type !== 'date_range.selected') return false
    const { startDate, endDate } = event.payload
    if (!startDate || !endDate) return false
    const start = new Date(startDate).getTime()
    const end = new Date(endDate).getTime()
    const oneYear = 365 * 24 * 60 * 60 * 1000
    return (end - start) > oneYear
  },

  // ── Data-aware conditions ─────────────────────────────────────────────

  /** Penny Pincher: viewed account where spend dropped 20%+ MoM */
  cost_decrease_20_percent: (event) => {
    if (event.type !== 'cost.trend.detected') return false
    return (event.payload.changePercent ?? 0) <= -20
  },

  // ── Cross-feature conditions ────────────────────────────────────────

  /** Full Physical: viewed costs, security, and resources for same account in session */
  full_account_physical: (event) => {
    if (event.type !== 'account.feature_viewed') return false
    const { accountId, feature } = event.payload
    if (!accountId || !feature) return false
    if (!sessionAccountFeatures.has(accountId)) {
      sessionAccountFeatures.set(accountId, new Set())
    }
    sessionAccountFeatures.get(accountId)!.add(feature)
    const features = sessionAccountFeatures.get(accountId)!
    return features.has('costs') && features.has('security') && features.has('resources')
  },

  /** Bridge Builder: viewed accounts in both Commercial and GovCloud */
  viewed_both_environments: (event) => {
    if (event.type !== 'account.viewed') return false
    const env = event.payload.environment
    if (env) sessionEnvironments.add(env)
    return sessionEnvironments.has('commercial') && sessionEnvironments.has('govcloud')
  },

  // ── Hidden easter egg conditions ────────────────────────────────────

  /** Inception: earned a badge while on the badges page */
  badge_earned_on_badges_page: (event) => {
    // This fires on any event — check if we're on the achievements page
    // by tracking the last page.visited
    if (event.type === 'page.visited') {
      currentPage = String(event.payload.page ?? '')
      return false // page visit itself doesn't earn this
    }
    // Any other event that causes a badge to fire while on the profile achievements tab
    return currentPage.includes('/profile') || currentPage.includes('tab=achievements')
  },

  /** Mirror Mirror: viewed profile 3 times in one session */
  viewed_profile_3_times_in_session: (event) => {
    if (event.type !== 'page.visited') return false
    const page = String(event.payload.page ?? '')
    if (!page.includes('/profile')) return false
    // Reset counter if session is >30min old
    if (Date.now() - sessionProfileViews.lastReset > 30 * 60 * 1000) {
      sessionProfileViews.count = 0
      sessionProfileViews.lastReset = Date.now()
    }
    sessionProfileViews.count++
    return sessionProfileViews.count >= 3
  },

  /** Refresh Addict: refreshed same page 5 times in 60 seconds */
  refreshed_5_times_in_60_seconds: (event) => {
    if (event.type !== 'page.visited') return false
    const now = event.timestamp
    recentRefreshTimestamps.push(now)
    while (recentRefreshTimestamps.length > 0 && now - recentRefreshTimestamps[0] > 60_000) {
      recentRefreshTimestamps.shift()
    }
    // Count visits to the same page (current page was already set by speed-run tracker)
    const samePage = recentRefreshTimestamps.length
    return samePage >= 5
  },

  // ── Login streak conditions ─────────────────────────────────────────

  /** Daily Driver: logged in 5 consecutive days */
  logged_in_5_consecutive_days: (event) => {
    if (event.type !== 'session.started') return false
    const streak = recordLoginDay()
    return streak.dates.length >= 5
  },

  /** Iron Streak: logged in 7 consecutive days */
  logged_in_7_consecutive_days: (event) => {
    if (event.type !== 'session.started') return false
    const streak = recordLoginDay()
    return streak.dates.length >= 7
  },

  // ── Existing placeholder conditions ─────────────────────────────────

  ai_non_work_question: (event) => {
    if (event.type !== 'ai.chat.sent') return false
    const msg = String(event.payload.message ?? '')
    const nonWorkPatterns = [
      /meaning of life/i, /tell me a joke/i, /who are you/i,
      /what('s| is) your (name|favorite)/i, /can you (sing|rap|dance)/i,
      /how are you/i, /are you sentient/i, /what is love/i
    ]
    return nonWorkPatterns.some(p => p.test(msg))
  },

  drilldown_depth_4_plus: (event) => {
    if (event.type !== 'drilldown.entered') return false
    return (event.payload.level ?? 0) >= 4
  },

  viewed_data_older_than_12_months: (event) => {
    if (event.type !== 'date_range.selected') return false
    const { startDate } = event.payload
    if (!startDate) return false
    const twelveMonthsAgo = Date.now() - (365 * 24 * 60 * 60 * 1000)
    return new Date(startDate).getTime() < twelveMonthsAgo
  },

  scrolled_table_to_bottom: (event) => {
    if (event.type !== 'table.scrolled') return false
    return event.payload.reachedBottom === true
  },

  undo_within_3_seconds: (event) => {
    if (event.type !== 'action.undone') return false
    return (event.payload.elapsed_ms ?? Infinity) <= 3000
  },

  inactive_30_days_then_login: (event) => {
    if (event.type !== 'session.started') return false
    const lastActive = event.payload.previousSessionTimestamp
    if (!lastActive) return false
    const daysSince = (event.timestamp - lastActive) / (1000 * 60 * 60 * 24)
    return daysSince >= 30
  },

  feature_used_within_24h: (event) => {
    if (event.type !== 'feature.used') return false
    const releasedAt = event.payload.releasedAt
    if (!releasedAt) return false
    const hoursSince = (event.timestamp - new Date(releasedAt).getTime()) / (1000 * 60 * 60)
    return hoursSince <= 24
  }
}
