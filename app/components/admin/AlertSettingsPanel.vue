<template>
  <div>
    <!-- Header Card -->
    <UCard class="mb-6">
      <div class="flex items-center justify-between">
        <div>
          <div class="flex items-center gap-3">
            <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Alert Configuration</h2>
            <UBadge v-if="isDryRunEnabled" color="yellow" variant="subtle">Dry Run Mode</UBadge>
            <UBadge v-else color="green" variant="subtle">Live</UBadge>
          </div>
          <p class="mt-1 text-gray-600 dark:text-gray-400">
            Budget alert thresholds, recipients, and system settings from DynamoDB
          </p>
        </div>
        <div class="flex items-center gap-3">
          <UButton
            color="gray"
            variant="ghost"
            icon="i-heroicons-arrow-path"
            :loading="loading"
            @click="refresh"
          >
            Refresh
          </UButton>
          <div class="p-3 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
            <UIcon name="i-heroicons-cog-6-tooth" class="w-8 h-8 text-orange-600 dark:text-orange-400" />
          </div>
        </div>
      </div>
    </UCard>

    <!-- Loading State -->
    <div v-if="loading && !config" class="space-y-4">
      <USkeleton class="h-32" />
      <USkeleton class="h-48" />
      <USkeleton class="h-64" />
    </div>

    <!-- Error State -->
    <UAlert
      v-else-if="error"
      color="red"
      icon="i-heroicons-exclamation-triangle"
      title="Failed to load configuration"
      :description="error.message || 'Unable to fetch alert configuration from DynamoDB'"
      class="mb-6"
    >
      <template #actions>
        <UButton color="red" variant="soft" @click="refresh">
          Retry
        </UButton>
      </template>
    </UAlert>

    <!-- Configuration Display -->
    <template v-else-if="config">
      <!-- System Status Bar -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <UCard>
          <div class="flex items-center gap-3">
            <div class="p-2 rounded-lg" :class="isDryRunEnabled ? 'bg-yellow-100 dark:bg-yellow-900/30' : 'bg-green-100 dark:bg-green-900/30'">
              <UIcon
                :name="isDryRunEnabled ? 'i-heroicons-beaker' : 'i-heroicons-check-circle'"
                class="w-5 h-5"
                :class="isDryRunEnabled ? 'text-yellow-600 dark:text-yellow-400' : 'text-green-600 dark:text-green-400'"
              />
            </div>
            <div>
              <p class="text-xs text-gray-500 dark:text-gray-400">Mode</p>
              <p class="font-semibold text-gray-900 dark:text-white">{{ isDryRunEnabled ? 'Dry Run' : 'Production' }}</p>
            </div>
          </div>
        </UCard>

        <UCard>
          <div class="flex items-center gap-3">
            <div class="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <UIcon name="i-heroicons-adjustments-horizontal" class="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p class="text-xs text-gray-500 dark:text-gray-400">Alert Levels</p>
              <p class="font-semibold text-gray-900 dark:text-white">{{ alertLevels.length }}</p>
            </div>
          </div>
        </UCard>

        <UCard>
          <div class="flex items-center gap-3">
            <div class="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
              <UIcon name="i-heroicons-user-group" class="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p class="text-xs text-gray-500 dark:text-gray-400">Recipient Configs</p>
              <p class="font-semibold text-gray-900 dark:text-white">{{ recipientsByType.length }}</p>
            </div>
          </div>
        </UCard>

        <UCard>
          <div class="flex items-center gap-3">
            <div class="p-2 rounded-lg" :class="isAnomalyDetectionEnabled ? 'bg-green-100 dark:bg-green-900/30' : 'bg-gray-100 dark:bg-gray-900/30'">
              <UIcon
                name="i-heroicons-chart-bar-square"
                class="w-5 h-5"
                :class="isAnomalyDetectionEnabled ? 'text-green-600 dark:text-green-400' : 'text-gray-400'"
              />
            </div>
            <div>
              <p class="text-xs text-gray-500 dark:text-gray-400">Anomaly Detection</p>
              <p class="font-semibold text-gray-900 dark:text-white">{{ isAnomalyDetectionEnabled ? 'Enabled' : 'Disabled' }}</p>
            </div>
          </div>
        </UCard>
      </div>

      <!-- Configuration Sections Accordion -->
      <UAccordion :items="accordionItems" multiple>
        <!-- Settings Section -->
        <template #settings>
          <SettingsSection :settings="settings" />
        </template>

        <!-- Alert Levels Section -->
        <template #alert-levels>
          <AlertLevelsSection :levels="sortedAlertLevels" />
        </template>

        <!-- Recipients Section -->
        <template #recipients>
          <RecipientsSection
            :recipients-by-type="recipientsByType"
            :static-recipients="staticRecipients"
            :lob-recipients="lobRecipients"
            :account-recipients="accountRecipients"
          />
        </template>

        <!-- Rate Limiting Section -->
        <template #rate-limiting>
          <RateLimitingSection :threshold-scaling="thresholdScaling" :pace-alerting="paceAlerting" :ml-config="mlConfig" />
        </template>

        <!-- Dry Run Section -->
        <template #dry-run>
          <DryRunSection :dry-run="dryRun" />
        </template>

        <!-- Anomaly Detection Section -->
        <template #anomaly-detection>
          <AnomalyDetectionSection
            :anomaly-detection="anomalyDetection"
            :standalone-anomaly-alerts="standaloneAnomalyAlerts"
          />
        </template>
      </UAccordion>
    </template>

    <!-- Empty State -->
    <UCard v-else>
      <div class="text-center py-8">
        <UIcon name="i-heroicons-inbox" class="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">No Configuration Found</h3>
        <p class="text-gray-600 dark:text-gray-400 mb-4">
          The budget alert configuration table appears to be empty.
        </p>
        <UButton @click="refresh">Refresh</UButton>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
/**
 * AlertSettingsPanel - Admin panel for viewing budget alert configuration
 *
 * Displays the complete alert configuration from DynamoDB including:
 * - System settings (email, timezone, business hours)
 * - Alert levels (thresholds, colors, limits)
 * - Recipients (by type, LOB, account)
 * - Rate limiting (threshold scaling, pace alerting)
 * - Dry run mode
 * - Anomaly detection
 */

const {
  config,
  loading,
  error,
  fetchConfig,
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
  anomalyDetection,
  standaloneAnomalyAlerts,
  isDryRunEnabled,
  isAnomalyDetectionEnabled,
  sortedAlertLevels
} = useAlertConfig()

// Fetch config on mount
onMounted(() => {
  fetchConfig()
})

// Refresh function
async function refresh() {
  await fetchConfig()
}

// Accordion items configuration
const accordionItems = [
  {
    label: 'System Settings',
    icon: 'i-heroicons-cog-6-tooth',
    slot: 'settings',
    defaultOpen: true
  },
  {
    label: 'Alert Levels',
    icon: 'i-heroicons-adjustments-horizontal',
    slot: 'alert-levels'
  },
  {
    label: 'Recipients',
    icon: 'i-heroicons-user-group',
    slot: 'recipients'
  },
  {
    label: 'Rate Limiting',
    icon: 'i-heroicons-clock',
    slot: 'rate-limiting'
  },
  {
    label: 'Dry Run Mode',
    icon: 'i-heroicons-beaker',
    slot: 'dry-run'
  },
  {
    label: 'Anomaly Detection',
    icon: 'i-heroicons-chart-bar-square',
    slot: 'anomaly-detection'
  }
]
</script>

