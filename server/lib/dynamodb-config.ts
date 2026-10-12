/**
 * DynamoDB Configuration Loader
 * Centralized configuration for all DynamoDB tables used by the application
 *
 * Configuration hierarchy:
 * 1. AWS Secrets Manager (production)
 * 2. Environment variables (development/fallback)
 * 3. Default values (last resort)
 */

import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager'
import { logger } from '../utils/logger'

export interface DynamoDBTableConfig {
  tableName: string
  environment: 'commercial' | 'govcloud'
  region: string
  accountId: string
  readOnly?: boolean
}

export interface DynamoDBConfig {
  scheduledReports: DynamoDBTableConfig
  emailTemplates: DynamoDBTableConfig
  reportExecutions: DynamoDBTableConfig
  reportExecutionLocks: DynamoDBTableConfig
  sharedReports: DynamoDBTableConfig
  apiKeys: DynamoDBTableConfig
  apiKeysUsage: DynamoDBTableConfig
  shortlinks: DynamoDBTableConfig
  externalAccounts: DynamoDBTableConfig
  userPreferences: DynamoDBTableConfig
  accountNotes: DynamoDBTableConfig
  siteConfig: DynamoDBTableConfig
  adminNotifications: DynamoDBTableConfig
  datasetExportJobs: DynamoDBTableConfig
  aiUsage: DynamoDBTableConfig
  budgetAlerts: DynamoDBTableConfig
  budgetAlertConfig: DynamoDBTableConfig
  costTagConfig: DynamoDBTableConfig
  userNotifications: DynamoDBTableConfig
  notificationBroadcasts: DynamoDBTableConfig
  achievementProgress: DynamoDBTableConfig
  utilizationAnalysis: DynamoDBTableConfig
  financialPlanOverrides: DynamoDBTableConfig
  financialPlanHistory: DynamoDBTableConfig
}

// -----------------------------------------------------------------------------
// Budget Alerts Configuration
// -----------------------------------------------------------------------------

/**
 * Budget alerts table name (environment variable or default)
 * Table lives in Commercial AWS proforma/monitoring account (253821132832)
 */
export const BUDGET_ALERTS_TABLE = process.env.BUDGET_ALERTS_TABLE_NAME || 'budget-alert-system-alert-history-prod'

/**
 * GSI names for budget alerts table queries
 * - MONTH_INDEX: Query alerts by month (PK: month, SK: created_at)
 * - ALERT_TYPE_INDEX: Query alerts by type (PK: alert_type, SK: timestamp)
 */
export const BUDGET_ALERTS_INDEXES = {
  MONTH_INDEX: 'month-index',
  ALERT_TYPE_INDEX: 'alert-type-index'
} as const

/**
 * Proforma account ID where budget alerts table is hosted
 * This is the Commercial AWS monitoring account
 * Note: Terraform sets AWS_PROFORMA_ACCOUNT_ID (with AWS_ prefix)
 */
export const PROFORMA_ACCOUNT_ID = process.env.AWS_PROFORMA_ACCOUNT_ID || process.env.PROFORMA_ACCOUNT_ID || '253821132832'

const BUDGET_ALERT_CONFIG_KEYS = ['budgetAlerts', 'budgetAlertConfig'] as const

/**
 * Budget alert tables are owned by the monitoring account. A stale general
 * DynamoDB secret may customize their names, but must not relocate them.
 */
export function mergeDynamoDBConfig(
  defaults: DynamoDBConfig,
  configured: Partial<DynamoDBConfig>
): DynamoDBConfig {
  const merged = { ...defaults, ...configured }

  // ECS supplies the deployed table names; older secrets still name the dev tables.
  for (const [key, tableName] of [
    ['apiKeys', process.env.DYNAMODB_API_KEYS_TABLE],
    ['apiKeysUsage', process.env.DYNAMODB_API_KEY_USAGE_TABLE]
  ] as const) {
    if (tableName) {
      merged[key] = { ...defaults[key], ...configured[key], tableName }
    }
  }

  for (const key of BUDGET_ALERT_CONFIG_KEYS) {
    merged[key] = {
      ...defaults[key],
      ...configured[key],
      environment: defaults[key].environment,
      region: defaults[key].region,
      accountId: defaults[key].accountId
    }
  }

  return merged
}

// Cache the configuration to avoid repeated Secrets Manager calls
let cachedConfig: DynamoDBConfig | null = null
let configLoadedAt: number | null = null
const CONFIG_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

/**
 * Get DynamoDB configuration from Secrets Manager
 */
async function loadFromSecretsManager(): Promise<Partial<DynamoDBConfig> | null> {
  try {
    // Check for direct config via environment variable first (skips Secrets Manager API call)
    if (process.env.DYNAMODB_CONFIG) {
      logger.info('Loading DynamoDB configuration from DYNAMODB_CONFIG env var')
      return JSON.parse(process.env.DYNAMODB_CONFIG) as Partial<DynamoDBConfig>
    }

    const secretName = process.env.DYNAMODB_CONFIG_SECRET_NAME || `ghost-dynamodb-config-${process.env.NODE_ENV || 'dev'}`
    const region = process.env.AWS_GOVCLOUD_REGION || 'us-gov-west-1'

    logger.debug('Fetching DynamoDB config from Secrets Manager:', secretName)

    const client = new SecretsManagerClient({
      region,
      credentials: {
        accessKeyId: process.env.AWS_GOVCLOUD_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_GOVCLOUD_SECRET_ACCESS_KEY || ''
      }
    })

    const command = new GetSecretValueCommand({ SecretId: secretName })
    const response = await client.send(command)

    if (!response.SecretString) {
      logger.warn('DynamoDB config secret exists but has no value')
      return null
    }

    const config = JSON.parse(response.SecretString) as Partial<DynamoDBConfig>
    logger.info('Successfully loaded DynamoDB configuration from Secrets Manager')
    return config
  } catch (error: any) {
    // Only log in non-development environments or if not a ResourceNotFoundException
    if (process.env.NODE_ENV !== 'development' || error.name !== 'ResourceNotFoundException') {
      logger.warn('Failed to load DynamoDB config from Secrets Manager:', error.message)
    }
    return null
  }
}

export function isProductionDeployment(env: NodeJS.ProcessEnv = process.env): boolean {
  const explicitEnvironment = env.GHOST_ENV?.trim().toLowerCase()
  if (explicitEnvironment) return explicitEnvironment === 'prod' || explicitEnvironment === 'production'

  // Nitro production builds can inline NODE_ENV="production" even when the
  // running ECS service is dev. The environment-specific secret name remains
  // runtime configuration, so use it as the compatibility signal.
  const secretName = env.DYNAMODB_CONFIG_SECRET_NAME?.trim().toLowerCase()
  if (secretName?.endsWith('-dev')) return false
  if (secretName?.endsWith('-prod')) return true

  const nodeEnv = env.NODE_ENV?.trim().toLowerCase()
  return nodeEnv === 'production' || nodeEnv === 'prod'
}

/**
 * Get DynamoDB configuration from environment variables (fallback)
 */
function loadFromEnvironment(): DynamoDBConfig {
  const isProduction = isProductionDeployment()
  const govCloudRegion = process.env.AWS_GOVCLOUD_REGION || 'us-gov-west-1'
  const commercialRegion = process.env.AWS_COMMERCIAL_REGION || 'us-east-1'
  const govCloudAccountId = process.env.AWS_GOVCLOUD_ORGANIZATIONS_ACCOUNT_ID || ''
  const commercialAccountId = process.env.AWS_COMMERCIAL_ORGANIZATIONS_ACCOUNT_ID || '205950196477'

  // Deployment account where app and local DynamoDB tables are deployed
  // Credentials are for master account, so we assume role into deployment account
  const deploymentAccountId = process.env.AWS_DEPLOYMENT_ACCOUNT_ID || govCloudAccountId

  return {
    scheduledReports: {
      tableName: process.env.SCHEDULED_REPORTS_TABLE || 'ghost-scheduled-reports',
      environment: 'govcloud',
      region: govCloudRegion,
      accountId: deploymentAccountId
    },
    emailTemplates: {
      tableName: process.env.EMAIL_TEMPLATES_TABLE || 'ghost-email-templates',
      environment: 'govcloud',
      region: govCloudRegion,
      accountId: deploymentAccountId
    },
    reportExecutions: {
      tableName: process.env.REPORT_EXECUTIONS_TABLE || 'ghost-report-executions',
      environment: 'govcloud',
      region: govCloudRegion,
      accountId: deploymentAccountId
    },
    reportExecutionLocks: {
      tableName: process.env.REPORT_EXECUTION_LOCKS_TABLE || 'ghost-report-execution-locks',
      environment: 'govcloud',
      region: govCloudRegion,
      accountId: deploymentAccountId
    },
    sharedReports: {
      tableName: process.env.SHARED_REPORTS_TABLE || 'ghost-shared-reports',
      environment: 'govcloud',
      region: govCloudRegion,
      accountId: deploymentAccountId
    },
    apiKeys: {
      tableName: process.env.DYNAMODB_API_KEYS_TABLE || 'ghost-api-keys',
      environment: (process.env.API_KEYS_STORAGE_ENV as 'commercial' | 'govcloud') || 'govcloud',
      region: process.env.API_KEYS_STORAGE_ENV === 'commercial' ? commercialRegion : govCloudRegion,
      accountId: process.env.API_KEYS_STORAGE_ENV === 'commercial' ? commercialAccountId : deploymentAccountId
    },
    apiKeysUsage: {
      tableName: process.env.DYNAMODB_API_KEY_USAGE_TABLE || 'ghost-api-keys-usage',
      environment: (process.env.API_KEYS_STORAGE_ENV as 'commercial' | 'govcloud') || 'govcloud',
      region: process.env.API_KEYS_STORAGE_ENV === 'commercial' ? commercialRegion : govCloudRegion,
      accountId: process.env.API_KEYS_STORAGE_ENV === 'commercial' ? commercialAccountId : deploymentAccountId
    },
    shortlinks: {
      tableName: process.env.SHORTLINKS_TABLE || 'ghost-dashboard-shortlinks',
      environment: 'govcloud',
      region: govCloudRegion,
      accountId: deploymentAccountId
    },
    externalAccounts: {
      tableName: process.env.AWS_ACCOUNTS_TABLE_NAME || 'gdms_aws_accounts-master',
      environment: 'govcloud',
      region: govCloudRegion,
      accountId: govCloudAccountId,
      readOnly: true
    },
    userPreferences: {
      tableName: process.env.USER_PREFERENCES_TABLE || 'ghost-user-preferences',
      environment: 'govcloud',
      region: govCloudRegion,
      accountId: deploymentAccountId
    },
    accountNotes: {
      tableName: process.env.ACCOUNT_NOTES_TABLE || 'ghost-account-notes',
      environment: 'govcloud',
      region: govCloudRegion,
      accountId: deploymentAccountId
    },
    siteConfig: {
      tableName: process.env.SITE_CONFIG_TABLE || 'ghost-site-config',
      environment: 'govcloud',
      region: govCloudRegion,
      accountId: deploymentAccountId
    },
    adminNotifications: {
      tableName: process.env.ADMIN_NOTIFICATIONS_TABLE || 'ghost_admin_notifications',
      environment: 'govcloud',
      region: govCloudRegion,
      accountId: deploymentAccountId
    },
    datasetExportJobs: {
      tableName: process.env.DATASET_EXPORT_JOBS_TABLE_NAME || 'ghost-dataset-export-jobs',
      environment: 'govcloud',
      region: govCloudRegion,
      accountId: deploymentAccountId
    },
    aiUsage: {
      tableName: process.env.AI_USAGE_TABLE_NAME || 'ghost-ai-usage',
      environment: 'govcloud',
      region: govCloudRegion,
      accountId: deploymentAccountId
    },
    // Budget alerts table is in Commercial AWS (proforma/monitoring account)
    budgetAlerts: {
      tableName: BUDGET_ALERTS_TABLE,
      environment: 'commercial',
      region: commercialRegion,
      accountId: PROFORMA_ACCOUNT_ID || commercialAccountId,
      readOnly: true  // GHOST only reads alert history, doesn't create alerts
    },
    // Budget alert configuration table (same account as budget alerts)
    budgetAlertConfig: {
      tableName: process.env.BUDGET_ALERT_CONFIG_TABLE || 'budget-alert-system-config-prod',
      environment: 'commercial',
      region: commercialRegion,
      accountId: PROFORMA_ACCOUNT_ID || commercialAccountId,
      readOnly: false  // Admin can modify alert configuration
    },
    costTagConfig: {
      tableName: process.env.COST_TAG_CONFIG_TABLE || 'ghost-cost-tag-config',
      environment: 'govcloud',
      region: govCloudRegion,
      accountId: deploymentAccountId
    },
    userNotifications: {
      tableName: process.env.USER_NOTIFICATIONS_TABLE || 'ghost-user-notifications',
      environment: 'govcloud',
      region: govCloudRegion,
      accountId: deploymentAccountId
    },
    notificationBroadcasts: {
      tableName: process.env.NOTIFICATION_BROADCASTS_TABLE || 'ghost-notification-broadcasts',
      environment: 'govcloud',
      region: govCloudRegion,
      accountId: deploymentAccountId
    },
    achievementProgress: {
      tableName: process.env.ACHIEVEMENT_PROGRESS_TABLE || 'ghost-achievement-progress',
      environment: 'govcloud',
      region: govCloudRegion,
      accountId: deploymentAccountId
    },
    utilizationAnalysis: {
      tableName: process.env.UTILIZATION_ANALYSIS_TABLE || 'ghost-utilization-analysis',
      environment: 'govcloud',
      region: govCloudRegion,
      accountId: deploymentAccountId
    },
    financialPlanOverrides: {
      tableName: process.env.FINANCIAL_PLAN_OVERRIDES_TABLE || (isProduction ? 'ghost-manual-plan-values-prod' : 'ghost-manual-plan-values'),
      environment: 'govcloud',
      region: govCloudRegion,
      accountId: deploymentAccountId
    },
    financialPlanHistory: {
      tableName: process.env.FINANCIAL_PLAN_HISTORY_TABLE || (isProduction ? 'ghost-financial-plan-history-prod' : 'ghost-financial-plan-history'),
      environment: 'govcloud',
      region: govCloudRegion,
      accountId: deploymentAccountId
    }
  }
}

/**
 * Get DynamoDB configuration with caching
 *
 * Resolution order:
 *   1. Secrets Manager / DYNAMODB_CONFIG env var (if present)
 *   2. Environment-variable defaults (loadFromEnvironment)
 *
 * The env-variable config is the complete, authoritative superset of every
 * table key. A secret-sourced config may be stale and omit newer tables
 * (e.g. userNotifications), which previously caused
 * `Cannot read properties of undefined (reading 'tableName')` at call sites.
 * To prevent that, the secret config is MERGED OVER the env defaults: any key
 * the secret omits falls back to its built-in default, while keys the secret
 * provides still win. This makes a partial/stale secret safe.
 */
export async function getDynamoDBConfig(): Promise<DynamoDBConfig> {
  // Return cached config if still valid
  if (cachedConfig && configLoadedAt && (Date.now() - configLoadedAt < CONFIG_CACHE_TTL)) {
    return cachedConfig
  }

  // Env-variable config is the complete set of defaults for every table.
  const envConfig = loadFromEnvironment()

  // Local development must never inherit table locations from a shared secret.
  // In particular, Finance plan changes are user edits and must not be capable
  // of writing to production simply because a developer can read its config.
  const nodeEnv = process.env.NODE_ENV?.toLowerCase()
  if (nodeEnv === 'development' || nodeEnv === 'dev') {
    cachedConfig = envConfig
    configLoadedAt = Date.now()
    logger.info('Using DynamoDB configuration from environment variables (development mode)')
    return envConfig
  }

  // Try loading from Secrets Manager first; merge over defaults so a stale or
  // partial secret can never drop a table key.
  const secretsConfig = await loadFromSecretsManager()

  if (secretsConfig) {
    const mergedConfig = mergeDynamoDBConfig(envConfig, secretsConfig)

    const relocatedBudgetTables = BUDGET_ALERT_CONFIG_KEYS.filter(key => {
      const configured = secretsConfig[key]
      return configured && (
        configured.environment !== envConfig[key].environment ||
        configured.region !== envConfig[key].region ||
        configured.accountId !== envConfig[key].accountId
      )
    })
    if (relocatedBudgetTables.length > 0) {
      logger.warn(
        `Ignoring stale DynamoDB secret locations for ${relocatedBudgetTables.join(', ')}; ` +
        `budget alert tables are hosted in Commercial monitoring account ${PROFORMA_ACCOUNT_ID}`
      )
    }

    // Warn if the secret was missing keys the defaults supplied (signals a
    // stale secret that should be refreshed), so the gap is observable.
    const missingKeys = (Object.keys(envConfig) as (keyof DynamoDBConfig)[])
      .filter(k => !(k in secretsConfig))
    if (missingKeys.length > 0) {
      logger.warn(
        `DynamoDB config from secret was missing ${missingKeys.length} table key(s); ` +
        `using env defaults for: ${missingKeys.join(', ')}`
      )
    }

    cachedConfig = mergedConfig
    configLoadedAt = Date.now()
    return mergedConfig
  }

  // No secret available — use env defaults directly.
  cachedConfig = envConfig
  configLoadedAt = Date.now()

  return envConfig
}

/**
 * Clear the configuration cache (useful for testing)
 */
export function clearConfigCache(): void {
  cachedConfig = null
  configLoadedAt = null
}

// Track which tables have been logged to avoid duplicate logs
const loggedTables = new Set<string>()

/**
 * Get a specific table configuration
 */
export async function getTableConfig(tableName: keyof DynamoDBConfig): Promise<DynamoDBTableConfig> {
  const config = await getDynamoDBConfig()
  const tableConfig = config[tableName]

  // Only log on first access per table in development (reduces noise)
  if (process.env.NODE_ENV === 'development' && !loggedTables.has(tableName)) {
    logger.debug(`[DynamoDB Config] Loaded config for "${tableName}": ${tableConfig.tableName} (${tableConfig.environment})`)
    loggedTables.add(tableName)
  }

  return tableConfig
}

/**
 * Helper to get table name by config key
 */
export async function getTableName(configKey: keyof DynamoDBConfig): Promise<string> {
  const tableConfig = await getTableConfig(configKey)
  return tableConfig.tableName
}

/**
 * Helper to get environment for a table
 */
export async function getTableEnvironment(configKey: keyof DynamoDBConfig): Promise<'commercial' | 'govcloud'> {
  const tableConfig = await getTableConfig(configKey)
  return tableConfig.environment
}

/**
 * Helper to get account ID for a table
 */
export async function getTableAccountId(configKey: keyof DynamoDBConfig): Promise<string> {
  const tableConfig = await getTableConfig(configKey)
  return tableConfig.accountId
}
