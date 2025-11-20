/**
 * AWS Security Hub Type Definitions
 *
 * Types for AWS Security Hub integration - security findings,
 * compliance standards, and vulnerability management.
 */

// ============================================================================
// Severity Types
// ============================================================================

/**
 * Finding severity levels
 */
export type FindingSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFORMATIONAL'

/**
 * Normalized severity with score
 */
export interface Severity {
  /**
   * Severity label
   */
  label: FindingSeverity

  /**
   * Normalized severity score (0-100)
   * 0.0: INFORMATIONAL
   * 1-39: LOW
   * 40-69: MEDIUM
   * 70-89: HIGH
   * 90-100: CRITICAL
   */
  normalized: number

  /**
   * Product-specific severity (optional)
   */
  product?: number

  /**
   * Original severity from finding provider
   */
  original?: string
}

// ============================================================================
// Workflow Status Types
// ============================================================================

/**
 * Finding workflow status
 */
export type WorkflowStatus = 'NEW' | 'NOTIFIED' | 'RESOLVED' | 'SUPPRESSED'

/**
 * Record status (finding lifecycle)
 */
export type RecordState = 'ACTIVE' | 'ARCHIVED'

/**
 * Compliance status
 */
export type ComplianceStatus = 'PASSED' | 'FAILED' | 'WARNING' | 'NOT_AVAILABLE'

// ============================================================================
// Finding Types
// ============================================================================

/**
 * Complete Security Hub finding structure
 */
export interface SecurityHubFinding {
  // Identifiers
  schemaVersion: string
  id: string  // Finding ID (unique per account/region)
  productArn: string
  productName?: string
  companyName?: string
  region: string
  generatorId: string
  awsAccountId: string

  // Classification
  types: string[]  // Finding types (e.g., 'Software and Configuration Checks/AWS Security Best Practices')
  firstObservedAt: string  // ISO 8601
  lastObservedAt: string
  createdAt: string
  updatedAt: string

  // Severity
  severity: Severity
  criticality?: number  // Deprecated, use severity.normalized

  // Status
  recordState: RecordState
  workflowState?: 'NEW' | 'ASSIGNED' | 'IN_PROGRESS' | 'DEFERRED' | 'RESOLVED'  // Deprecated
  workflow?: {
    status: WorkflowStatus
  }

  // Content
  title: string
  description: string
  remediation?: {
    recommendation?: {
      text?: string
      url?: string
    }
  }

  // Compliance
  compliance?: {
    status?: ComplianceStatus
    relatedRequirements?: string[]  // Control IDs
    statusReasons?: Array<{
      reasonCode: string
      description?: string
    }>
  }

  // Resources
  resources: Array<{
    type: string
    id: string
    partition?: 'aws' | 'aws-cn' | 'aws-us-gov'
    region?: string
    resourceRole?: string
    tags?: Record<string, string>
    details?: Record<string, any>
  }>

  // Network
  network?: {
    direction?: 'IN' | 'OUT'
    protocol?: string
    openPortRange?: {
      begin?: number
      end?: number
    }
    sourceDomain?: string
    sourceIpV4?: string
    sourceIpV6?: string
    sourcePort?: number
    sourceMac?: string
    destinationDomain?: string
    destinationIpV4?: string
    destinationIpV6?: string
    destinationPort?: number
  }

  // Process
  process?: {
    name?: string
    path?: string
    pid?: number
    parentPid?: number
    launchedAt?: string
    terminatedAt?: string
  }

  // Threat Intelligence
  threatIntelIndicators?: Array<{
    type?: 'DOMAIN' | 'EMAIL_ADDRESS' | 'HASH_MD5' | 'HASH_SHA1' | 'HASH_SHA256' | 'HASH_SHA512' | 'IPV4_ADDRESS' | 'IPV6_ADDRESS' | 'MUTEX' | 'PROCESS' | 'URL'
    value?: string
    category?: 'BACKDOOR' | 'CARD_STEALER' | 'COMMAND_AND_CONTROL' | 'DROP_SITE' | 'EXPLOIT_SITE' | 'KEYLOGGER'
    lastObservedAt?: string
    source?: string
    sourceUrl?: string
  }>

  // Vulnerabilities
  vulnerabilities?: Array<{
    id: string  // CVE ID
    vulnerablePackages?: Array<{
      name?: string
      version?: string
      epoch?: string
      release?: string
      architecture?: string
      packageManager?: string
      filePath?: string
      fixedInVersion?: string
    }>
    cvss?: Array<{
      version?: string
      baseScore?: number
      baseVector?: string
      source?: string
    }>
    relatedVulnerabilities?: string[]
    vendor?: {
      name?: string
      url?: string
      vendorSeverity?: string
      vendorCreatedAt?: string
      vendorUpdatedAt?: string
    }
    referenceUrls?: string[]
  }>

  // Malware
  malware?: Array<{
    name?: string
    type?: 'ADWARE' | 'BLENDED_THREAT' | 'BOTNET_AGENT' | 'COIN_MINER' | 'EXPLOIT_KIT' | 'KEYLOGGER' | 'MACRO' | 'POTENTIALLY_UNWANTED' | 'SPYWARE' | 'RANSOMWARE' | 'REMOTE_ACCESS' | 'ROOTKIT' | 'TROJAN' | 'VIRUS' | 'WORM'
    path?: string
    state?: 'OBSERVED' | 'REMOVAL_FAILED' | 'REMOVED'
  }>

  // User-defined fields
  userDefinedFields?: Record<string, string>

  // Additional metadata
  note?: {
    text: string
    updatedBy: string
    updatedAt: string
  }

  // Product-specific fields
  productFields?: Record<string, string>

  // Source URL (link to finding in provider console)
  sourceUrl?: string

  // Action
  action?: {
    actionType?: string
    networkConnectionAction?: {
      connectionDirection?: 'IN' | 'OUT'
      remoteIpDetails?: {
        ipAddressV4?: string
        organization?: {
          asn?: number
          asnOrg?: string
          isp?: string
          org?: string
        }
        country?: {
          countryCode?: string
          countryName?: string
        }
        city?: {
          cityName?: string
        }
        geoLocation?: {
          lon?: number
          lat?: number
        }
      }
      remotePortDetails?: {
        port?: number
        portName?: string
      }
      localPortDetails?: {
        port?: number
        portName?: string
      }
      protocol?: string
      blocked?: boolean
    }
    awsApiCallAction?: {
      api?: string
      serviceName?: string
      callerType?: string
      remoteIpDetails?: Record<string, any>
      domainDetails?: {
        domain?: string
      }
      affectedResources?: Record<string, string>
      firstSeen?: string
      lastSeen?: string
    }
    dnsRequestAction?: {
      domain?: string
      protocol?: string
      blocked?: boolean
    }
    portProbeAction?: {
      portProbeDetails?: Array<{
        localPortDetails?: {
          port?: number
          portName?: string
        }
        localIpDetails?: {
          ipAddressV4?: string
        }
        remoteIpDetails?: Record<string, any>
      }>
      blocked?: boolean
    }
  }
}

// ============================================================================
// Product Integrations
// ============================================================================

/**
 * Common Security Hub product integrations
 */
export const SECURITY_HUB_PRODUCTS = {
  // AWS native services
  GUARDDUTY: 'GuardDuty',
  INSPECTOR: 'Inspector',
  MACIE: 'Macie',
  FIREWALL_MANAGER: 'Firewall Manager',
  IAM_ACCESS_ANALYZER: 'IAM Access Analyzer',
  SYSTEMS_MANAGER: 'Systems Manager Patch Manager',
  HEALTH: 'AWS Health',
  DETECTIVE: 'Detective',

  // Security Hub built-in checks
  SECURITY_HUB: 'Security Hub',

  // Third-party integrations (examples)
  PROWLER: 'Prowler',
  CLOUD_CUSTODIAN: 'Cloud Custodian',
  PALO_ALTO: 'Palo Alto Networks',
  TREND_MICRO: 'Trend Micro',
  CROWDSTRIKE: 'CrowdStrike',
  CHECKPOINT: 'Check Point',
} as const

// ============================================================================
// Compliance Standards
// ============================================================================

/**
 * Security Hub compliance standards
 */
export const COMPLIANCE_STANDARDS = {
  // AWS standards
  AWS_FOUNDATIONAL: 'aws-foundational-security-best-practices',
  CIS_AWS_120: 'cis-aws-foundations-benchmark/v/1.2.0',
  CIS_AWS_140: 'cis-aws-foundations-benchmark/v/1.4.0',
  PCI_DSS: 'pci-dss',

  // Government standards
  NIST_800_53_REV5: 'nist-800-53/v/5.0.0',
  NIST_CSF: 'nist-csf',
  CMMC_1_02: 'cmmc/v/1.02',

  // Industry standards
  ISO_27001: 'iso27001',
  HIPAA: 'hipaa-final-omnibus-security-rule',
} as const

/**
 * Compliance standard metadata
 */
export interface ComplianceStandard {
  standardsSubscriptionArn: string
  standardsArn: string
  standardsName: string
  standardsStatus: 'PENDING' | 'READY' | 'FAILED' | 'DELETING' | 'INCOMPLETE'
  standardsControlCount?: number
}

/**
 * Compliance control
 */
export interface StandardsControl {
  standardsControlArn: string
  controlId: string
  controlStatus: 'ENABLED' | 'DISABLED'
  disabledReason?: string
  title: string
  description: string
  remediationUrl?: string
  severityRating: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  relatedRequirements?: string[]
  controlStatusUpdatedAt?: string
}

// ============================================================================
// Insights
// ============================================================================

/**
 * Security Hub insight (saved filter/query)
 */
export interface Insight {
  insightArn: string
  name: string
  filters: InsightFilters
  groupByAttribute: string
}

/**
 * Insight filters (same structure as finding filters)
 */
export interface InsightFilters {
  productArn?: Array<{ value: string; comparison: 'EQUALS' | 'PREFIX' | 'NOT_EQUALS' }>
  awsAccountId?: Array<{ value: string; comparison: 'EQUALS' | 'PREFIX' }>
  region?: Array<{ value: string; comparison: 'EQUALS' | 'PREFIX' }>
  type?: Array<{ value: string; comparison: 'EQUALS' | 'PREFIX' }>
  firstObservedAt?: Array<{ start?: string; end?: string; dateRange?: { value: number; unit: 'DAYS' } }>
  lastObservedAt?: Array<{ start?: string; end?: string; dateRange?: { value: number; unit: 'DAYS' } }>
  createdAt?: Array<{ start?: string; end?: string; dateRange?: { value: number; unit: 'DAYS' } }>
  updatedAt?: Array<{ start?: string; end?: string; dateRange?: { value: number; unit: 'DAYS' } }>
  severityLabel?: Array<{ value: FindingSeverity; comparison: 'EQUALS' }>
  confidence?: Array<{ gte?: number; lte?: number; eq?: number }>
  criticality?: Array<{ gte?: number; lte?: number; eq?: number }>
  title?: Array<{ value: string; comparison: 'EQUALS' | 'PREFIX' | 'CONTAINS' }>
  description?: Array<{ value: string; comparison: 'EQUALS' | 'PREFIX' | 'CONTAINS' }>
  sourceUrl?: Array<{ value: string; comparison: 'EQUALS' | 'PREFIX' | 'CONTAINS' }>
  resourceType?: Array<{ value: string; comparison: 'EQUALS' | 'PREFIX' }>
  resourceId?: Array<{ value: string; comparison: 'EQUALS' | 'PREFIX' }>
  workflowStatus?: Array<{ value: WorkflowStatus; comparison: 'EQUALS' }>
  recordState?: Array<{ value: RecordState; comparison: 'EQUALS' }>
  complianceStatus?: Array<{ value: ComplianceStatus; comparison: 'EQUALS' }>
  verificationState?: Array<{ value: 'UNKNOWN' | 'TRUE_POSITIVE' | 'FALSE_POSITIVE' | 'BENIGN_POSITIVE'; comparison: 'EQUALS' }>
  resourceTags?: Array<{ key: string; value: string; comparison: 'EQUALS' }>
  keyword?: Array<{ value: string }>
}

// ============================================================================
// Aggregation Types
// ============================================================================

/**
 * Finding aggregation result
 */
export interface FindingAggregation {
  groupByAttribute: string
  results: Array<{
    groupByAttributeValue: string
    count: number
  }>
}

/**
 * Finding statistics
 */
export interface FindingStatistics {
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
  findingsByComplianceStatus: {
    passed: number
    failed: number
    warning: number
    notAvailable: number
  }
  findingsByProduct: Record<string, number>
  findingsByResourceType: Record<string, number>
  findingsByType: Record<string, number>
}

// ============================================================================
// Common Finding Types
// ============================================================================

/**
 * Common Security Hub finding types (taxonomy)
 */
export const FINDING_TYPES = {
  // Software and Configuration Checks
  SECURITY_BEST_PRACTICES: 'Software and Configuration Checks/AWS Security Best Practices',
  VULNERABILITIES_CVE: 'Software and Configuration Checks/Vulnerabilities/CVE',
  INDUSTRY_POLICY_COMPLIANCE: 'Software and Configuration Checks/Industry and Regulatory Standards',

  // TTPs (Tactics, Techniques, and Procedures)
  TTP_INITIAL_ACCESS: 'TTPs/Initial Access',
  TTP_EXECUTION: 'TTPs/Execution',
  TTP_PERSISTENCE: 'TTPs/Persistence',
  TTP_PRIVILEGE_ESCALATION: 'TTPs/Privilege Escalation',
  TTP_DEFENSE_EVASION: 'TTPs/Defense Evasion',
  TTP_CREDENTIAL_ACCESS: 'TTPs/Credential Access',
  TTP_DISCOVERY: 'TTPs/Discovery',
  TTP_LATERAL_MOVEMENT: 'TTPs/Lateral Movement',
  TTP_COLLECTION: 'TTPs/Collection',
  TTP_EXFILTRATION: 'TTPs/Exfiltration',
  TTP_COMMAND_AND_CONTROL: 'TTPs/Command and Control',
  TTP_IMPACT: 'TTPs/Impact',

  // Effects
  EFFECT_DATA_EXPOSURE: 'Effects/Data Exposure',
  EFFECT_DATA_EXFILTRATION: 'Effects/Data Exfiltration',
  EFFECT_DATA_DESTRUCTION: 'Effects/Data Destruction',
  EFFECT_DENIAL_OF_SERVICE: 'Effects/Denial of Service',
  EFFECT_RESOURCE_CONSUMPTION: 'Effects/Resource Consumption',

  // Unusual Behaviors
  UNUSUAL_BEHAVIOR: 'Unusual Behaviors',
  UNUSUAL_API_CALL: 'Unusual Behaviors/API Call',
  UNUSUAL_NETWORK_TRAFFIC: 'Unusual Behaviors/Network Traffic',
  UNUSUAL_USER_ACTIVITY: 'Unusual Behaviors/User',

  // Sensitive Data
  SENSITIVE_DATA: 'Sensitive Data Identifications',
  PII: 'Sensitive Data Identifications/PII',
  FINANCIAL: 'Sensitive Data Identifications/Financial',
} as const

// ============================================================================
// Batch Operations
// ============================================================================

/**
 * Batch update findings request
 */
export interface BatchUpdateFindingsRequest {
  findingIdentifiers: Array<{
    id: string
    productArn: string
  }>
  workflow?: {
    status: WorkflowStatus
  }
  note?: {
    text: string
    updatedBy: string
  }
  severity?: {
    label?: FindingSeverity
    normalized?: number
  }
  verificationState?: 'UNKNOWN' | 'TRUE_POSITIVE' | 'FALSE_POSITIVE' | 'BENIGN_POSITIVE'
  confidence?: number
  criticality?: number
  types?: string[]
  userDefinedFields?: Record<string, string>
}

/**
 * Batch import findings (for custom integrations)
 */
export interface BatchImportFindingsRequest {
  findings: SecurityHubFinding[]
}
