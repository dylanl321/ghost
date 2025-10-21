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
    description: 'Report time period',
    example: 'Last Month',
    required: true
  },
  {
    name: 'dataMode',
    description: 'Cost data mode (Billable or Pro-forma)',
    example: 'Billable',
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
  {
    name: 'dashboardUrl',
    description: 'Link to GHOST dashboard',
    example: 'https://ghost.example.com',
    required: false
  },
  {
    name: 'settingsUrl',
    description: 'Link to report settings',
    example: 'https://ghost.example.com/reports/scheduled',
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
