/**
 * Achievement / Badge System Types
 *
 * Shared types for the achievement engine, badge definitions, and progress persistence.
 * Used by both client (useAchievements composable) and server (achievement-store).
 */

// ---------------------------------------------------------------------------
// Badge rule types — declarative rules evaluated by the client-side engine
// ---------------------------------------------------------------------------

export type BadgeRuleType = 'event_once' | 'event_count' | 'unique_count' | 'condition'

export interface BadgeRuleEventOnce {
  type: 'event_once'
  event: string
}

export interface BadgeRuleEventCount {
  type: 'event_count'
  event: string
  threshold: number
}

export interface BadgeRuleUniqueCount {
  type: 'unique_count'
  event: string
  field: string
  threshold: number
}

export interface BadgeRuleCondition {
  type: 'condition'
  key: string
}

export type BadgeRule =
  | BadgeRuleEventOnce
  | BadgeRuleEventCount
  | BadgeRuleUniqueCount
  | BadgeRuleCondition

// ---------------------------------------------------------------------------
// Badge definition — mirrors badges.yaml structure
// ---------------------------------------------------------------------------

export type BadgeCategory = 'discovery' | 'hidden' | 'meta'

export interface BadgeDefinition {
  id: string
  name: string
  description: string
  hint: string
  category: BadgeCategory
  hidden: boolean
  icon: string
  color: string
  rule: BadgeRule
}

// ---------------------------------------------------------------------------
// User progress — tracked by the client-side engine, persisted to DynamoDB
// ---------------------------------------------------------------------------

export interface SavedProgress {
  userId: string
  counts: Record<string, number>
  uniques: Record<string, string[]>
  seen: string[]
  awarded: string[]
  awardedAt: Record<string, string>
  updatedAt: string
  createdAt: string
}

export interface SyncProgressRequest {
  counts: Record<string, number>
  uniques: Record<string, string[]>
  seen: string[]
  awarded: string[]
  awardedAt: Record<string, string>
}

// ---------------------------------------------------------------------------
// API types
// ---------------------------------------------------------------------------

export interface AwardBadgeRequest {
  badgeId: string
  badgeName: string
  badgeDescription: string
  badgeIcon: string
  badgeColor: string
}
