/**
 * Unified Notification System Types
 *
 * Shared types for the user notification inbox, routing, and delivery.
 * Used by both server (notification-service) and client (useNotifications composable).
 */

// ---------------------------------------------------------------------------
// Notification categories — aligned with NotificationPreferences.vue toggles
// ---------------------------------------------------------------------------

export type NotificationCategory =
  | 'BUDGET_THRESHOLD'
  | 'COST_ANOMALY'
  | 'COST_SUMMARY'
  | 'SECURITY_CRITICAL'
  | 'COMPLIANCE'
  | 'SECURITY_SCORE'
  | 'PIPELINE_FAILURE'
  | 'DEPLOYMENT'
  | 'REPORT_READY'
  | 'CHAT_COMPLETE'
  | 'SYSTEM'

export type NotificationSeverity = 'info' | 'warning' | 'critical'
export type NotificationStatus = 'unread' | 'read' | 'archived'

// ---------------------------------------------------------------------------
// Core notification record stored in DynamoDB
// ---------------------------------------------------------------------------

export interface UserNotification {
  userId: string
  notificationId: string
  category: NotificationCategory
  title: string
  body: string
  severity: NotificationSeverity
  status: NotificationStatus
  actionUrl?: string
  actionLabel?: string
  metadata?: Record<string, any>
  dedupeKey?: string
  emailSent: boolean
  emailPending?: string // "PENDING" when queued for digest — sparse GSI key
  createdAt: string
  ttl: number
}

// ---------------------------------------------------------------------------
// API request/response types
// ---------------------------------------------------------------------------

export interface NotificationListParams {
  category?: NotificationCategory
  status?: NotificationStatus
  limit?: number
  lastKey?: string
}

export interface NotificationListResponse {
  notifications: UserNotification[]
  nextKey: string | null
  hasMore: boolean
}

export interface UnreadCountResponse {
  count: number
}

// ---------------------------------------------------------------------------
// Send notification options (server-side)
// ---------------------------------------------------------------------------

export interface SendUserNotificationOptions {
  userId: string
  category: NotificationCategory
  title: string
  body: string
  severity: NotificationSeverity
  actionUrl?: string
  actionLabel?: string
  metadata?: Record<string, any>
  dedupeKey?: string
  /** Skip all GHOST email routing (immediate + digest). Use when an external system handles emails. */
  skipEmail?: boolean
}

// ---------------------------------------------------------------------------
// Category → preference key mapping
// ---------------------------------------------------------------------------

export const CATEGORY_PREFERENCE_MAP: Record<NotificationCategory, string | null> = {
  BUDGET_THRESHOLD: null, // Always delivered — email handled by external budget alert Lambda
  COST_ANOMALY: null,     // Always delivered — email handled by external budget alert Lambda
  COST_SUMMARY: null,     // Always delivered — email handled by external budget alert Lambda
  SECURITY_CRITICAL: 'criticalSecurityFindings',
  COMPLIANCE: 'complianceViolations',
  SECURITY_SCORE: 'securityScoreChanges',
  PIPELINE_FAILURE: 'pipelineFailures',
  DEPLOYMENT: 'deploymentCompletions',
  REPORT_READY: null,   // Always delivered (user requested the report)
  CHAT_COMPLETE: null,   // Always delivered (user started the query)
  SYSTEM: null           // Always delivered (admin announcements)
}

// ---------------------------------------------------------------------------
// Category display metadata (for UI rendering)
// ---------------------------------------------------------------------------

export interface CategoryDisplayInfo {
  label: string
  icon: string
  color: string
}

export const CATEGORY_DISPLAY: Record<NotificationCategory, CategoryDisplayInfo> = {
  BUDGET_THRESHOLD: { label: 'Budget Alert', icon: 'i-heroicons-currency-dollar', color: 'yellow' },
  COST_ANOMALY: { label: 'Cost Anomaly', icon: 'i-heroicons-exclamation-triangle', color: 'orange' },
  COST_SUMMARY: { label: 'Cost Summary', icon: 'i-heroicons-chart-bar', color: 'blue' },
  SECURITY_CRITICAL: { label: 'Security', icon: 'i-heroicons-shield-exclamation', color: 'red' },
  COMPLIANCE: { label: 'Compliance', icon: 'i-heroicons-clipboard-document-check', color: 'purple' },
  SECURITY_SCORE: { label: 'Security Score', icon: 'i-heroicons-chart-bar-square', color: 'indigo' },
  PIPELINE_FAILURE: { label: 'Pipeline', icon: 'i-heroicons-cog-6-tooth', color: 'red' },
  DEPLOYMENT: { label: 'Deployment', icon: 'i-heroicons-rocket-launch', color: 'green' },
  REPORT_READY: { label: 'Report', icon: 'i-heroicons-document-chart-bar', color: 'blue' },
  CHAT_COMPLETE: { label: 'AI Chat', icon: 'i-heroicons-chat-bubble-left-right', color: 'violet' },
  SYSTEM: { label: 'System', icon: 'i-heroicons-megaphone', color: 'gray' }
}

// ---------------------------------------------------------------------------
// Filter groups for the notification center UI
// ---------------------------------------------------------------------------

export type NotificationFilterGroup = 'all' | 'unread' | 'budget' | 'security' | 'pipeline' | 'system'

export const FILTER_GROUP_CATEGORIES: Record<NotificationFilterGroup, NotificationCategory[] | null> = {
  all: null, // Show everything
  unread: null, // Filter by status, not category
  budget: ['BUDGET_THRESHOLD', 'COST_ANOMALY', 'COST_SUMMARY'],
  security: ['SECURITY_CRITICAL', 'COMPLIANCE', 'SECURITY_SCORE'],
  pipeline: ['PIPELINE_FAILURE', 'DEPLOYMENT'],
  system: ['REPORT_READY', 'CHAT_COMPLETE', 'SYSTEM']
}

// ---------------------------------------------------------------------------
// Broadcast notification (admin → users)
// ---------------------------------------------------------------------------

export type BroadcastStatus = 'pending' | 'in-progress' | 'complete' | 'scheduled'
export type BroadcastTarget = 'all' | 'role' | 'list'

export interface BroadcastNotification {
  broadcastId: string
  createdBy: string
  title: string
  body: string
  category: NotificationCategory
  severity: NotificationSeverity
  targetAudience: BroadcastTarget
  targetRole?: string
  targetUserIds?: string[]
  status: BroadcastStatus
  scheduledAt?: string
  deliveredCount: number
  totalCount: number
  createdAt: string
  ttl: number
}

export interface CreateBroadcastOptions {
  title: string
  body: string
  category?: NotificationCategory
  severity?: NotificationSeverity
  targetAudience: BroadcastTarget
  targetRole?: string
  targetUserIds?: string[]
}

// ---------------------------------------------------------------------------
// Admin analytics types
// ---------------------------------------------------------------------------

export interface NotificationStats {
  totalNotifications: number
  byCategory: Partial<Record<NotificationCategory, number>>
  byDay: Array<{ date: string; count: number }>
  emailsSent: number
  digestsSent: number
  activeUsers: number
  broadcastCount: number
}

export interface AdminNotificationListParams extends NotificationListParams {
  userId?: string
  search?: string
  dateFrom?: string
  dateTo?: string
}

// ---------------------------------------------------------------------------
// Digest preferences (extends notification preferences)
// ---------------------------------------------------------------------------

export interface DigestPreferences {
  emailDigestEnabled: boolean
  emailDigestFrequency: 'daily' | 'weekly'
  emailDigestTime: number    // Hour 0-23 in user's timezone
  emailDigestDay?: string    // For weekly: 'monday'-'sunday'
}

// ---------------------------------------------------------------------------
// Mute configuration
// ---------------------------------------------------------------------------

export type MuteDuration = '1h' | '4h' | '24h'
