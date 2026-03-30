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
  chatThreads: DynamoDBTableConfig
  siteConfig: DynamoDBTableConfig
  adminNotifications: DynamoDBTableConfig
  streamingMetrics: DynamoDBTableConfig
  asyncChatJobs: DynamoDBTableConfig
  asyncMetrics: DynamoDBTableConfig
  budgetAlerts: DynamoDBTableConfig
  budgetAlertConfig: DynamoDBTableConfig
  costTagConfig: DynamoDBTableConfig
  userNotifications: DynamoDBTableConfig
  notificationBroadcasts: DynamoDBTableConfig
  achievementProgress: DynamoDBTableConfig
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
export const PROFORMA_ACCOUNT_ID = process.env.AWS_PROFORMA_ACCOUNT_ID || process.env.PROFORMA_ACCOUNT_ID || ''

// Cache the configuration to avoid repeated Secrets Manager calls
let cachedConfig: DynamoDBConfig | null = null
let configLoadedAt: number | null = null
const CONFIG_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

/**
 * Get DynamoDB configuration from Secrets Manager
 */
async function loadFromSecretsManager(): Promise<DynamoDBConfig | null> {
  try {
    const secretName = `ghost-dynamodb-config-${process.env.NODE_ENV || 'dev'}`
    const region = process.env.AWS_GOVCLOUD_REGION || 'us-gov-west-1'

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

    const config = JSON.parse(response.SecretString) as DynamoDBConfig
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

/**
 * Get DynamoDB configuration from environment variables (fallback)
 */
function loadFromEnvironment(): DynamoDBConfig {
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
    chatThreads: {
      tableName: process.env.CHAT_THREADS_TABLE_NAME || 'ghost-chat-threads',
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
    streamingMetrics: {
      tableName: process.env.STREAMING_METRICS_TABLE_NAME || 'ghost-streaming-metrics',
      environment: 'govcloud',
      region: govCloudRegion,
      accountId: deploymentAccountId
    },
    asyncChatJobs: {
      tableName: process.env.AWS_ASYNC_JOBS_TABLE_NAME || 'ghost-async-chat-jobs',
      environment: 'govcloud',
      region: govCloudRegion,
      accountId: deploymentAccountId
    },
    asyncMetrics: {
      tableName: process.env.AWS_ASYNC_METRICS_TABLE_NAME || 'ghost-async-metrics',
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
    }
  }
}

/**
 * Get DynamoDB configuration with caching
 * Tries Secrets Manager first, then falls back to environment variables
 */
export async function getDynamoDBConfig(): Promise<DynamoDBConfig> {
  // Return cached config if still valid
  if (cachedConfig && configLoadedAt && (Date.now() - configLoadedAt < CONFIG_CACHE_TTL)) {
    return cachedConfig
  }

  // Try loading from Secrets Manager first
  const secretsConfig = await loadFromSecretsManager()

  if (secretsConfig) {
    cachedConfig = secretsConfig
    configLoadedAt = Date.now()
    return secretsConfig
  }

  // Fall back to environment variables
  const envConfig = loadFromEnvironment()
  cachedConfig = envConfig
  configLoadedAt = Date.now()

  const nodeEnv = process.env.NODE_ENV?.toLowerCase()
  if (nodeEnv === 'development' || nodeEnv === 'dev') {
    logger.info('Using DynamoDB configuration from environment variables (development mode)')
  }

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
