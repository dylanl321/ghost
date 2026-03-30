/**
 * Notification Source Registry
 *
 * Every notification source in GHOST registers here so the admin dashboard
 * can enumerate sources, show health status, and surface historical activity.
 */

import type { NotificationCategory } from './notifications'

// ---------------------------------------------------------------------------
// Source registry types
// ---------------------------------------------------------------------------

export type SourceTriggerType = 'cron' | 'user-action' | 'admin-action'
export type SourceHealthStatus = 'healthy' | 'degraded' | 'stale' | 'unknown'

export interface NotificationSourceDefinition {
  /** Unique machine identifier — matches heartbeat site-config keys */
  id: string
  /** Human-readable name */
  name: string
  /** What this source does */
  description: string
  /** How it is triggered */
  triggerType: SourceTriggerType
  /** Which categories this source emits */
  categories: NotificationCategory[]
  /** Cron expression (display only, for cron sources) */
  cronExpression?: string
  /** Expected max interval in minutes between runs (for stale detection) */
  expectedIntervalMinutes?: number
  /** True if an external system handles email delivery for this source */
  handlesOwnEmail?: boolean
  /** Heroicon name for UI display */
  icon: string
}

// ---------------------------------------------------------------------------
// Heartbeat (persisted to site-config after each cron run)
// ---------------------------------------------------------------------------

export interface SourceHeartbeat {
  lastRun: string            // ISO timestamp
  status: 'success' | 'error'
  durationMs: number
  count?: number             // items processed in this run
  error?: string             // error message if status is 'error'
}

// ---------------------------------------------------------------------------
// Source health (returned by the admin API, combines registry + heartbeat + volume)
// ---------------------------------------------------------------------------

export interface SourceHealthInfo {
  source: NotificationSourceDefinition
  heartbeat: SourceHeartbeat | null
  healthStatus: SourceHealthStatus
  volume24h: number
  volume7d: number
  lastNotificationAt: string | null
}

// ---------------------------------------------------------------------------
// Unified activity feed item (merges GHOST notifications + external alert history)
// ---------------------------------------------------------------------------

export interface UnifiedActivityItem {
  id: string
  source: 'ghost-notification' | 'budget-alert-history'
  timestamp: string
  category: string
  severity: 'info' | 'warning' | 'critical'
  title: string
  body: string
  userId?: string
  metadata?: Record<string, any>
}

// ---------------------------------------------------------------------------
// Static source registry
// ---------------------------------------------------------------------------

export const NOTIFICATION_SOURCE_REGISTRY: NotificationSourceDefinition[] = [
  {
    id: 'budget-alert-notifier',
    name: 'Budget Alert Monitor',
    description: 'Polls the external budget alert table every 15 minutes and creates in-app notifications for threshold breaches, cost anomalies, and cost summaries.',
    triggerType: 'cron',
    categories: ['BUDGET_THRESHOLD', 'COST_ANOMALY', 'COST_SUMMARY'],
    cronExpression: '5,20,35,50 * * * *',
    expectedIntervalMinutes: 20,
    handlesOwnEmail: true,
    icon: 'i-heroicons-currency-dollar'
  },
  {
    id: 'report-scheduler',
    name: 'Scheduled Reports',
    description: 'Runs user-configured scheduled reports (daily, weekly, monthly, quarterly) and notifies the owner when complete or failed.',
    triggerType: 'cron',
    categories: ['REPORT_READY'],
    cronExpression: '* * * * *',
    expectedIntervalMinutes: 2,
    icon: 'i-heroicons-document-chart-bar'
  },
  {
    id: 'email-digest',
    name: 'Email Digest Delivery',
    description: 'Processes pending notification emails hourly, grouping them into digest emails based on user preferences.',
    triggerType: 'cron',
    categories: [],
    cronExpression: '15 * * * *',
    expectedIntervalMinutes: 65,
    icon: 'i-heroicons-envelope'
  },
  {
    id: 'strands-async-processor',
    name: 'AI Chat Completion',
    description: 'Notifies users when their async AI analysis query completes or encounters an error.',
    triggerType: 'user-action',
    categories: ['CHAT_COMPLETE'],
    icon: 'i-heroicons-chat-bubble-left-right'
  },
  {
    id: 'feedback-submission',
    name: 'Feedback Confirmation',
    description: 'Sends a confirmation notification when a user submits feedback (issue, feature request, or general feedback).',
    triggerType: 'user-action',
    categories: ['SYSTEM'],
    icon: 'i-heroicons-chat-bubble-bottom-center-text'
  },
  {
    id: 'broadcast-service',
    name: 'Admin Broadcasts',
    description: 'Fan-out notifications from admin broadcasts to targeted users (all users, by role, or specific user list).',
    triggerType: 'admin-action',
    categories: ['SYSTEM'],
    icon: 'i-heroicons-megaphone'
  }
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getSourceById(id: string): NotificationSourceDefinition | undefined {
  return NOTIFICATION_SOURCE_REGISTRY.find(s => s.id === id)
}

export function getSourcesByTriggerType(type: SourceTriggerType): NotificationSourceDefinition[] {
  return NOTIFICATION_SOURCE_REGISTRY.filter(s => s.triggerType === type)
}
