<template>
  <div>
    <!-- Header Card -->
    <UCard class="mb-6">
      <div class="flex items-center justify-between">
        <div>
          <div class="flex items-center gap-3">
            <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Alert Configuration</h2>
            <UBadge color="gray" variant="subtle">Read-Only</UBadge>
          </div>
          <p class="mt-1 text-gray-600 dark:text-gray-400">
            Manage budget alert thresholds, recipients, and system settings
          </p>
        </div>
        <div class="p-3 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
          <UIcon name="i-heroicons-cog-6-tooth" class="w-8 h-8 text-orange-600 dark:text-orange-400" />
        </div>
      </div>
    </UCard>

    <!-- Configuration Categories Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
      <UCard
        v-for="category in configCategories"
        :key="category.name"
        class="hover:shadow-md transition-shadow"
      >
        <div class="flex items-start gap-4">
          <div class="p-3 rounded-lg" :class="category.bgClass">
            <UIcon :name="category.icon" class="w-6 h-6" :class="category.iconClass" />
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1">
              <h3 class="font-medium text-gray-900 dark:text-white">{{ category.name }}</h3>
              <UBadge color="purple" variant="subtle" size="xs">Coming Soon</UBadge>
            </div>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              {{ category.description }}
            </p>
          </div>
        </div>
      </UCard>
    </div>

    <!-- Current Status Section -->
    <UCard>
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-heroicons-information-circle" class="w-5 h-5 text-blue-500" />
          <h3 class="font-semibold text-gray-900 dark:text-white">Current Status</h3>
        </div>
      </template>
      <div class="space-y-4">
        <div class="flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <UIcon name="i-heroicons-database" class="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <div>
            <p class="text-sm text-gray-700 dark:text-gray-300">
              Alert settings are currently stored in the <code class="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs font-mono">budget-alert-config</code> DynamoDB table.
            </p>
            <p class="text-sm text-gray-600 dark:text-gray-400 mt-2">
              Configuration changes require direct database access. Contact your administrator to modify settings.
            </p>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <!-- Configuration Reference -->
          <div class="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
            <div class="flex items-center gap-2 mb-2">
              <UIcon name="i-heroicons-document-text" class="w-5 h-5 text-gray-500" />
              <span class="font-medium text-gray-900 dark:text-white">Configuration Reference</span>
            </div>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              See <code class="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs font-mono">alert_guide.md</code> for complete documentation of all configuration options.
            </p>
          </div>

          <!-- Environment Info -->
          <div class="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
            <div class="flex items-center gap-2 mb-2">
              <UIcon name="i-heroicons-server-stack" class="w-5 h-5 text-gray-500" />
              <span class="font-medium text-gray-900 dark:text-white">Environment</span>
            </div>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              Alert system runs in Commercial AWS (proforma account). Configuration changes take effect immediately.
            </p>
          </div>
        </div>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
/**
 * AlertSettingsPanel - Placeholder component for budget alert configuration management
 *
 * Shows configuration categories that will be editable in a future release.
 * Currently read-only, explaining that settings are stored in DynamoDB.
 */

interface ConfigCategory {
  name: string
  description: string
  icon: string
  bgClass: string
  iconClass: string
}

const configCategories: ConfigCategory[] = [
  {
    name: 'Thresholds & Levels',
    description: 'Alert levels: INFO, WARNING, CRITICAL, ESCALATION thresholds',
    icon: 'i-heroicons-adjustments-horizontal',
    bgClass: 'bg-blue-100 dark:bg-blue-900/30',
    iconClass: 'text-blue-600 dark:text-blue-400'
  },
  {
    name: 'Recipients',
    description: 'Email routing by level, LOB, and account',
    icon: 'i-heroicons-user-group',
    bgClass: 'bg-green-100 dark:bg-green-900/30',
    iconClass: 'text-green-600 dark:text-green-400'
  },
  {
    name: 'Rate Limiting',
    description: 'Max alerts per month, cooldown intervals',
    icon: 'i-heroicons-clock',
    bgClass: 'bg-yellow-100 dark:bg-yellow-900/30',
    iconClass: 'text-yellow-600 dark:text-yellow-400'
  },
  {
    name: 'Dry Run Mode',
    description: 'Test configuration without sending production alerts',
    icon: 'i-heroicons-beaker',
    bgClass: 'bg-purple-100 dark:bg-purple-900/30',
    iconClass: 'text-purple-600 dark:text-purple-400'
  },
  {
    name: 'Anomaly Detection',
    description: 'AWS Cost Anomaly Detection integration',
    icon: 'i-heroicons-chart-bar-square',
    bgClass: 'bg-red-100 dark:bg-red-900/30',
    iconClass: 'text-red-600 dark:text-red-400'
  },
  {
    name: 'Email Theme',
    description: 'Email template colors and branding',
    icon: 'i-heroicons-paint-brush',
    bgClass: 'bg-pink-100 dark:bg-pink-900/30',
    iconClass: 'text-pink-600 dark:text-pink-400'
  }
]
</script>
