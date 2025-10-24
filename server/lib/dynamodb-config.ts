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
}

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
