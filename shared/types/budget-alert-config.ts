/**
 * Budget Alert Configuration Types
 *
 * Types for the budget-alert-config DynamoDB table that stores
 * alert system configuration. Models the configuration schema
 * documented in docs/alert_guide.md.
 *
 * Table Structure:
 * - Partition Key: config_scope (GLOBAL or AWS account ID)
 * - Sort Key: config_section ({section}#{key} format)
 * - GSI: section-type-index (section_type + updated_at)
 */

import type { BudgetAlertLevel } from './budget-alerts'

// -----------------------------------------------------------------------------
// Base Types
// -----------------------------------------------------------------------------

/**
 * Common metadata fields present on all config items
 */
export interface ConfigItemBase {
  /** Partition key - 'GLOBAL' for global settings, or AWS account ID for per-account overrides */
  config_scope: string
  /** Sort key - Hierarchical identifier in format '{section}#{key}' */
  config_section: string
  /** Type discriminator for GSI queries (e.g., 'settings', 'alerts', 'recipients_by_type') */
  section_type: ConfigSectionType
  /** Schema version for migrations */
  version?: number
  /** ISO 8601 timestamp of last update */
  updated_at?: string
  /** Email or identifier of person/system making the change */
  updated_by?: string
}

/**
 * All possible section types for GSI queries
 */
export type ConfigSectionType =
  | 'settings'
  | 'alerts'
  | 'recipients_by_type'
  | 'static_recipients'
  | 'lob_recipients'
  | 'custom_recipients'
  | 'threshold_scaling'
  | 'pace_alerting'
  | 'ml_config'
  | 'dry_run'
  | 'theme'
  | 'anomaly_detection'
  | 'standalone_anomaly_alerts'

/**
 * Alert types for recipient routing
 * - FORECAST: Projected overspend based on ML forecast (has severity levels)
 * - ACTUAL: Budget already exceeded (has severity levels)
 * - MONTHLY: Monthly summary reports (flat, no severity levels)
 * - ANOMALY: Cost anomaly alerts (flat, no severity levels)
 */
export type RecipientAlertType = 'FORECAST' | 'ACTUAL' | 'MONTHLY' | 'ANOMALY'

/**
 * Conditional recipient - included only when conditions are met
 */
export interface ConditionalRecipient {
  /** Role name to include */
  role: string
  /** Minimum overage amount to include this recipient */
  min_overage_dollars: number
}

// -----------------------------------------------------------------------------
// Settings Configuration (settings#main)
// -----------------------------------------------------------------------------

/**
 * Core system settings for email delivery, timezone, and business hours
 *
 * Key: config_scope=GLOBAL, config_section=settings#main
 */
export interface SettingsConfig extends ConfigItemBase {
  section_type: 'settings'
  /** Domain appended to role names for email resolution (e.g., 'gd-ms.com') */
  email_domain: string
  /** Sender email address for alerts */
  from_email: string
  /** Display name for sender */
  from_name?: string
  /** Timezone for business hours and timestamps (e.g., 'America/New_York') */
  timezone?: string
  /** Minimum hours between duplicate alerts (legacy, use per-level intervals instead) */
  cooldown_hours?: number
  /** Minimum budget to trigger alerts ($) */
  min_budget?: number
  /** Business hours start (24-hour format, 0-23) */
  business_hours_start?: number
  /** Business hours end (24-hour format, 0-23) */
  business_hours_end?: number
  /** URL template for deep-linking to account details. Use {account_id} placeholder */
  ghost_url_template?: string
  /** DynamoDB table name for account metadata */
  accounts_table?: string
}

// -----------------------------------------------------------------------------
// Alert Levels Configuration (alerts#{LEVEL})
// -----------------------------------------------------------------------------

/**
 * Configuration for a single alert severity level
 *
 * Key: config_scope=GLOBAL, config_section=alerts#{INFO|WARNING|CRITICAL|ESCALATION}
 */
export interface AlertLevelConfig extends ConfigItemBase {
  section_type: 'alerts'
  /** Alert level name */
  level: BudgetAlertLevel
  /** Burn rate percentage to trigger this level (e.g., 115 = 15% over pace) */
  threshold: number
  /** Hex color for email styling (e.g., '#17a2b8') */
  color: string
  /** Minimum $ over budget to trigger (prevents alerts for tiny amounts) */
  min_dollars?: number
  /** Maximum alerts of this level per account per month */
  max_per_month?: number
  /** Days between consecutive alerts. intervals[0] = days to 2nd alert, etc. */
  intervals?: number[]
}

// -----------------------------------------------------------------------------
// Recipients by Type Configuration (recipients_by_type#{TYPE}#{LEVEL} or recipients_by_type#{TYPE})
// -----------------------------------------------------------------------------

/**
 * Email recipients organized by alert type and severity level.
 * FORECAST and ACTUAL alerts have severity levels, MONTHLY and ANOMALY are flat.
 *
 * Keys:
 * - With severity levels: config_section=recipients_by_type#{FORECAST|ACTUAL}#{INFO|WARNING|CRITICAL|ESCALATION}
 * - Flat (no levels): config_section=recipients_by_type#{MONTHLY|ANOMALY}
 */
export interface RecipientsByTypeConfig extends ConfigItemBase {
  section_type: 'recipients_by_type'
  /** Alert type (FORECAST, ACTUAL, MONTHLY, or ANOMALY) */
  alert_type: RecipientAlertType
  /** Severity level name (only for FORECAST and ACTUAL) */
  level?: BudgetAlertLevel
  /** Primary recipients (role names or emails) */
  to: string[]
  /** CC recipients (role names or emails) */
  cc?: string[]
  /** If true, completely replace with custom recipients */
  override?: boolean
  /** Recipients included only when conditions are met */
  conditional_to?: ConditionalRecipient[]
  /** CC recipients included only when conditions are met */
  conditional_cc?: ConditionalRecipient[]
}

/**
 * @deprecated Use RecipientsByTypeConfig instead - old format for backwards compatibility
 * Email recipients for a specific alert level
 *
 * Key: config_scope=GLOBAL, config_section=recipients#{INFO|WARNING|CRITICAL|ESCALATION}
 */
export interface RecipientsConfig extends ConfigItemBase {
  section_type: 'recipients_by_type'
  /** Alert level name */
  level: BudgetAlertLevel
  /** Primary recipients (role names or emails) */
  to: string[]
  /** CC recipients (role names or emails) */
  cc?: string[]
  /** If true, completely replace (not merge) with custom recipients */
  override?: boolean
}

// -----------------------------------------------------------------------------
// Static Recipients Configuration (static_recipients#main)
// -----------------------------------------------------------------------------

/**
 * Direct email mappings for role names that don't come from account metadata
 *
 * Key: config_scope=GLOBAL, config_section=static_recipients#main
 */
export interface StaticRecipientsConfig extends ConfigItemBase {
  section_type: 'static_recipients'
  /** Key-value pairs of role name to email address */
  mappings: Record<string, string>
}

// -----------------------------------------------------------------------------
// LOB Recipients Configuration (lob_recipients#{LOB_NAME})
// -----------------------------------------------------------------------------

/**
 * Recipient configuration for a specific alert type and level
 */
export interface RecipientTypeConfig {
  /** Primary recipients (role names or emails) */
  to?: string[]
  /** CC recipients (role names or emails) */
  cc?: string[]
}

/**
 * Recipients organized by alert type with severity levels
 * FORECAST and ACTUAL have level-specific configs, MONTHLY and ANOMALY are flat
 */
export interface RecipientsByTypeStructure {
  /** FORECAST alert recipients by level */
  FORECAST?: Partial<Record<BudgetAlertLevel, RecipientTypeConfig>>
  /** ACTUAL alert recipients by level */
  ACTUAL?: Partial<Record<BudgetAlertLevel, RecipientTypeConfig>>
  /** MONTHLY report recipients (flat, no levels) */
  MONTHLY?: RecipientTypeConfig
  /** ANOMALY alert recipients (flat, no levels) */
  ANOMALY?: RecipientTypeConfig
}

/**
 * Custom recipients for a specific Line of Business
 * Supports two modes:
 * 1. Flat structure: Same recipients for all alert types (uses to/cc)
 * 2. Type-specific structure: Different recipients per alert type (uses by_type)
 *
 * Key: config_scope=GLOBAL, config_section=lob_recipients#{LOB_NAME}
 */
export interface LobRecipientsConfig extends ConfigItemBase {
  section_type: 'lob_recipients'
  /** Line of Business name (must match account metadata) */
  lob_name: string
  /** Additional TO recipients (flat mode - applies to all alert types) */
  to?: string[]
  /** Additional CC recipients (flat mode - applies to all alert types) */
  cc?: string[]
  /** If true, completely replace default recipients */
  override?: boolean
  /** Type-specific recipients structure (overrides flat to/cc if present) */
  by_type?: RecipientsByTypeStructure
}

// -----------------------------------------------------------------------------
// Account Recipients Configuration (custom_recipients#main)
// -----------------------------------------------------------------------------

/**
 * Custom recipients for a specific AWS account
 * Stored with account ID as partition key
 * Supports two modes:
 * 1. Flat structure: Same recipients for all alert types (uses to/cc)
 * 2. Type-specific structure: Different recipients per alert type (uses by_type)
 *
 * Key: config_scope={ACCOUNT_ID}, config_section=custom_recipients#main
 */
export interface AccountRecipientsConfig extends ConfigItemBase {
  section_type: 'custom_recipients'
  /** TO recipients for this account (flat mode - applies to all alert types) */
  to?: string[]
  /** CC recipients for this account (flat mode - applies to all alert types) */
  cc?: string[]
  /** If true, completely replace default and LOB recipients */
  override?: boolean
  /** Type-specific recipients structure (overrides flat to/cc if present) */
  by_type?: RecipientsByTypeStructure
}

// -----------------------------------------------------------------------------
// Threshold Scaling Configuration (threshold_scaling#main)
// -----------------------------------------------------------------------------

/**
 * Budget-based logarithmic scaling for alert thresholds
 * Larger budgets get tighter thresholds
 *
 * Key: config_scope=GLOBAL, config_section=threshold_scaling#main
 */
export interface ThresholdScalingConfig extends ConfigItemBase {
  section_type: 'threshold_scaling'
  /** Enable/disable threshold scaling */
  enabled?: boolean
  /** Budget where no scaling applied ($) */
  reference_budget?: number
  /** How aggressively thresholds tighten per log10 */
  scaling_factor?: number
  /** Floor - never alert below this percentage */
  min_threshold?: number
}

// -----------------------------------------------------------------------------
// Pace Alerting Configuration (pace_alerting#main)
// -----------------------------------------------------------------------------

/**
 * Pace milestone for predictive alerts before budget exceeded
 */
export interface PaceMilestone {
  /** Budget % consumed (e.g., 70, 95) */
  threshold: number
  /** Minimum pace ratio to trigger (e.g., 1.10 = 10% ahead) */
  pace_ratio: number
  /** Alert level to send */
  level: BudgetAlertLevel
}

/**
 * Minimum overspend thresholds for triggering alerts
 */
export interface MinimumOverspend {
  /** Minimum $ over budget */
  dollars: number
  /** Or minimum % of budget */
  percent_of_budget: number
}

/**
 * Configuration for ACTUAL alerts (when budget is exceeded)
 * Uses severity scoring based on overspend amount and time remaining
 *
 * Key: config_scope=GLOBAL, config_section=pace_alerting#main
 */
export interface PaceAlertingConfig extends ConfigItemBase {
  section_type: 'pace_alerting'
  /** Score ranges for each alert level */
  severity_thresholds?: Record<BudgetAlertLevel, number>
  /** Minimum overspend to trigger any alert */
  minimum_overspend?: MinimumOverspend
  /** Predictive milestone alerts before budget exceeded */
  milestones?: PaceMilestone[]
}

// -----------------------------------------------------------------------------
// ML Config (ml_config#main)
// -----------------------------------------------------------------------------

/**
 * Machine learning forecast configuration
 *
 * Key: config_scope=GLOBAL, config_section=ml_config#main
 */
export interface MlConfig extends ConfigItemBase {
  section_type: 'ml_config'
  /** Days to forecast ahead */
  forecast_days?: number
  /** Enable/disable ML forecasting */
  enabled?: boolean
}

// -----------------------------------------------------------------------------
// Dry Run Config (dry_run#main)
// -----------------------------------------------------------------------------

/**
 * Testing mode configuration
 * When enabled, all emails redirect to test addresses
 *
 * Key: config_scope=GLOBAL, config_section=dry_run#main
 */
export interface DryRunConfig extends ConfigItemBase {
  section_type: 'dry_run'
  /** Enable dry-run mode */
  enabled?: boolean
  /** Required when enabled. Test email addresses */
  email?: string[]
  /** Include debug information in test emails */
  include_debug_info?: boolean
  /** Show recipient resolution details */
  include_recipient_debug?: boolean
  /** Show alert evaluation details */
  include_evaluation_debug?: boolean
  /** Show configuration details */
  include_config_debug?: boolean
}

// -----------------------------------------------------------------------------
// Theme Colors Configuration (theme#colors)
// -----------------------------------------------------------------------------

/**
 * Email template color scheme
 *
 * Key: config_scope=GLOBAL, config_section=theme#colors
 */
export interface ThemeColorsConfig extends ConfigItemBase {
  section_type: 'theme'
  /** Key-value pairs of color names to hex values */
  colors: Record<string, string>
}

// -----------------------------------------------------------------------------
// Anomaly Detection Configuration (anomaly_detection#main)
// -----------------------------------------------------------------------------

/**
 * AWS Cost Anomaly Detection integration settings
 *
 * Key: config_scope=GLOBAL, config_section=anomaly_detection#main
 */
export interface AnomalyDetectionConfig extends ConfigItemBase {
  section_type: 'anomaly_detection'
  /** Enable anomaly detection */
  enabled?: boolean
  /** Minimum $ impact to report anomalies */
  min_impact_dollars?: number
  /** Days to look back for anomalies (max 90) */
  lookback_days?: number
  /** Include anomalies in monthly reports */
  include_in_monthly_report?: boolean
}

// -----------------------------------------------------------------------------
// Standalone Anomaly Alerts Configuration (standalone_anomaly_alerts#main)
// -----------------------------------------------------------------------------

/**
 * Recipients configuration for standalone anomaly alerts
 */
export interface AnomalyAlertRecipients {
  /** TO recipients for anomaly alerts */
  to?: string[]
  /** CC recipients for anomaly alerts */
  cc?: string[]
}

/**
 * Separate email alerts for cost anomalies (independent from budget alerts)
 *
 * Key: config_scope=GLOBAL, config_section=standalone_anomaly_alerts#main
 */
export interface StandaloneAnomalyAlertsConfig extends ConfigItemBase {
  section_type: 'standalone_anomaly_alerts'
  /** Enable standalone anomaly alerts */
  enabled?: boolean
  /** Minimum $ impact to trigger alert */
  min_impact_dollars?: number
  /** Minimum AWS anomaly score (0-100) */
  min_anomaly_score?: number
  /** Max anomaly alerts per account per month */
  max_per_month?: number
  /** Days between consecutive alerts */
  intervals?: number[]
  /** Custom recipients for anomaly alerts */
  recipients?: AnomalyAlertRecipients
}

// -----------------------------------------------------------------------------
// Union Types
// -----------------------------------------------------------------------------

/**
 * Union of all configuration item types
 * Used for queries that return mixed config items
 */
export type BudgetAlertConfigItem =
  | SettingsConfig
  | AlertLevelConfig
  | RecipientsByTypeConfig
  | RecipientsConfig // deprecated, kept for backwards compatibility
  | StaticRecipientsConfig
  | LobRecipientsConfig
  | AccountRecipientsConfig
  | ThresholdScalingConfig
  | PaceAlertingConfig
  | MlConfig
  | DryRunConfig
  | ThemeColorsConfig
  | AnomalyDetectionConfig
  | StandaloneAnomalyAlertsConfig

// -----------------------------------------------------------------------------
// Type Guards
// -----------------------------------------------------------------------------

/**
 * Type guard to check if config item is SettingsConfig
 */
export function isSettingsConfig(item: BudgetAlertConfigItem): item is SettingsConfig {
  return item.section_type === 'settings'
}

/**
 * Type guard to check if config item is AlertLevelConfig
 */
export function isAlertLevelConfig(item: BudgetAlertConfigItem): item is AlertLevelConfig {
  return item.section_type === 'alerts'
}

/**
 * Type guard to check if config item is RecipientsByTypeConfig
 */
export function isRecipientsByTypeConfig(item: BudgetAlertConfigItem): item is RecipientsByTypeConfig {
  return item.section_type === 'recipients_by_type' && 'alert_type' in item
}

/**
 * @deprecated Use isRecipientsByTypeConfig instead
 * Type guard to check if config item is RecipientsConfig (legacy format)
 */
export function isRecipientsConfig(item: BudgetAlertConfigItem): item is RecipientsConfig {
  return item.section_type === 'recipients_by_type' && !('alert_type' in item)
}

/**
 * Type guard to check if config item is StaticRecipientsConfig
 */
export function isStaticRecipientsConfig(item: BudgetAlertConfigItem): item is StaticRecipientsConfig {
  return item.section_type === 'static_recipients'
}

/**
 * Type guard to check if config item is LobRecipientsConfig
 */
export function isLobRecipientsConfig(item: BudgetAlertConfigItem): item is LobRecipientsConfig {
  return item.section_type === 'lob_recipients'
}

/**
 * Type guard to check if config item is AccountRecipientsConfig
 */
export function isAccountRecipientsConfig(item: BudgetAlertConfigItem): item is AccountRecipientsConfig {
  return item.section_type === 'custom_recipients'
}

/**
 * Type guard to check if config item is ThresholdScalingConfig
 */
export function isThresholdScalingConfig(item: BudgetAlertConfigItem): item is ThresholdScalingConfig {
  return item.section_type === 'threshold_scaling'
}

/**
 * Type guard to check if config item is PaceAlertingConfig
 */
export function isPaceAlertingConfig(item: BudgetAlertConfigItem): item is PaceAlertingConfig {
  return item.section_type === 'pace_alerting'
}

/**
 * Type guard to check if config item is MlConfig
 */
export function isMlConfig(item: BudgetAlertConfigItem): item is MlConfig {
  return item.section_type === 'ml_config'
}

/**
 * Type guard to check if config item is DryRunConfig
 */
export function isDryRunConfig(item: BudgetAlertConfigItem): item is DryRunConfig {
  return item.section_type === 'dry_run'
}

/**
 * Type guard to check if config item is ThemeColorsConfig
 */
export function isThemeColorsConfig(item: BudgetAlertConfigItem): item is ThemeColorsConfig {
  return item.section_type === 'theme'
}

/**
 * Type guard to check if config item is AnomalyDetectionConfig
 */
export function isAnomalyDetectionConfig(item: BudgetAlertConfigItem): item is AnomalyDetectionConfig {
  return item.section_type === 'anomaly_detection'
}

/**
 * Type guard to check if config item is StandaloneAnomalyAlertsConfig
 */
export function isStandaloneAnomalyAlertsConfig(item: BudgetAlertConfigItem): item is StandaloneAnomalyAlertsConfig {
  return item.section_type === 'standalone_anomaly_alerts'
}

// -----------------------------------------------------------------------------
// Query Types
// -----------------------------------------------------------------------------

/**
 * Query parameters for fetching config items
 */
export interface BudgetAlertConfigQueryParams {
  /** Filter by scope (GLOBAL or account ID) */
  scope?: string
  /** Filter by section type */
  section_type?: ConfigSectionType
  /** Maximum results to return */
  limit?: number
}

/**
 * Response for config list queries
 */
export interface BudgetAlertConfigListResponse {
  success: boolean
  data: BudgetAlertConfigItem[]
  count: number
}
