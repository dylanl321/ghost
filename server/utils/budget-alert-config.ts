/**
 * Budget Alert Config Utility Module
 *
 * DynamoDB operations for managing budget alert configuration from the
 * Commercial AWS proforma/monitoring account. Provides functions for
 * querying global settings, alert levels, recipients, and other config.
 */

import { queryItems, scanItems, putItem, getItem, deleteItem } from './dynamodb'
import { getTableConfig } from '../lib/dynamodb-config'
import type {
  BudgetAlertConfigItem,
  ConfigSectionType,
  SettingsConfig,
  AlertLevelConfig,
  RecipientsByTypeConfig,
  StaticRecipientsConfig,
  LobRecipientsConfig,
  AccountRecipientsConfig,
  ThresholdScalingConfig,
  PaceAlertingConfig,
  MlConfig,
  DryRunConfig,
  ThemeColorsConfig,
  AnomalyDetectionConfig,
  StandaloneAnomalyAlertsConfig
} from '#shared/types/budget-alert-config'
import { logger } from './logger'

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

/**
 * GSI name for section type queries
 */
export const SECTION_TYPE_INDEX = 'section-type-index'

// -----------------------------------------------------------------------------
// Query Functions
// -----------------------------------------------------------------------------

/**
 * Get all global configuration items
 * Uses scan with filter on config_scope=GLOBAL
 */
export async function getGlobalConfig(): Promise<BudgetAlertConfigItem[]> {
  const tableConfig = await getTableConfig('budgetAlertConfig')

  try {
    const result = await scanItems(
      tableConfig.tableName,
      'config_scope = :scope',
      100,
      undefined,
      tableConfig.environment,
      undefined,
      { ':scope': 'GLOBAL' },
      tableConfig.accountId
    )

    logger.info('[Budget Alert Config] Retrieved global config:', {
      count: result.count
    })

    return result.items as BudgetAlertConfigItem[]
  } catch (error: any) {
    logger.error('[Budget Alert Config] Error querying global config:', {
      error: error.message
    })
    throw error
  }
}

/**
 * Get configuration items by section type using scan with filter
 * (GSI may not be available, so using scan for reliability)
 */
export async function getConfigBySectionType(
  sectionType: ConfigSectionType
): Promise<BudgetAlertConfigItem[]> {
  const tableConfig = await getTableConfig('budgetAlertConfig')

  try {
    const result = await scanItems(
      tableConfig.tableName,
      'section_type = :type',
      100,
      undefined,
      tableConfig.environment,
      undefined,
      { ':type': sectionType },
      tableConfig.accountId
    )

    logger.info('[Budget Alert Config] Retrieved config by section type:', {
      sectionType,
      count: result.count
    })

    return result.items as BudgetAlertConfigItem[]
  } catch (error: any) {
    logger.error('[Budget Alert Config] Error querying config by section type:', {
      sectionType,
      error: error.message
    })
    throw error
  }
}

/**
 * Get a specific configuration item by scope and section
 */
export async function getConfigItem(
  configScope: string,
  configSection: string
): Promise<BudgetAlertConfigItem | null> {
  const tableConfig = await getTableConfig('budgetAlertConfig')

  try {
    const result = await getItem(
      tableConfig.tableName,
      { config_scope: configScope, config_section: configSection },
      tableConfig.environment,
      tableConfig.accountId
    )

    return result as BudgetAlertConfigItem | null
  } catch (error: any) {
    logger.error('[Budget Alert Config] Error getting config item:', {
      configScope,
      configSection,
      error: error.message
    })
    throw error
  }
}

/**
 * Get all settings (settings#main)
 */
export async function getSettings(): Promise<SettingsConfig | null> {
  const item = await getConfigItem('GLOBAL', 'settings#main')
  return item as SettingsConfig | null
}

/**
 * Get all alert level configurations
 */
export async function getAlertLevels(): Promise<AlertLevelConfig[]> {
  const items = await getConfigBySectionType('alerts')
  return items as AlertLevelConfig[]
}

/**
 * Get all recipients by type configurations
 */
export async function getRecipientsByType(): Promise<RecipientsByTypeConfig[]> {
  const items = await getConfigBySectionType('recipients_by_type')
  return items as RecipientsByTypeConfig[]
}

/**
 * Get static recipients configuration
 */
export async function getStaticRecipients(): Promise<StaticRecipientsConfig | null> {
  const item = await getConfigItem('GLOBAL', 'static_recipients#main')
  return item as StaticRecipientsConfig | null
}

/**
 * Get all LOB recipients configurations
 */
export async function getLobRecipients(): Promise<LobRecipientsConfig[]> {
  const items = await getConfigBySectionType('lob_recipients')
  return items as LobRecipientsConfig[]
}

/**
 * Get account-specific recipients for a specific account
 */
export async function getAccountRecipients(
  accountId: string
): Promise<AccountRecipientsConfig | null> {
  const item = await getConfigItem(accountId, 'custom_recipients#main')
  return item as AccountRecipientsConfig | null
}

/**
 * Get all account-specific recipients configurations
 */
export async function getAllAccountRecipients(): Promise<AccountRecipientsConfig[]> {
  const items = await getConfigBySectionType('custom_recipients')
  return items as AccountRecipientsConfig[]
}

/**
 * Get threshold scaling configuration
 */
export async function getThresholdScaling(): Promise<ThresholdScalingConfig | null> {
  const item = await getConfigItem('GLOBAL', 'threshold_scaling#main')
  return item as ThresholdScalingConfig | null
}

/**
 * Get pace alerting configuration
 */
export async function getPaceAlerting(): Promise<PaceAlertingConfig | null> {
  const item = await getConfigItem('GLOBAL', 'pace_alerting#main')
  return item as PaceAlertingConfig | null
}

/**
 * Get ML config
 */
export async function getMlConfig(): Promise<MlConfig | null> {
  const item = await getConfigItem('GLOBAL', 'ml_config#main')
  return item as MlConfig | null
}

/**
 * Get dry run configuration
 */
export async function getDryRunConfig(): Promise<DryRunConfig | null> {
  const item = await getConfigItem('GLOBAL', 'dry_run#main')
  return item as DryRunConfig | null
}

/**
 * Get theme colors configuration
 */
export async function getThemeColors(): Promise<ThemeColorsConfig | null> {
  const item = await getConfigItem('GLOBAL', 'theme#colors')
  return item as ThemeColorsConfig | null
}

/**
 * Get anomaly detection configuration
 */
export async function getAnomalyDetection(): Promise<AnomalyDetectionConfig | null> {
  const item = await getConfigItem('GLOBAL', 'anomaly_detection#main')
  return item as AnomalyDetectionConfig | null
}

/**
 * Get standalone anomaly alerts configuration
 */
export async function getStandaloneAnomalyAlerts(): Promise<StandaloneAnomalyAlertsConfig | null> {
  const item = await getConfigItem('GLOBAL', 'standalone_anomaly_alerts#main')
  return item as StandaloneAnomalyAlertsConfig | null
}

// -----------------------------------------------------------------------------
// Update Functions
// -----------------------------------------------------------------------------

/**
 * Update a configuration item
 * Adds updated_at timestamp and optionally updated_by
 */
export async function updateConfigItem(
  item: BudgetAlertConfigItem,
  updatedBy?: string
): Promise<void> {
  const tableConfig = await getTableConfig('budgetAlertConfig')

  const itemWithMetadata = {
    ...item,
    updated_at: new Date().toISOString(),
    updated_by: updatedBy
  }

  try {
    await putItem(
      tableConfig.tableName,
      itemWithMetadata,
      tableConfig.environment,
      tableConfig.accountId
    )

    logger.info('[Budget Alert Config] Updated config item:', {
      configScope: item.config_scope,
      configSection: item.config_section,
      updatedBy
    })
  } catch (error: any) {
    logger.error('[Budget Alert Config] Error updating config item:', {
      configScope: item.config_scope,
      configSection: item.config_section,
      error: error.message
    })
    throw error
  }
}

/**
 * Delete a configuration item
 * Returns the deleted item or null if not found
 */
export async function deleteConfigItem(
  configScope: string,
  configSection: string
): Promise<BudgetAlertConfigItem | null> {
  const tableConfig = await getTableConfig('budgetAlertConfig')

  try {
    // Get item before deleting (for return value and logging)
    const existing = await getConfigItem(configScope, configSection)
    if (!existing) {
      logger.warn('[Budget Alert Config] Item not found for deletion:', {
        configScope,
        configSection
      })
      return null
    }

    await deleteItem(
      tableConfig.tableName,
      { config_scope: configScope, config_section: configSection },
      tableConfig.environment,
      tableConfig.accountId
    )

    logger.info('[Budget Alert Config] Deleted config item:', {
      configScope,
      configSection,
      sectionType: existing.section_type
    })

    return existing
  } catch (error: any) {
    logger.error('[Budget Alert Config] Error deleting config item:', {
      configScope,
      configSection,
      error: error.message
    })
    throw error
  }
}

// -----------------------------------------------------------------------------
// Aggregation Functions
// -----------------------------------------------------------------------------

/**
 * Get comprehensive alert configuration overview
 * Returns all config organized by category for admin dashboard
 */
export async function getAlertConfigOverview(): Promise<{
  settings: SettingsConfig | null
  alertLevels: AlertLevelConfig[]
  recipientsByType: RecipientsByTypeConfig[]
  staticRecipients: StaticRecipientsConfig | null
  lobRecipients: LobRecipientsConfig[]
  accountRecipients: AccountRecipientsConfig[]
  thresholdScaling: ThresholdScalingConfig | null
  paceAlerting: PaceAlertingConfig | null
  mlConfig: MlConfig | null
  dryRun: DryRunConfig | null
  themeColors: ThemeColorsConfig | null
  anomalyDetection: AnomalyDetectionConfig | null
  standaloneAnomalyAlerts: StandaloneAnomalyAlertsConfig | null
}> {
  // Fetch all global config in one query
  const globalItems = await getGlobalConfig()

  // Organize items by section type
  const settings = globalItems.find(item => item.config_section === 'settings#main') as SettingsConfig | undefined
  const alertLevels = globalItems.filter(item => item.section_type === 'alerts') as AlertLevelConfig[]
  const recipientsByType = globalItems.filter(item => item.section_type === 'recipients_by_type') as RecipientsByTypeConfig[]
  const staticRecipients = globalItems.find(item => item.config_section === 'static_recipients#main') as StaticRecipientsConfig | undefined
  const lobRecipients = globalItems.filter(item => item.section_type === 'lob_recipients') as LobRecipientsConfig[]
  const thresholdScaling = globalItems.find(item => item.config_section === 'threshold_scaling#main') as ThresholdScalingConfig | undefined
  const paceAlerting = globalItems.find(item => item.config_section === 'pace_alerting#main') as PaceAlertingConfig | undefined
  const mlConfig = globalItems.find(item => item.config_section === 'ml_config#main') as MlConfig | undefined
  const dryRun = globalItems.find(item => item.config_section === 'dry_run#main') as DryRunConfig | undefined
  const themeColors = globalItems.find(item => item.config_section === 'theme#colors') as ThemeColorsConfig | undefined
  const anomalyDetection = globalItems.find(item => item.config_section === 'anomaly_detection#main') as AnomalyDetectionConfig | undefined
  const standaloneAnomalyAlerts = globalItems.find(item => item.config_section === 'standalone_anomaly_alerts#main') as StandaloneAnomalyAlertsConfig | undefined

  // Fetch account-specific recipients (not in GLOBAL scope)
  const accountRecipients = await getAllAccountRecipients()

  return {
    settings: settings ?? null,
    alertLevels,
    recipientsByType,
    staticRecipients: staticRecipients ?? null,
    lobRecipients,
    accountRecipients,
    thresholdScaling: thresholdScaling ?? null,
    paceAlerting: paceAlerting ?? null,
    mlConfig: mlConfig ?? null,
    dryRun: dryRun ?? null,
    themeColors: themeColors ?? null,
    anomalyDetection: anomalyDetection ?? null,
    standaloneAnomalyAlerts: standaloneAnomalyAlerts ?? null
  }
}
