/**
 * Security Dashboard Type Definitions
 *
 * Types for the security ops dashboards - account-level security tab,
 * organization security health page, and dashboard widget.
 */

import type { FindingSeverity, WorkflowStatus, ComplianceStatus } from './security-hub'

// ============================================================================
// Account-Level Security Summary
// ============================================================================

export interface AccountSecuritySummary {
  accountId: string
  accountName: string
  environment: 'commercial' | 'govcloud'
  riskScore: number
  riskLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'MINIMAL'
  totalFindings: number
  severityBreakdown: Record<FindingSeverity, number>
  findingsByProduct: Record<string, number>
  compliance: {
    passed: number
    failed: number
    warning: number
    notAvailable: number
    passRate: number
  }
  topFindings: SecurityFindingSummary[]
  recommendations: string[]
  lastUpdated: string
}

// ============================================================================
// Organization-Level Security Summary
// ============================================================================

export interface OrgSecuritySummary {
  totalFindings: number
  totalAccounts: number
  accountsAtRisk: number
  orgRiskScore: number
  complianceRate: number
  severityBreakdown: Record<FindingSeverity, number>
  findingsByProduct: Record<string, number>
  accountRiskRanking: AccountRiskEntry[]
  topFindings: SecurityFindingSummary[]
  lastUpdated: string
  // Extended analysis data (populated when available)
  findingsByRegion?: Record<string, number>
  findingsTrend?: FindingsTrendPoint[]
  severityByProduct?: SeverityByProductEntry[]
  findingAgeBuckets?: FindingAgeBuckets
}

/** Weekly time-series data point for findings trend */
export interface FindingsTrendPoint {
  week: string // ISO date of the week start (Monday)
  critical: number
  high: number
  medium: number
  low: number
  informational: number
  total: number
}

/** Severity breakdown for a single product — used in the severity x product heatmap */
export interface SeverityByProductEntry {
  product: string
  critical: number
  high: number
  medium: number
  low: number
  informational: number
  total: number
}

/** How long active findings have been open */
export interface FindingAgeBuckets {
  under7Days: number
  under30Days: number
  under90Days: number
  over90Days: number
}

// ============================================================================
// Per-Account Risk Ranking Entry
// ============================================================================

export interface AccountRiskEntry {
  accountId: string
  accountName: string
  riskScore: number
  riskLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'MINIMAL'
  totalFindings: number
  criticalCount: number
  highCount: number
}

// ============================================================================
// Simplified Finding for Display
// ============================================================================

export interface SecurityFindingSummary {
  id: string
  title: string
  severity: FindingSeverity
  workflowStatus: WorkflowStatus
  productName: string
  resourceType: string
  resourceId: string
  accountId: string
  accountName: string
  region: string
  complianceStatus?: ComplianceStatus
  recommendation?: string
  remediationUrl?: string
  createdAt: string
  updatedAt: string
}
