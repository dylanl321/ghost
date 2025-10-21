/**
 * Scheduled Reports Type Definitions
 * Shared between frontend and backend
 */

export type ReportFrequency = 'daily' | 'weekly' | 'monthly' | 'quarterly'
export type ReportStatus = 'active' | 'paused' | 'disabled'
export type ExecutionStatus = 'success' | 'failed' | 'running'
export type ReportFormat = 'pdf' | 'xlsx' | 'csv' | 'json'
export type DataMode = 'billable' | 'proforma'
export type Timeframe = 'thisMonth' | 'lastMonth' | 'last3Months' | 'last6Months' | 'last12Months' | 'yearToDate' | 'lastYear'

/**
 * Report configuration - defines what data to include
 */
export interface ReportConfig {
  accounts: string[] // Selected account IDs (empty = org-wide)
  timeframe: Timeframe
  dataMode: DataMode
  viewType: string // 'summary' | 'detailed' | etc
  format: ReportFormat
  includeServices: boolean
  includeHistorical: boolean
  includeForecast: boolean
}

/**
 * Schedule configuration - defines when to run
 */
export interface ScheduleConfig {
  frequency: ReportFrequency
  dayOfWeek?: number // 0-6 (Sunday-Saturday) for weekly
  dayOfMonth?: number // 1-31 for monthly
  monthOfQuarter?: number // 1-3 for quarterly
  time: string // HH:MM format in 24h
  timezone: string // IANA timezone (e.g., 'America/New_York')
}

/**
 * Email template configuration
 */
export interface EmailTemplateConfig {
  templateId?: string // ID of custom template (for admins)
  subject: string
  body: string // HTML or Markdown
  isCustom: boolean // true for admin-customized templates
}

/**
 * Scheduled report entity
 */
export interface ScheduledReport {
  reportId: string // UUID
  reportName: string
  description?: string

  // Owner
  createdBy: string // User email
  isAdmin: boolean

  // Configuration
  reportConfig: ReportConfig
  schedule: ScheduleConfig

  // Email
  recipients: string[] // Email addresses
  emailTemplate: EmailTemplateConfig

  // Status & Tracking
  status: ReportStatus
  lastRunTime?: string // ISO 8601 timestamp
  lastRunStatus?: ExecutionStatus
  lastRunError?: string
  nextRunTime: string // ISO 8601 timestamp
  runCount: number

  // Audit
  createdAt: string // ISO 8601 timestamp
  updatedAt: string // ISO 8601 timestamp

  // DynamoDB GSI keys
  userIdStatus?: string // composite key: `${createdBy}#${status}`
}

/**
 * Email delivery status for individual recipient
 */
export interface EmailDeliveryRecipient {
  email: string
  status: 'sent' | 'failed'
  messageId?: string
  error?: string
  timestamp: string
}

/**
 * Email delivery details for a report execution
 */
export interface EmailDeliveryDetails {
  subject: string
  bodyPreview: string  // First 500 chars of body for display
  htmlBody: string     // Full HTML body
  recipients: EmailDeliveryRecipient[]
  totalSent: number
  totalFailed: number
  sesMessageId?: string  // AWS SES Message ID
}

/**
 * Report execution history entry
 */
export interface ReportExecution {
  reportId: string
  executionId: string // UUID
  executionTime: string // ISO 8601 timestamp
  status: ExecutionStatus
  duration?: number // milliseconds
  error?: string
  emailsSent?: number
  emailsFailed?: number
  reportSize?: number // bytes
  emailDelivery?: EmailDeliveryDetails  // Detailed email delivery tracking
  s3Key?: string // S3 object key where report is stored
  s3Url?: string // Presigned download URL
  s3UrlExpiresAt?: string // When presigned URL expires (ISO 8601)
  downloadCount?: number // Track how many times the report was downloaded
  expiresAt?: number // TTL for DynamoDB (30 days)
}

/**
 * Create scheduled report request
 */
export interface CreateReportRequest {
  reportName: string
  description?: string
  reportConfig: ReportConfig
  schedule: ScheduleConfig
  recipients: string[]
  emailTemplate?: Partial<EmailTemplateConfig>
}

/**
 * Update scheduled report request
 */
export interface UpdateReportRequest {
  reportName?: string
  description?: string
  reportConfig?: Partial<ReportConfig>
  schedule?: Partial<ScheduleConfig>
  recipients?: string[]
  emailTemplate?: Partial<EmailTemplateConfig>
  status?: ReportStatus
}

/**
 * Scheduled reports list response
 */
export interface ListReportsResponse {
  success: boolean
  data: {
    reports: ScheduledReport[]
    total: number
    nextToken?: string
  }
  error?: string
}

/**
 * Single report response
 */
export interface ReportResponse {
  success: boolean
  data?: ScheduledReport
  error?: string
}

/**
 * Report execution history response
 */
export interface ExecutionHistoryResponse {
  success: boolean
  data: {
    executions: ReportExecution[]
    total: number
  }
  error?: string
}

/**
 * Test report request
 */
export interface TestReportRequest {
  reportId: string
  testRecipient?: string // Override recipients for testing
}

/**
 * Admin statistics response
 */
export interface ReportStatistics {
  totalReports: number
  activeReports: number
  pausedReports: number
  disabledReports: number
  reportsByFrequency: {
    daily: number
    weekly: number
    monthly: number
    quarterly: number
  }
  recentExecutions: {
    last24h: number
    successRate: number
    failureRate: number
  }
  upcomingRuns: {
    next1h: number
    next24h: number
    next7d: number
  }
}
