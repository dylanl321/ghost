/**
 * Composable for fetching and managing budget alert configuration
 *
 * Provides reactive access to the alert configuration stored in DynamoDB,
 * with support for fetching complete config or specific sections,
 * and mutation methods for updating configuration.
 */

import type {
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
} from '@/shared/types/budget-alert-config'

/**
 * Complete alert configuration overview
 */
export interface AlertConfigOverview {
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
}

/**
 * API response for alert config
 */
interface AlertConfigResponse {
  success: boolean
  data: AlertConfigOverview
  meta: {
    totalAlertLevels: number
    totalRecipientConfigs: number
    totalLobRecipients: number
    totalAccountRecipients: number
    dryRunEnabled: boolean
  }
}

/**
 * API response for mutations
 */
interface MutationResponse<T> {
  success: boolean
  data: T
  message: string
}

/**
 * Composable for managing budget alert configuration
 */
export function useAlertConfig() {
  const config = ref<AlertConfigOverview | null>(null)
  const loading = ref(false)
  const error = ref<Error | null>(null)
  const saving = ref(false)
  const saveError = ref<Error | null>(null)

  /**
   * Fetch the complete alert configuration
   */
  async function fetchConfig() {
    loading.value = true
    error.value = null

    try {
      const response = await $fetch<AlertConfigResponse>('/api/admin/alert-config')
      config.value = response.data
      return response
    } catch (e: any) {
      error.value = e
      console.error('[useAlertConfig] Error fetching config:', e)
      throw e
    } finally {
      loading.value = false
    }
  }

  /**
   * Fetch a specific section of the configuration
   */
  async function fetchSection<T>(section: string): Promise<T | null> {
    loading.value = true
    error.value = null

    try {
      const response = await $fetch<{ success: boolean; section: string; data: T }>(`/api/admin/alert-config/${section}`)
      return response.data
    } catch (e: any) {
      error.value = e
      console.error(`[useAlertConfig] Error fetching section ${section}:`, e)
      throw e
    } finally {
      loading.value = false
    }
  }

  // -------------------------------------------------------------------------
  // Mutation Methods
  // -------------------------------------------------------------------------

  /**
   * Generic helper to update a section and refresh config
   */
  async function updateSection<T>(endpoint: string, updates: Partial<T>): Promise<T> {
    saving.value = true
    saveError.value = null

    try {
      const response = await $fetch<MutationResponse<T>>(endpoint, {
        method: 'PUT',
        body: updates
      })
      // Refresh the full config to get updated state
      await fetchConfig()
      return response.data
    } catch (e: any) {
      saveError.value = e
      console.error('[useAlertConfig] Error updating section:', e)
      throw e
    } finally {
      saving.value = false
    }
  }

  /**
   * Update settings configuration
   */
  async function updateSettings(updates: Partial<SettingsConfig>): Promise<SettingsConfig> {
    return updateSection<SettingsConfig>('/api/admin/alert-config/settings', updates)
  }

  /**
   * Update dry run configuration
   */
  async function updateDryRun(updates: Partial<DryRunConfig>): Promise<DryRunConfig> {
    return updateSection<DryRunConfig>('/api/admin/alert-config/dry-run', updates)
  }

  /**
   * Update anomaly detection configuration
   */
  async function updateAnomalyDetection(updates: Partial<AnomalyDetectionConfig>): Promise<AnomalyDetectionConfig> {
    return updateSection<AnomalyDetectionConfig>('/api/admin/alert-config/anomaly-detection', updates)
  }

  /**
   * Update threshold scaling configuration
   */
  async function updateThresholdScaling(updates: Partial<ThresholdScalingConfig>): Promise<ThresholdScalingConfig> {
    return updateSection<ThresholdScalingConfig>('/api/admin/alert-config/threshold-scaling', updates)
  }

  /**
   * Update standalone anomaly alerts configuration
   */
  async function updateStandaloneAnomalyAlerts(updates: Partial<StandaloneAnomalyAlertsConfig>): Promise<StandaloneAnomalyAlertsConfig> {
    return updateSection<StandaloneAnomalyAlertsConfig>('/api/admin/alert-config/standalone-anomaly-alerts', updates)
  }

  /**
   * Update ML configuration
   */
  async function updateMlConfig(updates: Partial<MlConfig>): Promise<MlConfig> {
    return updateSection<MlConfig>('/api/admin/alert-config/ml-config', updates)
  }

  /**
   * Update pace alerting configuration
   */
  async function updatePaceAlerting(updates: Partial<PaceAlertingConfig>): Promise<PaceAlertingConfig> {
    return updateSection<PaceAlertingConfig>('/api/admin/alert-config/pace-alerting', updates)
  }

  /**
   * Update theme colors configuration
   */
  async function updateThemeColors(updates: { colors: Record<string, string> }): Promise<ThemeColorsConfig> {
    return updateSection<ThemeColorsConfig>('/api/admin/alert-config/theme-colors', updates)
  }

  /**
   * Update static recipients configuration
   */
  async function updateStaticRecipients(updates: { mappings: Record<string, string> }): Promise<StaticRecipientsConfig> {
    return updateSection<StaticRecipientsConfig>('/api/admin/alert-config/static-recipients', updates)
  }

  // -------------------------------------------------------------------------
  // Alert Level CRUD
  // -------------------------------------------------------------------------

  /**
   * Update an existing alert level
   */
  async function updateAlertLevel(level: string, updates: Partial<AlertLevelConfig>): Promise<AlertLevelConfig> {
    saving.value = true
    saveError.value = null

    try {
      const response = await $fetch<MutationResponse<AlertLevelConfig>>(`/api/admin/alert-config/alerts/${level}`, {
        method: 'PUT',
        body: updates
      })
      await fetchConfig()
      return response.data
    } catch (e: any) {
      saveError.value = e
      console.error('[useAlertConfig] Error updating alert level:', e)
      throw e
    } finally {
      saving.value = false
    }
  }

  /**
   * Create a new alert level
   */
  async function createAlertLevel(data: {
    level: string
    threshold: number
    color: string
    min_dollars?: number
    max_per_month?: number
    intervals?: number[]
  }): Promise<AlertLevelConfig> {
    saving.value = true
    saveError.value = null

    try {
      const response = await $fetch<MutationResponse<AlertLevelConfig>>('/api/admin/alert-config/alerts', {
        method: 'POST',
        body: data
      })
      await fetchConfig()
      return response.data
    } catch (e: any) {
      saveError.value = e
      console.error('[useAlertConfig] Error creating alert level:', e)
      throw e
    } finally {
      saving.value = false
    }
  }

  /**
   * Delete an alert level
   */
  async function deleteAlertLevel(level: string): Promise<void> {
    saving.value = true
    saveError.value = null

    try {
      await $fetch(`/api/admin/alert-config/alerts/${level}`, {
        method: 'DELETE'
      })
      await fetchConfig()
    } catch (e: any) {
      saveError.value = e
      console.error('[useAlertConfig] Error deleting alert level:', e)
      throw e
    } finally {
      saving.value = false
    }
  }

  // -------------------------------------------------------------------------
  // Computed Properties
  // -------------------------------------------------------------------------

  // Computed properties for easy access to config sections
  const settings = computed(() => config.value?.settings ?? null)
  const alertLevels = computed(() => config.value?.alertLevels ?? [])
  const recipientsByType = computed(() => config.value?.recipientsByType ?? [])
  const staticRecipients = computed(() => config.value?.staticRecipients ?? null)
  const lobRecipients = computed(() => config.value?.lobRecipients ?? [])
  const accountRecipients = computed(() => config.value?.accountRecipients ?? [])
  const thresholdScaling = computed(() => config.value?.thresholdScaling ?? null)
  const paceAlerting = computed(() => config.value?.paceAlerting ?? null)
  const mlConfig = computed(() => config.value?.mlConfig ?? null)
  const dryRun = computed(() => config.value?.dryRun ?? null)
  const themeColors = computed(() => config.value?.themeColors ?? null)
  const anomalyDetection = computed(() => config.value?.anomalyDetection ?? null)
  const standaloneAnomalyAlerts = computed(() => config.value?.standaloneAnomalyAlerts ?? null)

  // Derived computed properties
  const isDryRunEnabled = computed(() => dryRun.value?.enabled ?? false)
  const isAnomalyDetectionEnabled = computed(() => anomalyDetection.value?.enabled ?? false)
  const isMlEnabled = computed(() => mlConfig.value?.enabled ?? true)

  /**
   * Get alert levels sorted by threshold
   */
  const sortedAlertLevels = computed(() => {
    return [...alertLevels.value].sort((a, b) => a.threshold - b.threshold)
  })

  /**
   * Get recipients grouped by alert type
   */
  const recipientsByAlertType = computed(() => {
    const grouped: Record<string, RecipientsByTypeConfig[]> = {
      FORECAST: [],
      ACTUAL: [],
      MONTHLY: [],
      ANOMALY: []
    }

    for (const recipient of recipientsByType.value) {
      if (recipient.alert_type && grouped[recipient.alert_type]) {
        grouped[recipient.alert_type].push(recipient)
      }
    }

    return grouped
  })

  return {
    // State
    config,
    loading,
    error,
    saving,
    saveError,

    // Read Actions
    fetchConfig,
    fetchSection,

    // Mutation Actions
    updateSettings,
    updateDryRun,
    updateAnomalyDetection,
    updateThresholdScaling,
    updateStandaloneAnomalyAlerts,
    updateMlConfig,
    updatePaceAlerting,
    updateThemeColors,
    updateStaticRecipients,

    // Alert Level CRUD
    updateAlertLevel,
    createAlertLevel,
    deleteAlertLevel,

    // Direct section access
    settings,
    alertLevels,
    recipientsByType,
    staticRecipients,
    lobRecipients,
    accountRecipients,
    thresholdScaling,
    paceAlerting,
    mlConfig,
    dryRun,
    themeColors,
    anomalyDetection,
    standaloneAnomalyAlerts,

    // Derived properties
    isDryRunEnabled,
    isAnomalyDetectionEnabled,
    isMlEnabled,
    sortedAlertLevels,
    recipientsByAlertType
  }
}
