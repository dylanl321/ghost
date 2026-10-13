# Notification System

Developer and AI context guide for the GHOST notification system. Covers architecture, types, API endpoints, event sources, and usage patterns.

## Architecture Overview

The notification system provides multi-channel delivery: an **in-app inbox** (DynamoDB-backed), **real-time push** (Server-Sent Events), and **email** (immediate for critical alerts, hourly digest for others). An admin panel provides broadcast, configuration, and analytics capabilities.

### Data Flow

```
Event Source (report, chat, budget alert, etc.)
  │
  ▼
sendUserNotification()              ← server/utils/notification-service.ts
  │
  ├─► DynamoDB (user-notifications table)     ← persistent inbox
  ├─► SSE push (notification-emitter)         ← instant delivery to connected clients
  └─► Email routing
        ├─► Immediate email (severity: critical)
        └─► Digest queue (emailPending: "PENDING")
              │
              ▼
            Hourly cron → digest-service.ts → batched email
```

### Key Design Decisions

- **Fire-and-forget pattern**: All event sources call `sendUserNotification().catch(...)` so notification failures never break primary operations (reports, chat, etc.)
- **Deduplication**: `dedupeKey` field prevents duplicate notifications when the same event is processed multiple times (e.g., budget alert cron with overlapping lookback windows)
- **SSE + polling fallback**: SSE provides instant delivery when client and server share the same ECS container. Polling at 30s (fallback) or 60s (when SSE active) catches anything SSE misses in multi-container deployments.
- **Sparse GSI for digests**: Only notifications with `emailPending = "PENDING"` appear in the `EmailPendingIndex`, keeping digest queries fast regardless of table size.
- **ULID-based IDs**: Notification IDs are timestamp-prefixed for natural chronological sorting as the DynamoDB sort key.
- **90-day TTL**: Old notifications are automatically expired by DynamoDB.

## Notification Categories

Categories classify notifications and control user preference routing, UI grouping, and icon/color display.

| Category | Description | User Can Disable? | UI Group |
|----------|-------------|-------------------|----------|
| `BUDGET_THRESHOLD` | AWS budget overage/approaching alerts | No (email via external Lambda) | Budget |
| `COST_ANOMALY` | Unusual spending pattern detected | No (email via external Lambda) | Budget |
| `COST_SUMMARY` | Periodic cost summary | No (email via external Lambda) | Budget |
| `SECURITY_CRITICAL` | Critical security findings | Yes | Security |
| `COMPLIANCE` | Compliance status changes | Yes | Security |
| `SECURITY_SCORE` | Security score changes | Yes | Security |
| `PIPELINE_FAILURE` | Terraform pipeline failures | Yes | Pipeline |
| `DEPLOYMENT` | Deployment status updates | Yes | Pipeline |
| `REPORT_READY` | Scheduled report completed or failed | No (always delivered) | System |
| `SYSTEM` | System messages, broadcasts, feedback confirmations | No (always delivered) | System |

Categories with "No" in the user toggle column are mapped to `null` in `CATEGORY_PREFERENCE_MAP` and bypass user preference checks.

## Severity Levels

| Severity | Email Behavior | UI Color |
|----------|---------------|----------|
| `info` | Digest only (if enabled) | Blue |
| `warning` | Digest only (if enabled) | Orange |
| `critical` | Immediate email (bypasses digest) | Red |

## DynamoDB Tables

### user-notifications

| Field | Type | Key | Description |
|-------|------|-----|-------------|
| `userId` | String | PK | User email address |
| `notificationId` | String | SK | ULID-based sortable ID |
| `category` | String | | Notification category |
| `title` | String | | Short notification title |
| `body` | String | | Notification body text |
| `severity` | String | | info, warning, critical |
| `status` | String | | unread, read, archived |
| `actionUrl` | String | | Optional link to relevant page |
| `actionLabel` | String | | Optional button text |
| `metadata` | Map | | Arbitrary context data |
| `dedupeKey` | String | | Optional uniqueness key |
| `emailSent` | Boolean | | Whether email was sent |
| `emailPending` | String | | "PENDING" for digest queue (sparse GSI key) |
| `createdAt` | String | | ISO timestamp |
| `ttl` | Number | | DynamoDB TTL (90 days from creation) |

**Indexes:**
- **StatusIndex** GSI: PK `userId`, SK `status` — query unread notifications per user
- **CategoryIndex** GSI: PK `userId`, SK `category` — filter by category per user
- **EmailPendingIndex** GSI: PK `emailPending`, SK `createdAt` — sparse index for digest processing

### notification-broadcasts

| Field | Type | Key | Description |
|-------|------|-----|-------------|
| `broadcastId` | String | PK | `bc-{timestamp}-{random}` |
| `createdBy` | String | | Admin email |
| `title` | String | | Broadcast title |
| `body` | String | | Broadcast body |
| `category` | String | | Defaults to SYSTEM |
| `severity` | String | | Defaults to info |
| `targetAudience` | String | | all, role, list |
| `targetRole` | String | | Role name (if target=role) |
| `targetUserIds` | List | | User IDs (if target=list) |
| `status` | String | | pending, in-progress, complete |
| `deliveredCount` | Number | | Notifications sent |
| `totalCount` | Number | | Total target users |
| `createdAt` | String | | ISO timestamp |
| `ttl` | Number | | DynamoDB TTL |

**Indexes:**
- **StatusIndex** GSI: PK `status`, SK `createdAt` — list broadcasts by status

## Server-Side API

### Core Function: `sendUserNotification()`

**Location:** `server/utils/notification-service.ts`

This is the single entry point for creating notifications from any event source.

```typescript
import { sendUserNotification } from '../utils/notification-service'

await sendUserNotification({
  userId: 'user@example.com',        // Required: user email
  category: 'REPORT_READY',          // Required: NotificationCategory
  title: 'Your report is ready',     // Required: short title
  body: 'Monthly cost report generated successfully', // Required: body text
  severity: 'info',                  // Required: info | warning | critical
  actionUrl: '/settings/reports',    // Optional: link to relevant page
  actionLabel: 'View Reports',       // Optional: button text
  metadata: { reportId: '123' },     // Optional: arbitrary context
  dedupeKey: 'report-123',           // Optional: prevents duplicates
  skipEmail: false                   // Optional: skip all GHOST email routing
})
```

**Returns:** `{ success: boolean; notificationId?: string; error?: string }`

**Behavior:**
1. Checks `notifications.enabled` site config kill switch
2. If `dedupeKey` provided, queries for existing notification with same key — returns early if found
3. Generates ULID-based `notificationId` and sets 90-day TTL
4. If `skipEmail` is true, skips all email routing (inbox + SSE only)
5. Otherwise, checks user preferences and routes email: immediate if critical + pref enabled, digest queue if pref enabled, skip otherwise
6. Writes to DynamoDB
7. Pushes to SSE via `notificationEmitter.emitNotification()`
8. Sends immediate email if applicable

### Other Service Functions

| Function | Purpose |
|----------|---------|
| `getUserNotifications(userId, params)` | Paginated list with category/status filters |
| `getUnreadCount(userId)` | Lightweight count for badge polling |
| `markNotificationAsRead(userId, notificationId)` | Set status to read |
| `markAllNotificationsAsRead(userId)` | Batch mark all unread as read |
| `deleteNotification(userId, notificationId)` | Remove single notification |
| `clearAllUserNotifications(userId)` | Remove all notifications for a user |
| `getNotificationsForDigest(limit)` | Query EmailPendingIndex for digest processing |
| `markNotificationsAsEmailed(userId, ids)` | Clear emailPending after digest sent |
| `getAllNotificationsAdmin(params)` | Admin: browse all notifications across users |
| `getNotificationStats(days)` | Admin: aggregated volume analytics |

### Broadcast Service

**Location:** `server/utils/broadcast-service.ts`

```typescript
import { createBroadcast } from '../utils/broadcast-service'

await createBroadcast({
  title: 'Maintenance Window',
  body: 'Scheduled downtime tonight 10PM-12AM UTC',
  category: 'SYSTEM',
  severity: 'warning',
  targetAudience: 'all'      // 'all' | 'role' | 'list'
}, adminEmail)
```

Fan-out creates individual `UserNotification` records per target user so each user can independently read/delete/manage their copy.

### SSE Emitter

**Location:** `server/utils/notification-emitter.ts`

Singleton that bridges `sendUserNotification()` with connected SSE streams. You do not need to call this directly — it is invoked automatically by the notification service after a successful DynamoDB write.

```typescript
// Internal usage (already wired in notification-service.ts):
notificationEmitter.emitNotification(userId, notification)
```

### SSE Endpoint

**Location:** `server/api/notifications/stream.get.ts`

`GET /api/notifications/stream` — SSE endpoint that clients connect to via `EventSource`.

**Events emitted:**
- `connected` — sent on initial connection with `{ userId, ts }`
- `notification` — sent when a new notification is created, contains full `UserNotification` object
- `ping` — keep-alive every 30 seconds

**Multi-container note:** SSE only works when the notification-creating request and the client's SSE connection are on the same ECS container. The polling fallback catches any notifications missed by SSE.

## Active Event Sources

These are the places in the codebase that currently call `sendUserNotification()`:

### 1. Report Completion

**Location:** `server/utils/report-scheduler.ts`

Fires after a scheduled report finishes execution (success or failure).

```
Category:    REPORT_READY
Severity:    info (success) | warning (failure)
Action:      /settings/reports → "View Reports"
Metadata:    { reportId, executionId, s3Url } or { reportId, error }
Guard:       Natural (each execution runs once)
```

### 3. Budget Threshold Alerts

**Location:** `server/utils/budget-alert-notifier.ts`

Cron job (every 15 minutes) polls the budget alert DynamoDB table with a 30-minute lookback window. Uses `skipEmail: true` because an external Lambda (`budget-alert-system-prod`) is the sole owner of budget email delivery — GHOST never sends emails about costs or budgets.

```
Category:    BUDGET_THRESHOLD
Severity:    Mapped from alert_level (CRITICAL/ESCALATION→critical, WARNING→warning, INFO→info)
Action:      /costs?account={account_id} → "View Cost Details"
skipEmail:   true (external Lambda handles all email delivery)
Metadata:    { alertId, accountId, accountName, alertLevel, alertType, actualSpend, budget, projectedSpend, emailBodyS3Uri, lambdaDeliveryStatus, lambdaSesMessageId }
DedupeKey:   budget-alert-{alert_id}
Guard:       dedupeKey (overlapping lookback windows)
Recipients:  Each email in alert.recipients_to or alert.recipients
UI:          "View Email" button fetches Lambda's HTML from S3 via /api/alerts/[alertId]/email
```

### 4. Feedback Confirmation

**Location:** `server/api/feedback/submit.post.ts`

Fires after a user submits feedback (issue, feature request, or general feedback).

```
Category:    SYSTEM
Severity:    info
Guard:       Natural (one submission = one notification)
```

### 5. Admin Broadcast

**Location:** `server/api/admin/user-notifications/broadcast.post.ts`

Admin sends a broadcast to all users, a role, or a specific list. Creates individual notifications via fan-out.

```
Category:    Configurable (defaults to SYSTEM)
Severity:    Configurable (defaults to info)
Guard:       Manual (admin action)
```

### 6. Admin Test Notification

**Location:** `server/api/admin/user-notifications/test.post.ts`

Admin sends a test notification to themselves for verification.

```
Category:    SYSTEM
Severity:    Configurable (defaults to info)
```

## REST API Endpoints

### User Endpoints (authenticated)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/notifications/list` | Paginated notifications. Query: `category`, `status`, `limit` (max 50), `lastKey` |
| `GET` | `/api/notifications/unread-count` | Unread badge count |
| `POST` | `/api/notifications/mark-all-read` | Mark all unread as read |
| `PATCH` | `/api/notifications/{id}/read` | Mark one notification as read |
| `DELETE` | `/api/notifications/{id}` | Delete one notification |
| `POST` | `/api/notifications/clear-all` | Delete all notifications |
| `POST` | `/api/notifications/mute` | Mute notifications. Body: `{ duration: '1h'|'4h'|'24h' }` or `{ unmute: true }` |
| `GET` | `/api/notifications/stream` | SSE real-time stream |

### Admin Endpoints (admin role required)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/user-notifications/list` | Browse all users' notifications. Extra query: `userId`, `search`, `dateFrom`, `dateTo` |
| `GET` | `/api/admin/user-notifications/stats` | Volume analytics (by category, by day, email counts) |
| `POST` | `/api/admin/user-notifications/broadcast` | Send broadcast. Body: `{ title, body, targetAudience, category?, severity?, targetRole?, targetUserIds? }` |
| `GET` | `/api/admin/user-notifications/broadcasts` | List past broadcasts |
| `POST` | `/api/admin/user-notifications/test` | Send test notification to self |
| `GET` | `/api/admin/user-notifications/config` | Read system notification config |
| `PUT` | `/api/admin/user-notifications/config` | Update system config (enabled, digestEnabled, defaults) |

## Client-Side Composable

**Location:** `app/composables/useNotifications.ts`

Singleton composable — state is shared across all component instances.

```typescript
const {
  // Reactive state (all readonly)
  unreadCount,      // Ref<number>
  notifications,    // Ref<UserNotification[]>
  isLoading,        // Ref<boolean>
  isPanelOpen,      // Ref<boolean>
  hasMore,          // Ref<boolean>
  activeFilter,     // Ref<'all' | 'unread' | string>
  sseConnected,     // Ref<boolean>

  // Actions
  fetchNotifications,   // (reset?: boolean) => Promise<void>
  loadMore,             // () => void — fetches next page
  markAsRead,           // (notificationId: string) => Promise<void>
  markAllAsRead,        // () => Promise<void>
  removeNotification,   // (notificationId: string) => Promise<void>
  clearAll,             // () => Promise<void>
  muteTemporarily,      // (duration: MuteDuration) => Promise<string | null>
  openPanel,            // () => void — opens slideover + fetches
  closePanel,           // () => void
  togglePanel,          // () => void
  setFilter,            // (filter: string) => void — fetches with new filter
  startPolling,         // () => void
  stopPolling           // () => void
} = useNotifications()
```

**Lifecycle:** Automatically starts polling + SSE on login, stops on logout. Client-side only.

**Optimistic updates:** All actions update local state immediately before server confirms, then the server response is the source of truth on next fetch.

## Cron Jobs

Defined in `server/plugins/scheduler.ts`. All use DynamoDB execution locks for multi-container ECS safety.

| Cron | Schedule | Lock Key | Description |
|------|----------|----------|-------------|
| Budget Alert Notifier | `:05, :20, :35, :50` every hour | `budget-alert-notifier#{timestamp}` | Polls budget alerts, sends BUDGET_THRESHOLD notifications |
| Email Digest | `:15` every hour | `email-digest#{YYYY-MM-DDTHH}` | Batches pending notifications into digest emails |

## Site Config Keys

Managed via Admin Panel > Notifications > Configuration, stored in the `ghost-site-config` DynamoDB table.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `notifications.enabled` | boolean | true | Kill switch — disables all notification creation |
| `notifications.digestEnabled` | boolean | true | Enables/disables email digest processing |
| `notifications.defaultDigestFrequency` | string | 'daily' | Default digest frequency for new users |
| `notifications.defaultDigestHour` | number | 8 | Default digest delivery hour (0-23, user's timezone) |

## Adding a New Event Source

To wire a new application event to the notification system:

1. Import the service:
   ```typescript
   import { sendUserNotification } from '../utils/notification-service'
   ```

2. Call it with fire-and-forget after the primary operation succeeds:
   ```typescript
   sendUserNotification({
     userId: userEmail,
     category: 'PIPELINE_FAILURE',          // Pick appropriate category
     title: 'Pipeline failed: my-stack',
     body: 'Terraform apply failed with 2 errors',
     severity: 'warning',
     actionUrl: '/pipelines/my-stack',
     actionLabel: 'View Pipeline',
     metadata: { stackId: '...', errors: 2 },
     dedupeKey: 'pipeline-fail-my-stack-123' // Optional: prevent duplicates
   }).catch(err => logger.warn('Failed to send notification:', err))
   ```

3. If the event can be processed multiple times (cron jobs, retries), always set a `dedupeKey`.

4. If you need a new category, add it to `NotificationCategory` in `shared/types/notifications.ts` and update:
   - `CATEGORY_PREFERENCE_MAP` — set to a preference key string (user-toggleable) or `null` (always delivered)
   - `CATEGORY_DISPLAY` — icon, label, and color for the UI
   - `NOTIFICATION_FILTER_GROUPS` — which filter group it belongs to in the bell panel

## File Reference

| File | Purpose |
|------|---------|
| `shared/types/notifications.ts` | All TypeScript types, category maps, display metadata |
| `server/utils/notification-service.ts` | Core CRUD, email routing, deduplication |
| `server/utils/notification-emitter.ts` | In-memory SSE bridge |
| `server/utils/broadcast-service.ts` | Admin broadcast fan-out |
| `server/utils/budget-alert-notifier.ts` | Budget alert polling + notification |
| `server/utils/digest-service.ts` | Hourly email digest processing |
| `server/api/notifications/` | User-facing REST + SSE endpoints |
| `server/api/admin/user-notifications/` | Admin REST endpoints |
| `server/plugins/scheduler.ts` | Cron job definitions |
| `app/composables/useNotifications.ts` | Client-side singleton composable |
| `app/components/navigation/NotificationBell.vue` | Bell icon + slideover panel |
| `app/components/admin/UserNotificationsPanel.vue` | Admin: notification browser |
| `app/components/admin/NotificationBroadcastPanel.vue` | Admin: broadcast sender |
| `app/components/admin/NotificationConfigPanel.vue` | Admin: system config |
| `app/components/admin/NotificationAnalyticsPanel.vue` | Admin: volume analytics |
| `app/components/settings/NotificationPreferencesEnhanced.vue` | User preferences page |
| `app/pages/admin/notifications/index.vue` | Admin notifications page |
| `app/pages/settings/notifications.vue` | User notification settings page |
| `server/lib/dynamodb-config.ts` | Table name resolution (env vars + fallbacks) |
| `terraform/dynamodb-tables.tf` | DynamoDB table + GSI definitions |
| `terraform/ecs.tf` | ECS env var passthrough for table names |
