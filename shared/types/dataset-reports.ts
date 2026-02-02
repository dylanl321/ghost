/**
 * Dataset Reports Type Definitions
 *
 * Defines the structure for AWS dataset reports (Config, Security Hub, CloudTrail)
 * These reports are separate from cost reports but share the same scheduling,
 * email, and delivery infrastructure.
 */

// ============================================================================
// Dataset Configuration Types
// ============================================================================

/**
 * Supported dataset types
 */
export type DatasetType = 'config' | 'securityHub' | 'cloudtrail'

/**
 * AWS Config resource filter options
 */
export interface ConfigDatasetFilters {
  /**
   * Filter by specific resource types (e.g., 'AWS::EC2::Instance', 'AWS::S3::Bucket')
   * Empty array = all resource types
   */
  resourceTypes?: string[]

  /**
   * Filter by compliance status
   */
  complianceStatus?: ('COMPLIANT' | 'NON_COMPLIANT' | 'NOT_APPLICABLE' | 'INSUFFICIENT_DATA')[]

  /**
   * Only include resources with compliance rules
   */
  complianceOnly?: boolean

  /**
   * Filter by specific regions
   * Empty array = all regions
   */
  regions?: string[]

  /**
   * Quick filters for common scenarios
   */
  quickFilters?: {
    publicIpOnly?: boolean
    publicAccessEnabled?: boolean
    openToInternet?: boolean
    unencryptedOnly?: boolean
    noMfaOnly?: boolean
  }
}

/**
 * AWS Security Hub finding filter options
 */
export interface SecurityHubDatasetFilters {
  /**
   * Filter by severity levels
   */
  severities?: ('CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFORMATIONAL')[]

  /**
   * Filter by workflow status
   */
  statuses?: ('NEW' | 'NOTIFIED' | 'RESOLVED' | 'SUPPRESSED')[]

  /**
   * Filter by specific products/integrations
   * (e.g., 'GuardDuty', 'Inspector', 'IAM Access Analyzer')
   */
  products?: string[]

  /**
   * Filter by compliance standards
   * (e.g., 'aws-foundational-security-best-practices', 'cis-aws-foundations-benchmark')
   */
  complianceStandards?: string[]

  /**
   * Filter by specific control IDs
   */
  controlIds?: string[]

  /**
   * Only include findings with active vulnerabilities
   */
  activeOnly?: boolean

  /**
   * Lookback period in days (default: 30)
   */
  lookbackDays?: number

  /**
   * Filter by resource ID (e.g., instance ID, bucket name)
   * Uses CONTAINS comparison to match partial IDs
   */
  resourceId?: string

  /**
   * Filter by specific regions
   */
  regions?: string[]
}

/**
 * AWS CloudTrail event filter options
 */
export interface CloudTrailDatasetFilters {
  /**
   * Filter by event types
   * (e.g., 'AwsApiCall', 'AwsServiceEvent', 'AwsConsoleSignIn')
   */
  eventTypes?: string[]

  /**
   * Filter by specific event names
   * (e.g., 'CreateBucket', 'DeleteUser', 'PutBucketPolicy')
   */
  eventNames?: string[]

  /**
   * Filter by specific IAM users or roles
   */
  userIdentities?: string[]

  /**
   * Filter by specific services
   * (e.g., 's3.amazonaws.com', 'iam.amazonaws.com')
   */
  eventSources?: string[]

  /**
   * Only include write/modification events (excludes reads)
   */
  writeEventsOnly?: boolean

  /**
   * Only include events with errors
   */
  errorsOnly?: boolean

  /**
   * Lookback period in days (default: 7, max: 90)
   */
  lookbackDays?: number

  /**
   * Filter by specific regions
   */
  regions?: string[]

  /**
   * Start time for event filtering (ISO 8601)
   */
  startTime?: string

  /**
   * End time for event filtering (ISO 8601)
   */
  endTime?: string
}

/**
 * Entra ID (Azure AD) user filter options
 */
export interface EntraUsersDatasetFilters {
  /**
   * Filter by specific role names
   */
  roles?: string[]

  /**
   * Only include active users
   */
  activeOnly?: boolean

  /**
   * Lookback period in days for activity
   */
  lookbackDays?: number

  /**
   * Filter by specific departments
   */
  departments?: string[]

  /**
   * Search by user name or email
   */
  userSearch?: string
}

/**
 * Dataset-specific configuration
 */
export interface DatasetSelection {
  /**
   * Include AWS Config resources
   */
  config?: {
    enabled: boolean
    filters?: ConfigDatasetFilters
  }

  /**
   * Include AWS Security Hub findings
   */
  securityHub?: {
    enabled: boolean
    filters?: SecurityHubDatasetFilters
  }

  /**
   * Include AWS CloudTrail events
   */
  cloudtrail?: {
    enabled: boolean
    filters?: CloudTrailDatasetFilters
  }

  /**
   * Include Entra ID (Azure AD) users
   */
  entraUsers?: {
    enabled: boolean
    filters?: EntraUsersDatasetFilters
  }
}

/**
 * Dataset report configuration (extends base ReportConfig pattern)
 */
export interface DatasetReportConfig {
  /**
   * AWS accounts to include in the report
   * Empty array = all accounts in organization
   */
  accounts: string[]

  /**
   * Selected datasets and their configurations
   */
  datasets: DatasetSelection

  /**
   * Output format
   */
  format: 'pdf' | 'xlsx' | 'csv' | 'json'

  /**
   * Enable AI-powered insights and analysis
   * Uses AWS Bedrock (Claude) to generate executive summaries
   */
  enableAI?: boolean

  /**
   * Time range for dataset queries
   * Some datasets (CloudTrail, Security Hub) are time-based
   */
  timeRange?: {
    type: 'relative' | 'absolute'
    // Relative time range
    relativeDays?: number  // Last N days
    // Absolute time range
    startDate?: string     // ISO 8601
    endDate?: string       // ISO 8601
  }
}

// ============================================================================
// Dataset Record Types (Normalized)
// ============================================================================

/**
 * Normalized AWS Config resource record
 */
export interface ConfigResourceRecord {
  accountId: string
  accountName: string
  region: string
  resourceType: string
  resourceId: string
  resourceName?: string
  complianceStatus?: 'COMPLIANT' | 'NON_COMPLIANT' | 'NOT_APPLICABLE' | 'INSUFFICIENT_DATA'
  complianceType?: string  // Rule name
  configurationItemCaptureTime: string
  tags?: Record<string, string>
  arn?: string
}

/**
 * Normalized AWS Security Hub finding record
 */
export interface SecurityHubFindingRecord {
  accountId: string
  accountName: string
  region: string
  findingId: string
  title: string
  description?: string
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFORMATIONAL'
  severityScore?: number  // 0-100
  workflowStatus: 'NEW' | 'NOTIFIED' | 'RESOLVED' | 'SUPPRESSED'
  productName: string
  productArn?: string
  complianceStatus?: 'PASSED' | 'FAILED' | 'WARNING' | 'NOT_AVAILABLE'
  complianceStandard?: string
  controlId?: string
  resourceType: string
  resourceId: string
  createdAt: string
  updatedAt: string
  firstObservedAt: string
  lastObservedAt?: string
  remediationRecommendation?: string
  remediationUrl?: string
}

/**
 * Normalized AWS CloudTrail event record
 */
export interface CloudTrailEventRecord {
  accountId: string
  accountName: string
  region: string
  eventId: string
  eventName: string
  eventType: string
  eventTime: string
  eventSource: string  // Service (e.g., 's3.amazonaws.com')
  userIdentityType: string  // 'IAMUser', 'AssumedRole', 'Root', etc.
  userIdentityPrincipalId?: string
  userIdentityArn?: string
  userIdentityUserName?: string
  sourceIPAddress?: string
  userAgent?: string
  errorCode?: string
  errorMessage?: string
  readOnly: boolean
  resources?: Array<{
    type: string
    name: string
    arn?: string
  }>
  requestParameters?: Record<string, any>
  responseElements?: Record<string, any>
}

/**
 * Normalized Entra ID user record
 * Represents one user-account-role mapping (expanded view)
 */
export interface EntraUserRecord {
  userId: string
  userPrincipalName: string
  displayName: string
  email: string
  accountId: string
  accountName: string
  role: string
  groupName: string
  groupId: string
  lastSignIn?: string
  jobTitle?: string
  department?: string
  manager?: string
}

// ============================================================================
// Dataset Report Results
// ============================================================================

/**
 * Entra Users dataset result for reports
 */
export interface EntraUsersDatasetResult {
  enabled: true
  totalUsers: number
  usersByRole: Record<string, number>
  usersByDepartment: Record<string, number>
  activeUsers: number
  records: EntraUserRecord[]
}

/**
 * Complete dataset report data structure
 */
export interface DatasetReportData {
  /**
   * Report metadata
   */
  metadata: {
    reportId: string
    reportName: string
    generatedAt: string
    accounts: Array<{
      accountId: string
      accountName: string
    }>
    timeRange?: {
      startDate: string
      endDate: string
    }
  }

  /**
   * AWS Config data (if enabled)
   */
  config?: {
    enabled: true
    totalResources: number
    resourcesByType: Record<string, number>
    complianceSummary: {
      compliant: number
      nonCompliant: number
      notApplicable: number
      insufficientData: number
    }
    records: ConfigResourceRecord[]
  }

  /**
   * AWS Security Hub data (if enabled)
   */
  securityHub?: {
    enabled: true
    totalFindings: number
    findingsBySeverity: {
      critical: number
      high: number
      medium: number
      low: number
      informational: number
    }
    findingsByStatus: {
      new: number
      notified: number
      resolved: number
      suppressed: number
    }
    findingsByProduct: Record<string, number>
    records: SecurityHubFindingRecord[]
  }

  /**
   * AWS CloudTrail data (if enabled)
   */
  cloudtrail?: {
    enabled: true
    totalEvents: number
    eventsByType: Record<string, number>
    eventsByService: Record<string, number>
    topUsers: Array<{
      userName: string
      eventCount: number
    }>
    errorEvents: number
    writeEvents: number
    readEvents: number
    records: CloudTrailEventRecord[]
  }

  /**
   * Entra ID Users data (if enabled)
   */
  entraUsers?: EntraUsersDatasetResult

  /**
   * AI-generated insights (if enabled)
   */
  aiInsights?: {
    executiveSummary: string  // 3-4 paragraph overview
    keyFindings: string[]     // Bullet points of notable patterns
    recommendations?: string[] // Optional recommendations (if applicable)
  }
}

// ============================================================================
// Export Column Definitions
// ============================================================================

/**
 * Column definitions for dataset exports
 */
export interface DatasetColumnConfig {
  key: string
  label: string
  width?: number  // Excel column width
  type?: 'string' | 'number' | 'date' | 'boolean'
  format?: string // Date format or number format
}

/**
 * Predefined column sets for each dataset type
 */
export const CONFIG_COLUMNS: DatasetColumnConfig[] = [
  { key: 'accountName', label: 'Account', width: 25 },
  { key: 'region', label: 'Region', width: 15 },
  { key: 'resourceType', label: 'Resource Type', width: 30 },
  { key: 'resourceId', label: 'Resource ID', width: 40 },
  { key: 'resourceName', label: 'Resource Name', width: 30 },
  { key: 'complianceStatus', label: 'Compliance Status', width: 18 },
  { key: 'complianceType', label: 'Compliance Rule', width: 35 },
  { key: 'configurationItemCaptureTime', label: 'Last Updated', width: 20, type: 'date' },
]

export const SECURITY_HUB_COLUMNS: DatasetColumnConfig[] = [
  { key: 'accountName', label: 'Account', width: 25 },
  { key: 'severity', label: 'Severity', width: 12 },
  { key: 'title', label: 'Finding Title', width: 50 },
  { key: 'productName', label: 'Product', width: 25 },
  { key: 'workflowStatus', label: 'Status', width: 15 },
  { key: 'resourceType', label: 'Resource Type', width: 30 },
  { key: 'resourceId', label: 'Resource ID', width: 40 },
  { key: 'complianceStandard', label: 'Compliance Standard', width: 35 },
  { key: 'controlId', label: 'Control ID', width: 25 },
  { key: 'firstObservedAt', label: 'First Observed', width: 20, type: 'date' },
  { key: 'updatedAt', label: 'Last Updated', width: 20, type: 'date' },
]

export const CLOUDTRAIL_COLUMNS: DatasetColumnConfig[] = [
  { key: 'accountName', label: 'Account', width: 25 },
  { key: 'eventTime', label: 'Event Time', width: 20, type: 'date' },
  { key: 'eventName', label: 'Event Name', width: 30 },
  { key: 'eventType', label: 'Event Type', width: 18 },
  { key: 'eventSource', label: 'Service', width: 25 },
  { key: 'userIdentityUserName', label: 'User/Role', width: 30 },
  { key: 'userIdentityType', label: 'Identity Type', width: 15 },
  { key: 'sourceIPAddress', label: 'Source IP', width: 18 },
  { key: 'readOnly', label: 'Read Only', width: 12, type: 'boolean' },
  { key: 'errorCode', label: 'Error Code', width: 20 },
  { key: 'region', label: 'Region', width: 15 },
]

export const ENTRA_USERS_COLUMNS: DatasetColumnConfig[] = [
  { key: 'displayName', label: 'Display Name', width: 30 },
  { key: 'email', label: 'Email', width: 35 },
  { key: 'userPrincipalName', label: 'Principal Name', width: 35 },
  { key: 'accountName', label: 'Account', width: 25 },
  { key: 'role', label: 'Role', width: 25 },
  { key: 'groupName', label: 'Group Name', width: 35 },
  { key: 'department', label: 'Department', width: 20 },
  { key: 'jobTitle', label: 'Job Title', width: 25 },
  { key: 'lastSignIn', label: 'Last Sign-In', width: 20, type: 'date' },
  { key: 'manager', label: 'Manager', width: 25 },
]
