/**
 * Pipeline Types - Shared between frontend and backend
 * GitLab pipeline telemetry data from Athena
 */

// GitLab repository information parsed from job_url
export interface GitLabRepoInfo {
  group: string // Nested group path (e.g., "GDMSCloud/aws/terraform")
  project: string // Project/repository name - last segment of path (e.g., "aws-account-orchestrator")
  fullPath: string // Full path: group/project (e.g., "GDMSCloud/aws/terraform/aws-account-orchestrator")
  jobId: string // GitLab job ID
  url: string // Original job URL
}

// Individual pipeline run from pipeline_runs table
export interface PipelineRun {
  pipeline_id: string
  job_id: string
  job_name: string
  job_url: string
  job_stage: string
  timestamp_start: string
  timestamp_end: string
  duration_total_seconds: number
  status: string
  account_count: number
  accounts_processed: string[]
  commit_author: string
  terraform_version: string
  // Optional parsed repository info (added client-side)
  repository?: GitLabRepoInfo
}

// Account plan from account_plans table
export interface AccountPlan {
  account_id: string
  account_name: string
  plan_created_at: string
  plan_pipeline_id: string
  changes_create: number
  changes_update: number
  changes_destroy: number
  changes_total: number
  plan_status: string
  applied_at?: string
}

// Resource change from resource_changes table
export interface ResourceChange {
  account_id: string
  resource_address: string
  resource_type: string
  module_name: string
  change_action: string
  applied: boolean
  apply_success: boolean
  timestamp: string
}

// Error detail from error_details table
export interface ErrorDetail {
  pipeline_id: string
  account_id: string
  timestamp: string
  error_phase: string
  error_category: string
  error_severity: string
  error_message: string
  error_resource_type?: string
}

// Account-specific pipeline summary
export interface PipelineSummary {
  totalRuns: number
  successfulRuns: number
  failedRuns: number
  avgDurationSeconds: number
  totalChanges: number
  // Account-level metrics derived from account_plans
  successfulAccounts: number
  failedAccounts: number
  accountSuccessRate: number
  resourceBreakdown: Array<{
    resourceAddress: string
    resourceType: string
    action: string
    count: number
  }>
  errorBreakdown: Array<{
    category: string
    count: number
  }>
  recentRuns: PipelineRun[]
  // Total counts so UI knows full data extent
  totalRecentRuns: number
  totalResourceTypes: number
  totalErrors: number
}

// Organization-wide pipeline summary (all accounts)
export interface OrganizationPipelineSummary {
  totalRuns: number
  successfulRuns: number
  failedRuns: number
  successRate: number // Percentage
  avgDurationSeconds: number
  totalChanges: number
  totalAccounts: number // Number of accounts with pipeline activity
  activeRepositories: number // Number of unique repositories
  deploymentFrequency: number // Average deploys per day
  meanTimeToRecover: number // Average hours from failure to success
  changeFailureRate: number // Percentage of failed deployments
  dateRange: {
    start: string
    end: string
  }
  // Top-level breakdowns
  accountBreakdown: Array<{
    accountId: string
    accountName: string
    totalRuns: number
    successRate: number
    avgDuration: number
    lastRun: string
  }>
  resourceBreakdown: Array<{
    resourceAddress: string
    resourceType: string
    action: string
    count: number
  }>
  errorBreakdown: Array<{
    category: string
    count: number
  }>
}

// Repository-level metrics
export interface RepositoryMetrics {
  repository: GitLabRepoInfo
  accounts: string[] // Account IDs that use this repository
  accountNames: string[] // Account names for display
  totalRuns: number
  successfulRuns: number
  failedRuns: number
  successRate: number // Percentage
  avgDurationSeconds: number
  lastRun: string // ISO timestamp
  deploymentFrequency: number // Deploys per day
  recentRuns: PipelineRun[] // Most recent runs
}

// Heat map data point for activity visualization
export interface HeatMapDataPoint {
  date: string // ISO date string
  hour?: number // Hour of day (0-23) for hourly granularity
  dayOfWeek?: number // Day of week (0=Sunday, 6=Saturday)
  count: number // Total pipeline runs in this slot
  successCount: number // Successful runs
  failureCount: number // Failed runs
}

// Daily metrics for trend analysis
export interface DailyPipelineMetrics {
  date: string // ISO date string
  total: number // Total runs
  successful: number // Successful runs
  failed: number // Failed runs
  successRate: number // Calculated percentage
}

// DORA metrics (DevOps Research and Assessment)
export interface DORAMetrics {
  deploymentFrequency: {
    value: number // Deploys per day
    rating: 'elite' | 'high' | 'medium' | 'low'
  }
  leadTimeForChanges: {
    value: number // Hours from commit to deploy
    rating: 'elite' | 'high' | 'medium' | 'low'
  }
  meanTimeToRecover: {
    value: number // Hours from failure to recovery
    rating: 'elite' | 'high' | 'medium' | 'low'
  }
  changeFailureRate: {
    value: number // Percentage of failed deployments
    rating: 'elite' | 'high' | 'medium' | 'low'
  }
  dateRange: {
    start: string
    end: string
  }
}

// Pipeline environment configuration
export interface PipelineEnvironmentConfig {
  region: string
  database: string
  athenaResultsBucket: string
  accountId: string
}

// Author information parsed from commit_author field
export interface AuthorInfo {
  name: string
  email: string
  displayName: string
  raw: string
}

// Author-level metrics
export interface PipelineAuthorMetrics {
  commit_author: string // Raw author string from database
  author_name: string // Parsed name
  author_email: string // Parsed email
  author_display: string // Display name
  author_raw: string // Full raw author string
  total_runs: number
  successful_runs: number
  failed_runs: number
  success_rate: number // Percentage
  total_accounts: number
  last_run: string // ISO timestamp
}

// Author summary with detailed metrics
export interface AuthorSummary {
  total_runs: number
  successful_runs: number
  failed_runs: number
  success_rate: number
  avg_duration: number
  total_accounts: number
  unique_accounts: number
  repositories: string[]
}

// --- Pipeline Analytics Enhancement Types ---

// Resource search result row
export interface ResourceSearchResult {
  account_id: string
  resource_address: string
  resource_type: string
  module_name: string
  change_action: string
  applied: boolean
  apply_success: boolean
  timestamp: string
  plan_pipeline_id: string
}

// Cross-account resource deployment status
export interface ResourceDeploymentStatus {
  account_id: string
  account_name?: string
  latest_action: string
  latest_applied: boolean
  latest_apply_success: boolean
  total_attempts: number
  last_seen: string
}

// Planned vs Applied drift summary
export interface PlannedVsAppliedSummary {
  totalPlanned: number
  totalApplied: number
  totalFailed: number
  totalPending: number
  byResourceType: Array<{
    resource_type: string
    planned: number
    applied: number
    failed: number
    pending: number
  }>
}

// Unapplied resource detail
export interface UnappliedResource {
  resource_address: string
  resource_type: string
  module_name: string
  change_action: string
  plan_pipeline_id: string
  latest_timestamp: string
  occurrence_count: number
}

// Recurring error pattern (grouped errors)
export interface RecurringErrorPattern {
  error_category: string
  error_message: string
  error_severity: string
  occurrence_count: number
  first_seen: string
  last_seen: string
  affected_pipelines: number
}

// Cross-account error comparison result
export interface CrossAccountError {
  account_id: string
  account_name?: string
  occurrence_count: number
  last_seen: string
}

// Account deployment health score and factors
export interface AccountDeploymentHealth {
  healthScore: number // 0-100
  healthRating: 'healthy' | 'warning' | 'critical' | 'unknown'
  factors: {
    latestPipelineStatus: string
    planSuccessRate: number
    recurringErrorCount: number
    unappliedResourceCount: number
  }
  recurringErrors: RecurringErrorPattern[]
}

// Parsed resource from Terraform state file
export interface TerraformStateResource {
  type: string
  name: string
  module: string
  address: string
  provider: string
  instances_count: number
}

// Result of state-vs-planned comparison
export interface StateComparison {
  inStateOnly: TerraformStateResource[]
  inPlanOnly: Array<{
    resource_address: string
    resource_type: string
    change_action: string
    timestamp: string
  }>
  matched: Array<{
    address: string
    type: string
    inState: boolean
    inPlan: boolean
  }>
  stateResourceCount: number
  planResourceCount: number
}
