/**
 * Budget Alert Types
 *
 * Types for the budget-alert-history DynamoDB table in Commercial AWS.
 * Models alert records sent by the budget monitoring system, including
 * financial data, delivery tracking, and metadata.
 */

// -----------------------------------------------------------------------------
// Type Unions
// -----------------------------------------------------------------------------

/**
 * Alert severity levels
 * - INFO: Informational notification (e.g., approaching threshold)
 * - WARNING: Budget threshold exceeded at lower level
 * - CRITICAL: Significant budget overage
 * - ESCALATION: Repeated critical alerts requiring management attention
 */
export type BudgetAlertLevel = 'INFO' | 'WARNING' | 'CRITICAL' | 'ESCALATION'

/**
 * Alert trigger types
 * - FORECAST: Predictive alert based on projected spend
 * - ACTUAL: Alert triggered by actual spend exceeding budget
 */
export type BudgetAlertType = 'FORECAST' | 'ACTUAL'

/**
 * Email delivery status
 * - SUCCESS: Successfully delivered via SES
 * - SENT: Successfully delivered via SES (legacy)
 * - FAILED: Delivery failed
 * - PENDING: Awaiting delivery (dry-run or queued)
 */
export type BudgetAlertDeliveryStatus = 'SUCCESS' | 'SENT' | 'FAILED' | 'PENDING'

// -----------------------------------------------------------------------------
// Core Types
// -----------------------------------------------------------------------------

/**
 * Main budget alert record from DynamoDB
 * Represents a single alert sent for an account
 */
export interface BudgetAlert {
  // Primary key fields
  account_id: string       // Partition key - AWS account ID
  alert_id: string         // Sort key - Unique alert identifier (UUID)

  // GSI fields for querying
  month: string            // YYYY-MM format (month-index GSI partition key)
  created_at: string       // ISO timestamp (month-index GSI sort key)
  alert_type: BudgetAlertType      // FORECAST or ACTUAL (alert-type-index GSI partition key)
  timestamp: string        // ISO timestamp (alert-type-index GSI sort key)

  // Alert classification
  alert_level: BudgetAlertLevel

  // Financial data
  actual_spend: number     // Current month spend in dollars
  budget: number           // Account budget in dollars
  burn_rate: number        // Daily burn rate as percentage of remaining budget
  projected_spend: number  // End-of-month projected spend in dollars
  overspend_amount?: number // Amount over budget (if applicable)

  // Delivery tracking
  recipients?: string[]          // Email addresses alert was sent to (legacy)
  recipients_to?: string[]       // Primary recipients
  recipients_cc?: string[]       // CC recipients
  delivery_status: BudgetAlertDeliveryStatus
  ses_message_id?: string        // AWS SES message ID for tracking

  // Email content
  email_subject?: string         // Email subject line
  email_body_s3_uri?: string     // S3 URI to the email HTML content
  content_hash?: string          // Hash of email content for deduplication

  // Metadata
  account_name?: string    // Human-readable account name
  dry_run?: boolean        // True if alert was in dry-run mode (not actually sent)
  skipped_levels?: string[]      // Alert levels that were skipped
  recipient_resolution_type?: string  // How recipients were resolved

  // Additional financial data
  projected_overspend?: number   // Projected amount over budget

  // DynamoDB TTL (Unix epoch timestamp for automatic expiration)
  ttl?: number
}

// -----------------------------------------------------------------------------
// Query & Filter Types
// -----------------------------------------------------------------------------

/**
 * Query parameters for budget alert API endpoints
 * Used for fetching alerts with filtering and pagination
 */
export interface BudgetAlertQueryParams {
  // Primary filters
  account_id?: string      // Filter by specific account
  month?: string           // Filter by month (YYYY-MM)

  // Classification filters
  level?: BudgetAlertLevel | BudgetAlertLevel[]    // Filter by alert level(s)
  type?: BudgetAlertType | BudgetAlertType[]       // Filter by alert type(s)
  delivery_status?: BudgetAlertDeliveryStatus      // Filter by delivery status

  // Date range (ISO timestamps)
  date_from?: string       // Start of date range
  date_to?: string         // End of date range

  // Pagination
  limit?: number           // Maximum results to return (default: 50)
  nextToken?: string       // Pagination token for next page
}

/**
 * Filter configuration for client-side filtering
 * Used by composables and components
 */
export interface BudgetAlertFilters {
  levels?: BudgetAlertLevel[]
  types?: BudgetAlertType[]
  delivery_status?: BudgetAlertDeliveryStatus
  date_from?: string
  date_to?: string
}

// -----------------------------------------------------------------------------
// Response Types
// -----------------------------------------------------------------------------

/**
 * Standard paginated response for budget alert list endpoints
 */
export interface BudgetAlertListResponse {
  success: boolean
  alerts: BudgetAlert[]
  count: number
  nextToken?: string       // Present if more results available
  total?: number           // Total count (if available without full scan)
}

/**
 * Summary counts by alert level
 */
export interface BudgetAlertLevelSummary {
  INFO: number
  WARNING: number
  CRITICAL: number
  ESCALATION: number
}

/**
 * Summary counts by alert type
 */
export interface BudgetAlertTypeSummary {
  FORECAST: number
  ACTUAL: number
}

/**
 * Aggregated summary for dashboard views
 */
export interface BudgetAlertSummary {
  // Total counts
  total: number

  // Breakdown by classification
  byLevel: BudgetAlertLevelSummary
  byType: BudgetAlertTypeSummary

  // Delivery status breakdown
  byDeliveryStatus: {
    SENT: number
    FAILED: number
    PENDING: number
  }

  // Time period this summary covers
  period?: {
    from: string           // ISO timestamp
    to: string             // ISO timestamp
  }
}

/**
 * Response for summary/metrics endpoint
 */
export interface BudgetAlertSummaryResponse {
  success: boolean
  summary: BudgetAlertSummary
  lastUpdated?: string     // ISO timestamp
}

/**
 * Single alert response (for detail views)
 */
export interface BudgetAlertDetailResponse {
  success: boolean
  alert: BudgetAlert | null
}
