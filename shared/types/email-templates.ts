/**
 * Email Template Type Definitions
 * For admin-managed custom email templates
 */

export type TemplateType = 'default' | 'custom' | 'system'
export type TemplateCategory = 'cost-report' | 'notification' | 'alert' | 'other'

/**
 * Email template entity
 */
export interface EmailTemplate {
  templateId: string // UUID
  templateName: string
  templateType: TemplateType
  category: TemplateCategory
  description?: string

  // Template content
  subject: string
  body: string // HTML content
  variables: TemplateVariable[] // Available variables for interpolation

  // Metadata
  isCustom: boolean // true for admin-created templates
  isActive: boolean
  createdBy: string // Admin email
  updatedBy?: string

  // Audit
  createdAt: string // ISO 8601 timestamp
  updatedAt: string // ISO 8601 timestamp

  // Usage statistics
  usageCount?: number
  lastUsedAt?: string
}

/**
 * Template variable definition
 */
export interface TemplateVariable {
  name: string // e.g., 'userName', 'reportName'
  description: string
  example: string
  required: boolean
}

/**
 * Available template variables for cost reports
 */
export const COST_REPORT_VARIABLES: TemplateVariable[] = [
  // Basic report info
  {
    name: 'userName',
    description: 'Name of the recipient',
    example: 'John Smith',
    required: false
  },
  {
    name: 'reportName',
    description: 'Name of the scheduled report',
    example: 'Weekly Cost Summary',
    required: true
  },
  {
    name: 'timeframe',
    description: 'Report time period (formatted)',
    example: 'Last Month',
    required: true
  },
  {
    name: 'dataMode',
    description: 'Cost data mode (Billable or Pro-forma)',
    example: 'Billable (Actual Costs)',
    required: true
  },
  {
    name: 'accountCount',
    description: 'Number of accounts in report',
    example: '15',
    required: true
  },
  {
    name: 'totalCost',
    description: 'Total cost formatted as currency',
    example: '$15,234.56',
    required: false
  },
  {
    name: 'format',
    description: 'Report format (PDF, XLSX, etc)',
    example: 'PDF',
    required: true
  },
  {
    name: 'timestamp',
    description: 'Report generation timestamp',
    example: 'October 16, 2025 at 2:30 PM EDT',
    required: true
  },

  // Current date/time
  {
    name: 'currentDate',
    description: 'Current date when report runs',
    example: 'October 5, 2025',
    required: true
  },
  {
    name: 'currentMonth',
    description: 'Current month name',
    example: 'October',
    required: true
  },
  {
    name: 'currentMonthShort',
    description: 'Current month abbreviated',
    example: 'Oct',
    required: true
  },
  {
    name: 'currentYear',
    description: 'Current year',
    example: '2025',
    required: true
  },
  {
    name: 'currentDay',
    description: 'Current day of month',
    example: '5',
    required: true
  },

  // Report period start
  {
    name: 'startDate',
    description: 'Report period start date',
    example: 'September 1, 2025',
    required: true
  },
  {
    name: 'startMonth',
    description: 'Report period start month',
    example: 'September',
    required: true
  },
  {
    name: 'startMonthShort',
    description: 'Report period start month abbreviated',
    example: 'Sep',
    required: true
  },
  {
    name: 'startYear',
    description: 'Report period start year',
    example: '2025',
    required: true
  },
  {
    name: 'startDay',
    description: 'Report period start day',
    example: '1',
    required: true
  },

  // Report period end
  {
    name: 'endDate',
    description: 'Report period end date',
    example: 'September 30, 2025',
    required: true
  },
  {
    name: 'endMonth',
    description: 'Report period end month',
    example: 'September',
    required: true
  },
  {
    name: 'endMonthShort',
    description: 'Report period end month abbreviated',
    example: 'Sep',
    required: true
  },
  {
    name: 'endYear',
    description: 'Report period end year',
    example: '2025',
    required: true
  },
  {
    name: 'endDay',
    description: 'Report period end day',
    example: '30',
    required: true
  },

  // Date ranges and computed values
  {
    name: 'dateRange',
    description: 'Report date range (start - end)',
    example: 'Sep 1 - Sep 30, 2025',
    required: true
  },
  {
    name: 'reportPeriod',
    description: 'Report period formatted intelligently',
    example: 'September 2025',
    required: true
  },
  {
    name: 'quarter',
    description: 'Fiscal quarter',
    example: 'Q3',
    required: true
  },
  {
    name: 'startDateISO',
    description: 'Start date in ISO format',
    example: '2025-09-01',
    required: true
  },
  {
    name: 'endDateISO',
    description: 'End date in ISO format',
    example: '2025-09-30',
    required: true
  },

  // URLs
  {
    name: 'siteUrl',
    description: 'Base URL of the GHOST dashboard site',
    example: 'https://ghost.example.com',
    required: false
  },
  {
    name: 'downloadUrl',
    description: 'S3 presigned URL to download the report (30-day expiration)',
    example: 'https://s3.amazonaws.com/...',
    required: false
  },
  {
    name: 'recipientEmail',
    description: 'Email of the recipient',
    example: 'user@example.com',
    required: false
  }
]

/**
 * Template rendering context
 */
export interface TemplateContext {
  [key: string]: string | number | boolean | undefined
}

/**
 * Create template request
 */
export interface CreateTemplateRequest {
  templateName: string
  category: TemplateCategory
  description?: string
  subject: string
  body: string
}

/**
 * Update template request
 */
export interface UpdateTemplateRequest {
  templateName?: string
  category?: TemplateCategory
  description?: string
  subject?: string
  body?: string
  isActive?: boolean
}

/**
 * Template list response
 */
export interface ListTemplatesResponse {
  success: boolean
  data: {
    templates: EmailTemplate[]
    total: number
  }
  error?: string
}

/**
 * Single template response
 */
export interface TemplateResponse {
  success: boolean
  data?: EmailTemplate
  error?: string
}

/**
 * Template preview request
 */
export interface TemplatePreviewRequest {
  subject: string
  body: string
  context: TemplateContext
}

/**
 * Template preview response
 */
export interface TemplatePreviewResponse {
  success: boolean
  data?: {
    subject: string
    body: string
  }
  error?: string
}
